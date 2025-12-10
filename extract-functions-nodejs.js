const Parser = require("tree-sitter");
const JavaScript = require("tree-sitter-javascript");
const fs = require("fs");

function extractFunctionsWithCalls(filePath) {
  const source = fs.readFileSync(filePath, "utf8");

  const parser = new Parser();
  parser.setLanguage(JavaScript);

  const tree = parser.parse(source);
 
  const functions = [];

  traverse(tree.rootNode, (node) => {
    console.log("Node.type***********", node.type)
    if (
      node.type === "function_declaration" ||
      node.type === "function_expression" ||
      node.type === "arrow_function" ||
      node.type === "method_definition"
    ) {
      const funcInfo = extractFunctionInfo(node);
      functions.push(funcInfo);
    }
  });

  return functions;
}

// ---------------------------------------------------------
// Extract a single function info
// ---------------------------------------------------------
function extractFunctionInfo(node) {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const type = node.type;

  const name = getFunctionName(node);
  const calls = extractDirectCalls(node);

  return {
    name,
    type,
    startLine,
    endLine,
    calls
  };
}

// ---------------------------------------------------------
// Identify function name (decl, expression, arrow, method)
// ---------------------------------------------------------
function getFunctionName(node) {
  if (node.type === "function_declaration") {
    const id = node.childForFieldName("name");
    return id ? id.text : null;
  }

  if (node.type === "method_definition") {
    const id = node.childForFieldName("name");
    return id ? id.text : null;
  }

  // arrow + function expressions: find variable assigned
  const parent = node.parent;
  if (parent && parent.type === "variable_declarator") {
    const id = parent.childForFieldName("name");
    return id ? id.text : null;
  }

  // fallback: anonymous
  return null;
}

// ---------------------------------------------------------
// Extract DIRECT calls inside function body
// Ignore callback functions inside argument lists
// ---------------------------------------------------------
function extractDirectCalls(funcNode) {
  const calls = [];

  traverse(funcNode, (node, parent) => {
    if (node.type !== "call_expression") return;

    // Ignore callback: call used as argument of another call
    if (parent && parent.type === "arguments") return;

    const func = node.childForFieldName("function");

    if (!func) return;

    // identifier: foo()
    if (func.type === "identifier") {
      calls.push(func.text);
      return;
    }

    // member_expression: obj.foo()
    if (func.type === "member_expression") {
      const prop = func.childForFieldName("property");
      if (prop) calls.push(prop.text);
      return;
    }
  });

  return calls;
}

// ---------------------------------------------------------
function traverse(node, cb, parent = null) {
  cb(node, parent);
  for (let i = 0; i < node.childCount; i++) {
    traverse(node.child(i), cb, node);
  }
}
// ---------------------------------------------------------

module.exports = { extractFunctionsWithCalls };
