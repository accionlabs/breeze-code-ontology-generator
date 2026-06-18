/**
 * Angular lazy-mount path composition (cross-file pre-pass).
 *
 * Angular splits a route tree across files: a parent module mounts a feature
 * lazily — `{ path: 'admin', loadChildren: () => import('./admin.module').then(m => m.AdminModule) }`
 * — and the feature's own routes (in its *-routing.module) are declared
 * relative to that mount. The single-file route extractor therefore captures
 * the feature routes as `/`, `/overview`, ... rather than `/admin`,
 * `/admin/overview`, ...
 *
 * This pre-pass parses ONLY the Angular-router files (cheap, a handful per
 * repo), resolves the lazy-mount graph, and returns a map of
 *   routingFile (repo-relative) -> absolute prefix to prepend
 * The main streaming pass applies it to each route's `path` before emit, so no
 * route schema field is added.
 */
const fs = require("fs");
const path = require("path");
const Parser = require("tree-sitter");
const TypeScript = require("tree-sitter-typescript").typescript;
const { parseSource } = require("../utils");
const { extractRoutesFromTree } = require("../routes-js-core");
const { resolveWithAlias } = require("./resolve-path-aliases");

const sharedParser = new Parser();
sharedParser.setLanguage(TypeScript);

// Files worth parsing for the mount graph (skip the rest of the repo).
const NG_ROUTER_MARKER = /@angular\/router|RouterModule|loadChildren|provideRouter|:\s*Routes?\b|Route\[\]/;

// Join an absolute mount prefix with a child path (both may have leading "/").
function joinMount(prefix, child) {
  const c = String(child == null ? "" : child).replace(/^\//, "");
  const b = String(prefix || "").replace(/\/$/, "");
  if (c === "") return b || "/";
  return b + "/" + c;
}

function tryExt(base, repoPath) {
  const exts = [".ts", ".tsx", ".js", ".jsx"];
  if (path.extname(base) && fs.existsSync(base)) return path.relative(repoPath, base);
  for (const e of exts) if (fs.existsSync(base + e)) return path.relative(repoPath, base + e);
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    for (const e of exts) {
      const ip = path.join(base, "index" + e);
      if (fs.existsSync(ip)) return path.relative(repoPath, ip);
    }
  }
  return null;
}

// Resolve an import specifier (alias or relative) to a repo-relative file path.
function resolveImport(fromAbs, spec, pathAliases, repoPath) {
  if (!spec) return null;
  if (spec.startsWith(".")) {
    return tryExt(path.resolve(path.dirname(fromAbs), spec), repoPath);
  }
  return resolveWithAlias(spec, pathAliases, repoPath);
}

// Lightweight import-specifier scan (no parse) for a non-router module file,
// used to hop from a lazily-imported NgModule to its routing module.
function importSpecsOf(fileAbs) {
  let src = "";
  try { src = fs.readFileSync(fileAbs, "utf8"); } catch { return []; }
  const out = [];
  let m;
  const re = /import\b[^;]*?from\s*['"]([^'"]+)['"]/g;
  while ((m = re.exec(src))) out.push(m[1]);
  const re2 = /import\s*['"]([^'"]+)['"]/g;
  while ((m = re2.exec(src))) out.push(m[1]);
  return out;
}

// The dynamic-import specifier inside a route object's line span.
// () => import('@features/admin/admin.module').then(...) -> "@features/admin/admin.module"
function lazySpecifierInRange(source, tree, startLine, endLine) {
  let spec = null;
  const walk = (n) => {
    if (spec) return;
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function");
      const isImport = fn && (fn.type === "import" || source.slice(fn.startIndex, fn.endIndex) === "import");
      const ln = n.startPosition.row + 1;
      if (isImport && ln >= startLine && ln <= endLine) {
        const args = n.childForFieldName("arguments");
        for (let i = 0; args && i < args.namedChildCount; i++) {
          const a = args.namedChild(i);
          if (a.type === "string") {
            spec = source.slice(a.startIndex, a.endIndex).replace(/^['"`]|['"`]$/g, "");
            return;
          }
        }
      }
    }
    for (let i = 0; i < n.childCount; i++) walk(n.child(i));
  };
  walk(tree.rootNode);
  return spec;
}

/**
 * Build a map of routingFile (repo-relative) -> absolute prefix to prepend.
 * Only routing files that are lazily mounted under a non-empty prefix appear.
 */
function buildAngularMountPrefixes(repoPath, tsFiles, pathAliases) {
  // 1. Parse only the Angular-router candidate files.
  const routeHolders = {}; // relPath -> angular routes[]
  const lazyEdges = [];    // { fromAbs, fromRel, prefix, spec }
  for (const file of tsFiles) {
    let content = "";
    try { content = fs.readFileSync(file, "utf8"); } catch { continue; }
    if (!NG_ROUTER_MARKER.test(content)) continue;
    let parsed;
    try { parsed = parseSource(file, sharedParser); } catch { continue; }
    const routes = extractRoutesFromTree(parsed.source, parsed.tree)
      .filter((r) => r.framework === "angular-router");
    if (!routes.length) continue;
    const rel = path.relative(repoPath, file);
    routeHolders[rel] = routes;
    for (const r of routes) {
      if (r.kind !== "lazy") continue;
      const spec = lazySpecifierInRange(parsed.source, parsed.tree, r.startLine, r.endLine);
      lazyEdges.push({ fromAbs: file, fromRel: rel, prefix: r.path, spec });
    }
  }

  // Find the routing file that holds a lazily-imported module's routes:
  // either the imported module file itself, or a *-routing module it imports.
  const routingFileFor = (modRel) => {
    if (routeHolders[modRel]) return modRel;
    const modAbs = path.join(repoPath, modRel);
    for (const spec of importSpecsOf(modAbs)) {
      const t = resolveImport(modAbs, spec, pathAliases, repoPath);
      if (t && routeHolders[t]) return t;
    }
    return null;
  };

  // 2. Resolve lazy edges to child routing files.
  const adj = {};        // parentRel -> [{ child, prefix }]
  const childSet = new Set();
  for (const e of lazyEdges) {
    const modRel = resolveImport(e.fromAbs, e.spec, pathAliases, repoPath);
    if (!modRel) continue;
    const child = routingFileFor(modRel);
    if (!child || child === e.fromRel) continue;
    (adj[e.fromRel] || (adj[e.fromRel] = [])).push({ child, prefix: e.prefix });
    childSet.add(child);
  }

  // 3. Roots = route holders never mounted as a child. Assign prefixes via DFS.
  const prefixMap = {};
  const visited = new Set();
  const dfs = (node, base) => {
    if (visited.has(node)) return; // guard cycles
    visited.add(node);
    for (const { child, prefix } of adj[node] || []) {
      const full = joinMount(base, prefix);
      prefixMap[child] = full;
      dfs(child, full);
    }
  };
  for (const holder of Object.keys(routeHolders)) {
    if (!childSet.has(holder)) dfs(holder, "");
  }

  return { prefixMap, joinMount };
}

module.exports = { buildAngularMountPrefixes, joinMount };
