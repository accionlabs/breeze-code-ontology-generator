/**
 * TypeScript web-route extractor wrapper.
 * Detection logic lives in ../routes-js-core.js (shared with Node.js/JS).
 * Covers NestJS decorators (HTTP / GraphQL / WS / message patterns) plus
 * Express / Fastify / Koa call-based routes written in TypeScript.
 */
const Parser = require("tree-sitter");
const TypeScript = require("tree-sitter-typescript").typescript;
const TSX = require("tree-sitter-typescript").tsx;
const path = require("path");
const { readSource, parseSource } = require("../utils");
const { extractRoutesFromTree } = require("../routes-js-core");

const sharedParser = new Parser();
sharedParser.setLanguage(TypeScript);

// JSX-aware grammar, used only for React-router files: their route configs
// embed JSX (element={<X/>}) which the plain TypeScript grammar mis-parses,
// corrupting the surrounding route objects (children arrays, etc.).
const tsxParser = new Parser();
tsxParser.setLanguage(TSX);

function extractFileRoutes(filePath) {
  try {
    const source = readSource(filePath);
    // React-router files need the JSX-aware grammar. Re-parse them directly
    // (the shared parseSource cache already holds a plain-grammar tree from
    // the function/class extractors that ran first on this file). All other
    // files keep the fast cached path — no perf regression.
    if (/react-router/.test(source)) {
      return extractRoutesFromTree(source, tsxParser.parse(source));
    }
    const { tree } = parseSource(filePath, sharedParser);
    return extractRoutesFromTree(source, tree);
  } catch (e) {
    return [];
  }
}

module.exports = { extractFileRoutes };

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node typescript/extract-routes-typescript.js <File.ts>");
    process.exit(1);
  }
  const routes = extractFileRoutes(path.resolve(target));
  console.log(JSON.stringify(routes, null, 2));
  console.log(`\n${routes.length} route(s) detected.`);
}
