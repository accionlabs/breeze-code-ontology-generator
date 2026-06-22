/**
 * React Router cross-file mount composition (pre-pass).
 *
 * React splits a route tree across files by importing a child route array and
 * mounting it under a parent path:
 *   // features/admin/routes.tsx
 *   export const adminRoutes: RouteObject[] = [{ path: 'overview', element: <Overview/> }];
 *   // app/router.tsx
 *   import { adminRoutes } from '../features/admin/routes';
 *   createBrowserRouter([{ path: 'admin', children: adminRoutes }]);
 *
 * The single-file extractor captures the child file's routes as '/overview',
 * not '/admin/overview'. This pre-pass parses ONLY the react-router candidate
 * files, resolves the mount graph, and returns a map of
 *   childRoutesFile (repo-relative) -> absolute prefix to prepend
 * The main streaming pass applies it to each react-router route's `path` before
 * emit, so no route schema field is added (mirrors angular-route-mounts.js).
 *
 * Scope: config-object mounts whose `children` (or a spread inside it) is an
 * imported identifier. Child route-array files must import react-router (e.g. a
 * `RouteObject[]` annotation) so the single-file extractor captures them — the
 * same convention Angular relies on for forChild / typed Routes arrays.
 */
const fs = require("fs");
const path = require("path");
const Parser = require("tree-sitter");
const TSX = require("tree-sitter-typescript").tsx; // JSX-aware: React files contain element={<X/>}
const { extractRoutesFromTree } = require("../routes-js-core");
const { resolveWithAlias } = require("./resolve-path-aliases");

const parser = new Parser();
parser.setLanguage(TSX);

// Files worth parsing for the mount graph (skip the rest of the repo).
const REACT_ROUTER_MARKER =
  /react-router|createBrowserRouter|createHashRouter|createMemoryRouter|useRoutes|RouteObject|<Routes\b|<Route\b/;
const REACT_ROUTER_FACTORIES = new Set([
  "createBrowserRouter", "createHashRouter", "createMemoryRouter", "useRoutes",
]);

function text(source, n, limit = 200) {
  return n ? source.slice(n.startIndex, n.endIndex).slice(0, limit) : null;
}
function strip(s) {
  return s == null ? null : s.replace(/^['"`]|['"`]$/g, "");
}
function traverse(node, cb) {
  cb(node);
  for (let i = 0; i < node.childCount; i++) traverse(node.child(i), cb);
}

// Join an absolute mount prefix with a child path (both may have leading "/").
function joinMount(prefix, child) {
  const c = String(child == null ? "" : child).replace(/^\//, "");
  const b = String(prefix || "").replace(/\/$/, "");
  if (c === "") return b || "/";
  return b + "/" + c;
}
// Compose a relative child path onto a base (React child paths are relative).
function joinReactPath(base, child) {
  if (child == null || child === "") return base || "/";
  if (child.startsWith("/")) return child;
  const b = base && base !== "/" ? base.replace(/\/$/, "") : "";
  return b + "/" + child;
}

function getString(source, n) {
  if (!n || n.type !== "string") return null;
  for (let i = 0; i < n.namedChildCount; i++) {
    if (n.namedChild(i).type === "string_fragment") return text(source, n.namedChild(i));
  }
  return strip(text(source, n));
}
function keyName(source, n) {
  return n ? text(source, n).replace(/['"]/g, "") : null;
}
function objectPairValue(source, objNode, key) {
  for (let i = 0; i < objNode.namedChildCount; i++) {
    const pair = objNode.namedChild(i);
    if (pair.type !== "pair") continue;
    if (keyName(source, pair.childForFieldName("key")) === key) return pair.childForFieldName("value");
  }
  return null;
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
  if (spec.startsWith(".")) return tryExt(path.resolve(path.dirname(fromAbs), spec), repoPath);
  return resolveWithAlias(spec, pathAliases, repoPath);
}

// imported local name -> module specifier (alias-aware: `a as b` -> b)
function buildImportMap(root, source) {
  const map = {};
  traverse(root, (n) => {
    if (n.type !== "import_statement") return;
    let spec = null;
    for (let i = 0; i < n.namedChildCount; i++) {
      const c = n.namedChild(i);
      if (c.type === "string") spec = strip(text(source, c));
    }
    if (!spec) return;
    traverse(n, (x) => {
      if (x.type !== "import_specifier") return;
      const alias = x.childForFieldName("alias");
      const name = x.childForFieldName("name");
      const local = alias ? text(source, alias) : name ? text(source, name) : null;
      if (local) map[local] = spec;
    });
  });
  return map;
}

// const routes: RouteObject[] = [...]
function isReactRoutesTypedDecl(source, declaratorNode) {
  for (let i = 0; i < declaratorNode.namedChildCount; i++) {
    const c = declaratorNode.namedChild(i);
    if (c.type === "type_annotation" && /\bRouteObject\b/.test(text(source, c, 60))) return true;
  }
  return false;
}

// Seed route arrays: createBrowserRouter([...]) / useRoutes([...]) / RouteObject[].
function seedArrays(root, source) {
  const arrays = new Set();
  traverse(root, (n) => {
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function");
      if (!fn) return;
      const name = fn.type === "identifier" ? text(source, fn)
        : fn.type === "member_expression" && fn.childForFieldName("property")
          ? text(source, fn.childForFieldName("property")) : null;
      if (name && REACT_ROUTER_FACTORIES.has(name)) {
        const args = n.childForFieldName("arguments");
        const arg = args && args.namedChildCount ? args.namedChild(0) : null;
        if (arg && arg.type === "array") arrays.add(arg);
      }
      return;
    }
    if (n.type === "variable_declarator") {
      const val = n.childForFieldName("value");
      if (val && val.type === "array" && isReactRoutesTypedDecl(source, n)) arrays.add(val);
    }
  });
  return arrays;
}

// Imported identifiers referenced by a `children` value:
//   children: adminRoutes        -> ["adminRoutes"]
//   children: [...pubR, {...}]    -> ["pubR"]
function childSymbols(source, childVal) {
  const syms = [];
  if (!childVal) return syms;
  if (childVal.type === "identifier") {
    syms.push(text(source, childVal, 80));
  } else if (childVal.type === "array") {
    for (let i = 0; i < childVal.namedChildCount; i++) {
      const el = childVal.namedChild(i);
      if (el.type !== "spread_element") continue;
      const inner = el.namedChild(0);
      if (inner && inner.type === "identifier") syms.push(text(source, inner, 80));
    }
  }
  return syms;
}

// Walk a route array, composing paths and collecting { prefix, symbol } edges
// for any `children` (or array spread) that references an imported identifier.
function walkForEdges(source, arrayNode, basePath, edges) {
  for (let i = 0; i < arrayNode.namedChildCount; i++) {
    const el = arrayNode.namedChild(i);
    if (el.type === "spread_element") { // top-level spread: mounted at basePath
      const inner = el.namedChild(0);
      if (inner && inner.type === "identifier") edges.push({ prefix: basePath || "", symbol: text(source, inner, 80) });
      continue;
    }
    if (el.type !== "object") continue;
    const obj = el;
    const indexVal = objectPairValue(source, obj, "index");
    const isIndex = indexVal && indexVal.type === "true";
    const p = getString(source, objectPairValue(source, obj, "path"));
    let full = null;
    if (p != null) full = joinReactPath(basePath, p);
    else if (isIndex) full = basePath || "/";

    const childVal = objectPairValue(source, obj, "children");
    if (!childVal) continue;
    const childBase = full != null ? full : basePath;
    for (const sym of childSymbols(source, childVal)) edges.push({ prefix: childBase, symbol: sym });
    if (childVal.type === "array") walkForEdges(source, childVal, childBase, edges); // inline nested objects
  }
}

/**
 * Build a map of childRoutesFile (repo-relative) -> absolute prefix to prepend.
 * Only route files mounted under a non-empty prefix (transitively) appear.
 */
function buildReactMountPrefixes(repoPath, tsFiles, pathAliases) {
  const routeHolders = {}; // rel -> react routes[]
  const fileEdges = {};    // rel -> [{ prefix, symbol }]
  const fileImports = {};  // rel -> { localName -> spec }

  for (const file of tsFiles) {
    let content = "";
    try { content = fs.readFileSync(file, "utf8"); } catch { continue; }
    if (!REACT_ROUTER_MARKER.test(content)) continue;
    let tree;
    try { tree = parser.parse(content); } catch { continue; }
    const rel = path.relative(repoPath, file);
    const routes = extractRoutesFromTree(content, tree).filter((r) => r.framework === "react-router");
    if (routes.length) routeHolders[rel] = routes;

    const edges = [];
    for (const arr of seedArrays(tree.rootNode, content)) walkForEdges(content, arr, "", edges);
    if (edges.length) {
      fileEdges[rel] = edges;
      fileImports[rel] = buildImportMap(tree.rootNode, content);
    }
  }

  // Resolve mount edges (symbol -> imported file) to a parent -> child graph.
  const adj = {};            // parentRel -> [{ child, prefix }]
  const childSet = new Set();
  for (const [rel, edges] of Object.entries(fileEdges)) {
    const fromAbs = path.join(repoPath, rel);
    const imap = fileImports[rel] || {};
    for (const e of edges) {
      const spec = imap[e.symbol];
      if (!spec) continue; // locally-defined array (already composed in-file) — skip
      const child = resolveImport(fromAbs, spec, pathAliases, repoPath);
      if (!child || !routeHolders[child] || child === rel) continue;
      (adj[rel] || (adj[rel] = [])).push({ child, prefix: e.prefix });
      childSet.add(child);
    }
  }

  // Roots = holders never mounted as a child. Assign prefixes via DFS.
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

module.exports = { buildReactMountPrefixes, joinMount };
