const fs = require('fs');
const path = require('path');

/**
 * Extract information from Aura .design files
 */
function extractDesignFile(filePath, content) {
  const fileName = path.basename(filePath);
  const result = {
    path: filePath,
    fileName: fileName,
    fileType: 'design',
    componentName: path.basename(path.dirname(filePath)),
    importFiles: [],
    externalImports: [],
    functions: [],
    classes: []
  };

  // Extract design attributes
  const attributes = [];
  const attrRegex = /<design:attribute\s+([^>]+)\/>/g;
  let match;
  
  while ((match = attrRegex.exec(content)) !== null) {
    const attrStr = match[1];
    const attr = {
      name: extractAttribute(attrStr, 'name'),
      label: extractAttribute(attrStr, 'label'),
      description: extractAttribute(attrStr, 'description'),
      default: extractAttribute(attrStr, 'default'),
      required: extractAttribute(attrStr, 'required') === 'true',
      type: extractAttribute(attrStr, 'type')
    };
    attributes.push(attr);
  }
  
  result.attributes = attributes;
  
  // Extract component label
  const labelMatch = content.match(/<design:component\s+label="([^"]+)"/);
  if (labelMatch) {
    result.componentLabel = labelMatch[1];
  }

  return result;
}

function extractAttribute(str, attrName) {
  const regex = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const match = str.match(regex);
  return match ? match[1] : null;
}

module.exports = { extractDesignFile };

