/**
 * Aura Component Extractor
 * Parses Aura Lightning components (.cmp, .js controller/helper, .evt)
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract Aura component information
 */
function extractAuraComponent(componentDir) {
  const componentName = path.basename(componentDir);
  const result = {
    name: componentName,
    type: 'aura_component',
    path: componentDir,
    files: {},
    functions: [],
    events: [],
    attributes: [],
    handlers: []
  };

  try {
    // Read component files
    const files = fs.readdirSync(componentDir);
    
    for (const file of files) {
      const filePath = path.join(componentDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Parse .cmp (component markup)
      if (file.endsWith('.cmp')) {
        result.files.markup = file;
        // Extract attributes
        const attrRegex = /<aura:attribute\s+name="([^"]+)"\s+type="([^"]+)"[^>]*>/g;
        let match;
        while ((match = attrRegex.exec(content)) !== null) {
          result.attributes.push({
            name: match[1],
            type: match[2]
          });
        }
        
        // Extract event handlers
        const handlerRegex = /<aura:handler\s+name="([^"]+)"[^>]*action="\{!c\.([^}]+)\}"[^>]*>/g;
        while ((match = handlerRegex.exec(content)) !== null) {
          result.handlers.push({
            event: match[1],
            action: match[2]
          });
        }
      }
      
      // Parse Controller.js
      if (file.endsWith('Controller.js')) {
        result.files.controller = file;
        // Extract controller functions
        const funcRegex = /(\w+)\s*:\s*function\s*\(([^)]*)\)/g;
        let match;
        while ((match = funcRegex.exec(content)) !== null) {
          result.functions.push({
            name: match[1],
            type: 'controller_function',
            params: match[2].split(',').map(p => p.trim()).filter(p => p),
            file: 'controller'
          });
        }
      }
      
      // Parse Helper.js
      if (file.endsWith('Helper.js')) {
        result.files.helper = file;
        // Extract helper functions
        const funcRegex = /(\w+)\s*:\s*function\s*\(([^)]*)\)/g;
        let match;
        while ((match = funcRegex.exec(content)) !== null) {
          result.functions.push({
            name: match[1],
            type: 'helper_function',
            params: match[2].split(',').map(p => p.trim()).filter(p => p),
            file: 'helper'
          });
        }
      }
      
      // Check for CSS
      if (file.endsWith('.css')) {
        result.files.style = file;
      }
      
      // Check for design
      if (file.endsWith('.design')) {
        result.files.design = file;
      }
    }
    
  } catch (error) {
    result.error = error.message;
  }
  
  return result;
}

/**
 * Extract Aura event information
 */
function extractAuraEvent(eventDir) {
  const eventName = path.basename(eventDir);
  const result = {
    name: eventName,
    type: 'aura_event',
    path: eventDir,
    attributes: []
  };

  try {
    const files = fs.readdirSync(eventDir);
    const evtFile = files.find(f => f.endsWith('.evt'));
    
    if (evtFile) {
      const content = fs.readFileSync(path.join(eventDir, evtFile), 'utf-8');
      
      // Extract event attributes
      const attrRegex = /<aura:attribute\s+name="([^"]+)"\s+type="([^"]+)"[^>]*>/g;
      let match;
      while ((match = attrRegex.exec(content)) !== null) {
        result.attributes.push({
          name: match[1],
          type: match[2]
        });
      }
    }
  } catch (error) {
    result.error = error.message;
  }
  
  return result;
}

module.exports = {
  extractAuraComponent,
  extractAuraEvent
};

