#!/usr/bin/env node
/**
 * Perl Import Analyzer (with package mapper)
 * Usage: node analyze-perl-imports.js <repoPath> <mapperOutput.json> <importsOutput.json>
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");
const Parser = require("tree-sitter");
const Perl = require("tree-sitter-perl");

if (process.argv.length < 5) {
  console.error("Usage: node analyze-perl-imports.js <repoPath> <mapperOutput.json> <importsOutput.json>");
  process.exit(1);
}

const repoPath = path.resolve(process.argv[2]);
const mapperOutput = path.resolve(process.argv[3]);
const importsOutput = path.resolve(process.argv[4]);

// -------------------------------------------------------------
// Initialize parser
// -------------------------------------------------------------
// const parser = new Parser();
// parser.setLanguage(Perl);

// -------------------------------------------------------------
// Helper: recursively traverse AST
// -------------------------------------------------------------
function traverse(node, callback) {
  callback(node);
  for (let i = 0; i < node.namedChildCount; i++) {
    traverse(node.namedChild(i), callback);
  }
}

// -------------------------------------------------------------
// Step 1: Extract package declarations
// -------------------------------------------------------------
function extractPackageNames(filePath, parser) {
    const code = fs.readFileSync(filePath, "utf8").replace(/\0/g, '');
  if(typeof code !== 'string' || !code?.trim()) 
    throw new Error("File does not have data");
  const tree = parser.parse(code);
 
  const packages = [];

  traverse(tree.rootNode, (node) => {
    if (node.type === "package_statement") {
        // console.log("node.namedChildren", node.namedChildren)
      const pkgNode = node.namedChildren.find((n) => n.type === "package");
      if (pkgNode?.text) packages.push(pkgNode.text.trim());
      else packages.push(node.text?.replace("package ", "")?.trim());
    }
  });

  return packages;
}

// -------------------------------------------------------------
// Step 2: Extract imports from AST
// -------------------------------------------------------------
function extractImports(filePath, parser) {
  const code = fs.readFileSync(filePath, "utf8").replace(/\0/g, '');
  if(typeof code !== 'string' || !code?.trim()) 
    throw new Error("File does not have data");
  const tree = parser.parse(code);
  const imports = [];
  const libPaths = [];

  traverse(tree.rootNode, (node) => {
    // --- use statements
    if (node.type === "use_statement") {
        const pkgNode = node.namedChildren.find((n) => n.type === "package");
        if (pkgNode?.text) imports.push(pkgNode.text.trim());
        else imports.push(node.text?.replace("use ", "")?.trim())
    //   const moduleNode = node.namedChildren.find((n) => n.type === "bareword");
    //   const stringNode = node.namedChildren.find((n) => n.type === "string");

    //   if (moduleNode && moduleNode.text === "lib" && stringNode) {
    //     libPaths.push(stringNode.text.replace(/['"]/g, ""));
    //   } else if (moduleNode && moduleNode.text !== "lib") {
    //     imports.push(moduleNode.text);
    //   }
    }

    // --- require statements
    if (node.type === "require_statement") {
        // console.log("node.text require statement", node.text)
        const pkgNode = node.namedChildren.find((n) => n.type === "package");
        if (pkgNode?.text) imports.push(pkgNode.text.trim());
        else imports.push(node.text?.replace("require ", "")?.trim())
    //   const stringNode = node.namedChildren.find((n) => n.type === "string");
    //   const bareNode = node.namedChildren.find((n) => n.type === "bareword");
    //   if (bareNode) imports.push(bareNode.text);
    //   else if (stringNode) imports.push(stringNode.text.replace(/['"]/g, ""));
    }

    // --- do "file.pl"
    if (node.type === "do_statement") {
      const stringNode = node.namedChildren.find((n) => n.type === "string");
      if (stringNode) imports.push(stringNode.text.replace(/['"]/g, ""));
    }

    // --- eval "use Some::Module"
    if (node.type === "eval_expression" || node.type === "eval_block") {
      const text = node.text;
      const match = text.match(/use\s+([\w:]+)/);
      if (match) imports.push(match[1]);
    }
  });

  return { imports, libPaths };
}

// -------------------------------------------------------------
// Step 3: Build package-to-path mapper
// -------------------------------------------------------------
function buildPackageMapper(repoPath) {
    const parser = new Parser();
  parser.setLanguage(Perl);
  parser.parse("")

   const perlFiles = glob.sync(`${repoPath}/**/*.pm`, {
    ignore: ["**/build/**", "**/blib/**", "**/node_modules/**"],
  });
  const mapper = {};
  for (const file of perlFiles) {
    try {
        const packages = extractPackageNames(file, parser);
        for (const pkg of packages) {
      mapper[pkg] = path.relative(repoPath, file);
    }
    } catch (err) {
        console.log("Error analyzing file for mapper", file)
    }
    
    
  }

  return mapper;
}

// -------------------------------------------------------------
// Step 4: Analyze imports for all files
// -------------------------------------------------------------
function analyzeImports(repoPath, mapper) {
    const parser = new Parser();
  parser.setLanguage(Perl);

  const perlFiles = glob.sync(`${repoPath}/**/*.{pm,pl}`, {
    ignore: ["**/build/**", "**/blib/**", "**/node_modules/**"],
  });

  const results = [];

  for (const file of perlFiles) {
    try {
        const { imports, libPaths } = extractImports(file, parser);
    const importFiles = [];
    const externalImports = [];

    for (const imp of imports) {
      // check mapper for internal module
      if (mapper[imp]) {
        importFiles.push(mapper[imp]);
      } else {
        externalImports.push(imp);
      }
    }

    results.push({
      path: path.relative(repoPath, file),
      importFiles: [...new Set(importFiles)],
      externalImports: [...new Set(externalImports)],
      libPaths: [...new Set(libPaths)],
    });
    } catch (e) {
        console.log("error anakysing file", file)
    }
    
  } 

  return results;
}

// -------------------------------------------------------------
// MAIN EXECUTION
// -------------------------------------------------------------
(async () => {
  console.log(`📂 Scanning repo: ${repoPath}`);

  const mapper = buildPackageMapper(repoPath);
  fs.writeFileSync(mapperOutput, JSON.stringify(mapper, null, 2));
  console.log(`✅ Package mapper saved to ${mapperOutput}`);

  const analysis = analyzeImports(repoPath, mapper);
  fs.writeFileSync(importsOutput, JSON.stringify(analysis, null, 2));
  console.log(`✅ Imports analysis saved to ${importsOutput}`);
})();
