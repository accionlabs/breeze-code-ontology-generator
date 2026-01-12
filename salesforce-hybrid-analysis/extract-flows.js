/**
 * Salesforce Flow Extractor
 * Parses Flow XML metadata files
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract Flow information from XML
 */
function extractFlow(flowPath) {
  const flowName = path.basename(flowPath, '.flow-meta.xml');
  const result = {
    name: flowName,
    type: 'flow',
    path: flowPath,
    processType: null,
    startElementReference: null,
    variables: [],
    actions: [],
    decisions: [],
    loops: [],
    apexCalls: []
  };

  try {
    const content = fs.readFileSync(flowPath, 'utf-8');
    
    // Extract process type
    const processTypeMatch = content.match(/<processType>([^<]+)<\/processType>/);
    if (processTypeMatch) {
      result.processType = processTypeMatch[1];
    }
    
    // Extract start element
    const startMatch = content.match(/<startElementReference>([^<]+)<\/startElementReference>/);
    if (startMatch) {
      result.startElementReference = startMatch[1];
    }
    
    // Extract variables
    const variableRegex = /<variables>([\s\S]*?)<\/variables>/g;
    let match;
    while ((match = variableRegex.exec(content)) !== null) {
      const nameMatch = match[1].match(/<name>([^<]+)<\/name>/);
      const typeMatch = match[1].match(/<dataType>([^<]+)<\/dataType>/);
      if (nameMatch) {
        result.variables.push({
          name: nameMatch[1],
          dataType: typeMatch ? typeMatch[1] : null
        });
      }
    }
    
    // Extract action calls (Apex invocations)
    const actionRegex = /<actionCalls>([\s\S]*?)<\/actionCalls>/g;
    while ((match = actionRegex.exec(content)) !== null) {
      const nameMatch = match[1].match(/<name>([^<]+)<\/name>/);
      const actionNameMatch = match[1].match(/<actionName>([^<]+)<\/actionName>/);
      const actionTypeMatch = match[1].match(/<actionType>([^<]+)<\/actionType>/);
      
      if (nameMatch) {
        result.actions.push({
          name: nameMatch[1],
          actionName: actionNameMatch ? actionNameMatch[1] : null,
          actionType: actionTypeMatch ? actionTypeMatch[1] : null
        });
        
        // Track Apex calls specifically
        if (actionTypeMatch && actionTypeMatch[1] === 'apex') {
          result.apexCalls.push(actionNameMatch ? actionNameMatch[1] : null);
        }
      }
    }
    
    // Extract decisions
    const decisionRegex = /<decisions>([\s\S]*?)<\/decisions>/g;
    while ((match = decisionRegex.exec(content)) !== null) {
      const nameMatch = match[1].match(/<name>([^<]+)<\/name>/);
      if (nameMatch) {
        result.decisions.push(nameMatch[1]);
      }
    }
    
    // Extract loops
    const loopRegex = /<loops>([\s\S]*?)<\/loops>/g;
    while ((match = loopRegex.exec(content)) !== null) {
      const nameMatch = match[1].match(/<name>([^<]+)<\/name>/);
      if (nameMatch) {
        result.loops.push(nameMatch[1]);
      }
    }
    
  } catch (error) {
    result.error = error.message;
  }
  
  return result;
}

module.exports = {
  extractFlow
};

