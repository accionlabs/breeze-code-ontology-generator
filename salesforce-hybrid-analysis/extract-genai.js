/**
 * Salesforce GenAI Component Extractor
 * Parses GenAI Functions, Planners, and Plugins
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract GenAI Function information
 */
function extractGenAIFunction(functionPath) {
  const functionName = path.basename(path.dirname(functionPath));
  const result = {
    name: functionName,
    type: 'genai_function',
    path: functionPath,
    description: null,
    inputSchema: null,
    outputSchema: null,
    apexClass: null
  };

  try {
    const content = fs.readFileSync(functionPath, 'utf-8');
    
    // Extract description
    const descMatch = content.match(/<description>([^<]+)<\/description>/);
    if (descMatch) {
      result.description = descMatch[1];
    }
    
    // Extract Apex class reference
    const apexMatch = content.match(/<apexClass>([^<]+)<\/apexClass>/);
    if (apexMatch) {
      result.apexClass = apexMatch[1];
    }
    
    // Read input schema if exists
    const inputSchemaPath = path.join(path.dirname(functionPath), 'input', 'schema.json');
    if (fs.existsSync(inputSchemaPath)) {
      try {
        result.inputSchema = JSON.parse(fs.readFileSync(inputSchemaPath, 'utf-8'));
      } catch (e) {
        result.inputSchema = { error: e.message };
      }
    }
    
    // Read output schema if exists
    const outputSchemaPath = path.join(path.dirname(functionPath), 'output', 'schema.json');
    if (fs.existsSync(outputSchemaPath)) {
      try {
        result.outputSchema = JSON.parse(fs.readFileSync(outputSchemaPath, 'utf-8'));
      } catch (e) {
        result.outputSchema = { error: e.message };
      }
    }
    
  } catch (error) {
    result.error = error.message;
  }
  
  return result;
}

module.exports = {
  extractGenAIFunction
};

