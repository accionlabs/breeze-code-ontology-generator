const fs = require('fs');
const path = require('path');

/**
 * Extract information from JSON files (GenAI schemas, config files)
 */
function extractJsonFile(filePath, content) {
  const fileName = path.basename(filePath);
  const result = {
    path: filePath,
    fileName: fileName,
    fileType: 'json',
    importFiles: [],
    externalImports: [],
    functions: [],
    classes: []
  };

  try {
    const jsonData = JSON.parse(content);
    
    // Detect JSON type and extract relevant info
    if (jsonData.type === 'object' && jsonData.properties) {
      // JSON Schema
      result.jsonType = 'schema';
      result.schemaType = jsonData.type;
      result.properties = Object.keys(jsonData.properties || {});
      result.required = jsonData.required || [];
      
    } else if (jsonData.inputs || jsonData.outputs) {
      // GenAI function schema
      result.jsonType = 'genai_schema';
      result.inputs = jsonData.inputs ? Object.keys(jsonData.inputs) : [];
      result.outputs = jsonData.outputs ? Object.keys(jsonData.outputs) : [];
      
    } else if (jsonData.packageDirectories) {
      // sfdx-project.json
      result.jsonType = 'sfdx_project';
      result.packageDirectories = jsonData.packageDirectories;
      result.namespace = jsonData.namespace;
      result.sourceApiVersion = jsonData.sourceApiVersion;
      
    } else {
      // Generic JSON config
      result.jsonType = 'config';
      result.keys = Object.keys(jsonData);
    }
    
    result.jsonContent = jsonData;
    
  } catch (e) {
    result.parseError = e.message;
  }

  return result;
}

module.exports = { extractJsonFile };

