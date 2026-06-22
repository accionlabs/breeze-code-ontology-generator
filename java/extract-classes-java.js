const Parser = require("tree-sitter");
const Java = require("tree-sitter-java");
const fs = require("fs");
const path = require("path");
const { parseSource } = require("../utils");
const { collectQueryStatements } = require("./extract-functions-java");

const sharedParser = new Parser();
sharedParser.setLanguage(Java);

function extractClasses(filePath, repoPath = null, captureStatements = false) {
  const { source, tree } = parseSource(filePath, sharedParser);

  const classes = [];

  traverse(tree.rootNode, (node) => {
    if (node.type === "class_declaration" || node.type === "interface_declaration" || node.type === "record_declaration" || node.type === "enum_declaration" || node.type === "annotation_type_declaration") {
      const classInfo = extractClassInfo(node, filePath, repoPath, source, captureStatements);
      if (classInfo?.name) {
        classes.push(classInfo);
      }
    }
  });

  return classes;
}

// tree-sitter-Java class-body node names. Earlier values were tree-sitter-JavaScript
// names (lexical_declaration / variable_declaration / public_field_definition) that
// never match the Java grammar, so class fields silently dropped (report gap G5). Java
// class bodies hold field_declaration; nested enums are emitted as their own enum type
// nodes (like nested classes/records), so they aren't also listed here as statements.
const CLASS_STATEMENT_TYPES = ["field_declaration"];

// The node whose named children are a type's member declarations (methods, fields,
// nested types). For enums these live in the trailing `enum_body_declarations` block,
// not directly on `enum_body` (whose leading children are the `enum_constant`s). For
// classes/interfaces/records the body itself is the member container.
function memberContainer(body) {
  if (!body) return null;
  if (body.type === "enum_body") {
    for (let i = 0; i < body.namedChildCount; i++) {
      if (body.namedChild(i).type === "enum_body_declarations") return body.namedChild(i);
    }
    return null; // enum declaring only constants
  }
  return body;
}

// Name for a class-body statement. enum_declaration exposes a direct `name` field;
// field_declaration does not — each declared variable lives in a `variable_declarator`,
// and one declaration may declare several (e.g. `int a, b;`), so join their names.
function classStatementName(child, source) {
  const nameNode = child.childForFieldName("name");
  if (nameNode) return source.slice(nameNode.startIndex, nameNode.endIndex);

  if (child.type === "field_declaration") {
    const names = [];
    for (let i = 0; i < child.namedChildCount; i++) {
      const d = child.namedChild(i);
      if (d.type !== "variable_declarator") continue;
      const n = d.childForFieldName("name");
      if (n) names.push(source.slice(n.startIndex, n.endIndex));
    }
    return names.length ? names.join(", ") : null;
  }

  return null;
}

function pushStatement(statements, child, source) {
  statements.push({
    type: child.type,
    name: classStatementName(child, source),
    text: source.slice(child.startIndex, child.endIndex),
    startLine: child.startPosition.row + 1,
    endLine: child.endPosition.row + 1,
  });
}

function extractClassStatements(node, source) {
  const body = node.childForFieldName("body");
  if (!body) return [];

  const statements = [];

  // Enum constants sit directly on enum_body, ahead of the member declarations.
  if (body.type === "enum_body") {
    for (let i = 0; i < body.namedChildCount; i++) {
      const child = body.namedChild(i);
      if (child.type === "enum_constant") pushStatement(statements, child, source);
    }
  }

  const container = memberContainer(body);
  if (container) {
    for (let i = 0; i < container.namedChildCount; i++) {
      const child = container.namedChild(i);
      if (CLASS_STATEMENT_TYPES.includes(child.type)) pushStatement(statements, child, source);
    }
  }

  collectQueryStatements(node, source, statements);
  return statements;
}

function traverse(node, cb) {
  cb(node);
  for (let i = 0; i < node.childCount; i++) {
    traverse(node.child(i), cb);
  }
}

function extractClassInfo(node, filePath, repoPath = null, source, captureStatements = false) {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;

  const name = getClassName(node, source);
  const superClass = getSuperClassName(node, source);
  const interfaces = getImplementedInterfaces(node, source);
  const isInterface = node.type === "interface_declaration";
  const isRecord = node.type === "record_declaration";
  const isEnum = node.type === "enum_declaration";
  const isAnnotation = node.type === "annotation_type_declaration";

  const members = extractClassMembers(node, source);
  const methods = members.methods;
  let constructorParams = members.constructorParams;

  // A record's components ARE its canonical constructor parameters; they live on the
  // record header's `parameters` node, not in the body (unless a canonical constructor
  // is written out explicitly, in which case extractClassMembers already found it).
  if (isRecord && constructorParams.length === 0) {
    const paramsNode = node.childForFieldName("parameters");
    if (paramsNode) constructorParams = extractParameterNames(paramsNode, source);
  }

  const { visibility, isAbstract } = getClassModifiers(node, source);
  const decorators = extractDecorators(node, source);
  const generics = extractGenerics(node, source);

  const statements = captureStatements ? extractClassStatements(node, source) : [];

  return {
    name,
    type: isInterface ? "interface" : isRecord ? "record" : isEnum ? "enum" : isAnnotation ? "annotation" : "class",
    visibility,
    isAbstract,
    generics,
    extends: superClass,
    implements: interfaces,
    decorators,
    constructorParams,
    methods,
    statements,
    startLine,
    endLine
  };
}

function extractDecorators(node, source) {
  const decorators = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === "modifiers") {
      for (let j = 0; j < child.childCount; j++) {
        const modifier = child.child(j);
        if (modifier.type === "marker_annotation" || modifier.type === "annotation") {
          decorators.push(source.slice(modifier.startIndex, modifier.endIndex));
        }
      }
    }
  }
  return decorators;
}

function getClassName(node, source) {
  const nameNode = node.childForFieldName("name");
  return nameNode ? source.slice(nameNode.startIndex, nameNode.endIndex) : null;
}

// Raw type-parameter text for a type declaration, e.g. "<T extends Comparable<? super T>>"
// (gap G4). Stored as a string under `generics` to match the TypeScript extractor's
// field; the Java grammar uses the same `type_parameters` node name.
function extractGenerics(node, source) {
  const typeParams = node.childForFieldName("type_parameters");
  if (typeParams) return source.slice(typeParams.startIndex, typeParams.endIndex);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === "type_parameters") return source.slice(child.startIndex, child.endIndex);
  }
  return null;
}

function getSuperClassName(node, source) {
  const superclassNode = node.childForFieldName("superclass");
  if (!superclassNode) return null;

  // The superclass node contains "extends ClassName", we need to get the type
  for (let i = 0; i < superclassNode.childCount; i++) {
    const child = superclassNode.child(i);
    if (child.type === "type_identifier") {
      return source.slice(child.startIndex, child.endIndex);
    }
  }

  return null;
}

function getImplementedInterfaces(node, source) {
  const interfacesNode = node.childForFieldName("interfaces");
  if (!interfacesNode) return [];

  const interfaces = [];

  traverse(interfacesNode, (n) => {
    if (n.type === "type_identifier") {
      interfaces.push(source.slice(n.startIndex, n.endIndex));
    }
  });

  return interfaces;
}

function getClassModifiers(node, source) {
  let visibility = "package"; // Java default
  let isAbstract = false;

  // Look through all children for modifiers
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    if (child.type === "modifiers") {
      // Iterate through modifier tokens
      for (let j = 0; j < child.childCount; j++) {
        const modifier = child.child(j);
        const modText = source.slice(modifier.startIndex, modifier.endIndex);

        if (modText === "public") {
          visibility = "public";
        } else if (modText === "private") {
          visibility = "private";
        } else if (modText === "protected") {
          visibility = "protected";
        } else if (modText === "abstract") {
          isAbstract = true;
        }
      }
    }
  }

  return { visibility, isAbstract };
}

function extractClassMembers(classNode, source) {
  const container = memberContainer(classNode.childForFieldName("body"));
  if (!container) {
    return { constructorParams: [], methods: [] };
  }

  const methods = [];
  let constructorParams = [];

  for (let i = 0; i < container.childCount; i++) {
    const member = container.child(i);
    if (!member.isNamed) continue;

    // Constructor
    if (member.type === "constructor_declaration") {
      const paramsNode = member.childForFieldName("parameters");
      if (paramsNode) {
        constructorParams = extractParameterNames(paramsNode, source);
      }
      continue;
    }

    // Methods - just extract names. annotation_type_element_declaration is the
    // @interface element form (`String value() default ""`); it's method-like, so
    // its name belongs in methods[] (otherwise annotation elements vanish — gap G2).
    if (member.type === "method_declaration" || member.type === "annotation_type_element_declaration") {
      const nameNode = member.childForFieldName("name");
      if (nameNode) {
        methods.push(source.slice(nameNode.startIndex, nameNode.endIndex));
      }
    }
  }

  return { constructorParams, methods };
}

function extractParameterNames(paramsNode, source) {
  const params = [];

  for (let i = 0; i < paramsNode.childCount; i++) {
    const child = paramsNode.child(i);

    if (!child.isNamed) continue;

    if (child.type === "formal_parameter") {
      const nameNode = child.childForFieldName("name");
      if (nameNode) {
        params.push(source.slice(nameNode.startIndex, nameNode.endIndex));
      }
    } else if (child.type === "spread_parameter") {
      // Handle varargs
      const nameNode = child.childForFieldName("name");
      if (nameNode) {
        params.push("..." + source.slice(nameNode.startIndex, nameNode.endIndex));
      }
    }
  }

  return params;
}

function extractFieldInfo(node, source) {
  const fields = [];

  // Get modifiers for all fields in this declaration
  let visibility = "package";
  let isStatic = false;
  let isFinal = false;

  // Look through children for modifiers
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);

    if (child.type === "modifiers") {
      // Iterate through modifier tokens
      for (let j = 0; j < child.childCount; j++) {
        const modifier = child.child(j);
        const modText = source.slice(modifier.startIndex, modifier.endIndex);

        if (modText === "public") {
          visibility = "public";
        } else if (modText === "private") {
          visibility = "private";
        } else if (modText === "protected") {
          visibility = "protected";
        } else if (modText === "static") {
          isStatic = true;
        } else if (modText === "final") {
          isFinal = true;
        }
      }
    }
  }

  // Get type
  const typeNode = node.childForFieldName("type");
  const fieldType = typeNode ? source.slice(typeNode.startIndex, typeNode.endIndex) : "unknown";

  // Get declarators (can have multiple: int a, b, c;)
  const declaratorNode = node.childForFieldName("declarator");
  if (declaratorNode) {
    const fieldInfo = extractDeclarator(declaratorNode, source, fieldType, visibility, isStatic, isFinal);
    if (fieldInfo) {
      fields.push(fieldInfo);
    }
  }

  // Check for additional declarators
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === "variable_declarator" && child !== declaratorNode) {
      const fieldInfo = extractDeclarator(child, source, fieldType, visibility, isStatic, isFinal);
      if (fieldInfo) {
        fields.push(fieldInfo);
      }
    }
  }

  return fields;
}

function extractDeclarator(node, source, fieldType, visibility, isStatic, isFinal) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return null;

  const name = source.slice(nameNode.startIndex, nameNode.endIndex);

  // Check if it has a default value
  const valueNode = node.childForFieldName("value");
  const hasDefault = valueNode !== null;

  return {
    name,
    type: fieldType,
    visibility,
    isStatic,
    isFinal,
    hasDefault
  };
}


module.exports = { extractClasses };
