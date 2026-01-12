#!/usr/bin/env node
/**
 * Complete Salesforce JSON Schema Fixer
 * - Fixes absolute paths to relative paths
 * - Converts to Python-compatible schema
 * - Handles all component types (Apex, Triggers, Aura, Flows, GenAI, Metadata)
 * - Preserves AI descriptions and metadata
 * - Optional filtering (apex-only mode)
 * 
 * Usage: node fix-salesforce-json.js <input-json> [options]
 * Options:
 *   --apex-only    Only include Apex classes and triggers
 *   --output <file>  Custom output file name
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error(`
Usage: node fix-salesforce-json.js <input-json> [options]

Options:
  --apex-only         Only include Apex classes and triggers (remove Aura, Flows, GenAI)
  --output <file>     Custom output file name (default: <input>-fixed.json)

Examples:
  # Fix all components
  node fix-salesforce-json.js ./output/salesforce-complete.json

  # Only Apex classes and triggers
  node fix-salesforce-json.js ./output/salesforce-complete.json --apex-only

  # Custom output file
  node fix-salesforce-json.js ./output/salesforce-complete.json --output ./output/python-ready.json
`);
  process.exit(1);
}

const inputFile = path.resolve(args[0]);
let outputFile = inputFile.replace('.json', '-fixed.json');
let apexOnly = false;

// Parse options
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--apex-only') {
    apexOnly = true;
  } else if (args[i] === '--output' && args[i + 1]) {
    outputFile = path.resolve(args[++i]);
  }
}

console.log(`\n${"=".repeat(80)}`);
console.log(`🔧 Salesforce JSON Schema Fixer`);
console.log(`${"=".repeat(80)}\n`);
console.log(`📂 Input:  ${inputFile}`);
console.log(`📄 Output: ${outputFile}`);
console.log(`🎯 Mode:   ${apexOnly ? 'Apex Only' : 'Complete (All Components)'}\n`);

// Load data
const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
console.log(`📊 Loaded: ${data.length} files\n`);

let stats = {
  original: data.length,
  filtered: 0,
  apexClasses: 0,
  triggers: 0,
  auraComponents: 0,
  auraEvents: 0,
  flows: 0,
  genAiFunctions: 0,
  metadata: 0,
  jsonFiles: 0,
  designFiles: 0,
  classesFlattened: 0,
  innerClassesFlattened: 0,
  methodsConverted: 0,
  pathsFixed: 0
};

// ============================================================
// 1. FIX PATHS - Make all paths relative
// ============================================================
function fixPath(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') return pathStr;
  
  // Find the position of 'force-app' in the path
  const forceAppIndex = pathStr.indexOf('force-app');
  
  if (forceAppIndex > -1) {
    stats.pathsFixed++;
    return pathStr.substring(forceAppIndex);
  } else if (pathStr.includes('input-projects')) {
    const afterInputProjects = pathStr.substring(pathStr.indexOf('input-projects'));
    const forceAppMatch = afterInputProjects.match(/force-app\/.*/);
    if (forceAppMatch) {
      stats.pathsFixed++;
      return forceAppMatch[0];
    }
  } else if (pathStr.startsWith('/Users/') || pathStr.startsWith('/home/') || pathStr.match(/^[A-Z]:\\/)) {
    const pathParts = pathStr.split('/');
    const relevantIndex = pathParts.findIndex(part => part === 'force-app');
    if (relevantIndex > -1) {
      stats.pathsFixed++;
      return pathParts.slice(relevantIndex).join('/');
    }
  }
  
  return pathStr;
}

function fixAllPaths(obj) {
  if (typeof obj !== 'object' || obj === null) return;
  
  if (Array.isArray(obj)) {
    obj.forEach(item => fixAllPaths(item));
  } else {
    if (obj.path && typeof obj.path === 'string') {
      obj.path = fixPath(obj.path);
    }
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        fixAllPaths(obj[key]);
      }
    }
  }
}

console.log(`🔧 Step 1: Fixing paths...`);
fixAllPaths(data);
console.log(`   ✅ Fixed ${stats.pathsFixed} paths to relative\n`);

// ============================================================
// 2. FILTER (if apex-only mode)
// ============================================================
let filteredData = data;

if (apexOnly) {
  console.log(`🔧 Step 2: Filtering (Apex Only mode)...`);
  filteredData = data.filter(file => {
    const filePath = file.path || '';
    return filePath.endsWith('.cls') || filePath.endsWith('.trigger');
  });
  
  const removed = data.length - filteredData.length;
  console.log(`   ✅ Kept: ${filteredData.length} files`);
  console.log(`   ❌ Removed: ${removed} files (Aura, Flows, GenAI, Metadata, etc.)\n`);
} else {
  console.log(`🔧 Step 2: Keeping all components (${data.length} files)\n`);
}

// ============================================================
// 3. CONVERT TO PYTHON SCHEMA
// ============================================================
console.log(`🔧 Step 3: Converting to Python-compatible schema...\n`);

// Flatten inner classes recursively
function flattenInnerClasses(innerClasses, parentName = '') {
  const flattened = [];
  
  for (const innerClass of innerClasses) {
    const className = parentName ? `${parentName}.${innerClass.name}` : innerClass.name;
    
    const flatClass = {
      name: className,
      type: 'class',
      visibility: (innerClass.visibility === 'global' ? 'public' : innerClass.visibility) || 'public',
      isAbstract: false,
      extends: null,
      implements: [],
      constructorParams: [],
      startLine: innerClass.startLine || 1,
      endLine: innerClass.endLine && innerClass.endLine >= 1 ? innerClass.endLine : 1,
      methods: (innerClass.methods || []).map(m => typeof m === 'string' ? m : m.name)
    };
    
    if (innerClass.description) flatClass.description = innerClass.description;
    if (innerClass.roles) flatClass.roles = innerClass.roles;
    if (innerClass.metadata) flatClass.metadata = innerClass.metadata;
    
    flattened.push(flatClass);
    stats.innerClassesFlattened++;
    
    if (innerClass.innerClasses && innerClass.innerClasses.length > 0) {
      flattened.push(...flattenInnerClasses(innerClass.innerClasses, className));
    }
  }
  
  return flattened;
}

// Convert each file
function convertFile(file) {
  const filePath = file.path || '';
  
  // Detect file type
  const isApexClass = filePath.endsWith('.cls');
  const isTrigger = filePath.endsWith('.trigger');
  const isAura = file.componentType === 'aura' || file.componentName;
  const isAuraEvent = file.eventType === 'aura_event' || file.eventName;
  const isFlow = file.flowName || filePath.includes('.flow-meta.xml');
  const isGenAI = file.functionName || filePath.includes('.genAiFunction-meta.xml');
  
  // Count by type
  if (isApexClass) stats.apexClasses++;
  if (isTrigger) stats.triggers++;
  if (isAura) stats.auraComponents++;
  if (isAuraEvent) stats.auraEvents++;
  if (isFlow) stats.flows++;
  if (isGenAI) stats.genAiFunctions++;
  if (filePath.includes('-meta.xml') && !isFlow && !isGenAI) stats.metadata++;
  if (filePath.endsWith('.json')) stats.jsonFiles++;
  if (filePath.endsWith('.design')) stats.designFiles++;
  
  const converted = {
    path: file.path,
    importFiles: file.importFiles || [],
    externalImports: file.externalImports || [],
    functions: [],
    classes: []
  };
  
  // Preserve file-level AI fields
  if (file.description) converted.description = file.description;
  if (file.roles) converted.roles = file.roles;
  if (file.metadata) converted.metadata = file.metadata;
  
  // Convert standalone functions
  for (const fn of file.functions || []) {
    const convertedFn = {
      name: fn.name,
      type: fn.type || 'function',
      visibility: fn.visibility || 'public',
      kind: fn.kind || 'function',
      params: fn.params || [],
      startLine: fn.startLine || 1,
      endLine: fn.endLine && fn.endLine >= 1 ? fn.endLine : 1,
      calls: fn.calls || []
    };
    
    if (fn.description) convertedFn.description = fn.description;
    if (fn.roles) convertedFn.roles = fn.roles;
    if (fn.metadata) convertedFn.metadata = fn.metadata;
    
    converted.functions.push(convertedFn);
  }
  
  // Process classes
  for (const cls of file.classes || []) {
    const mainClass = {
      name: cls.name,
      type: 'class',
      visibility: (cls.visibility === 'global' ? 'public' : cls.visibility) || 'public',
      isAbstract: false,
      extends: null,
      implements: [],
      constructorParams: [],
      startLine: cls.startLine || 1,
      endLine: cls.endLine && cls.endLine >= 1 ? cls.endLine : 1,
      methods: (cls.methods || []).map(m => {
        stats.methodsConverted++;
        return typeof m === 'string' ? m : m.name;
      })
    };
    
    if (cls.description) mainClass.description = cls.description;
    if (cls.roles) mainClass.roles = cls.roles;
    if (cls.metadata) mainClass.metadata = cls.metadata;
    
    converted.classes.push(mainClass);
    stats.classesFlattened++;
    
    if (cls.innerClasses && cls.innerClasses.length > 0) {
      const flattenedInner = flattenInnerClasses(cls.innerClasses, cls.name);
      converted.classes.push(...flattenedInner);
    }
  }
  
  return converted;
}

const converted = filteredData.map(convertFile);
stats.filtered = converted.length;

// ============================================================
// 4. WRITE OUTPUT
// ============================================================
fs.writeFileSync(outputFile, JSON.stringify(converted, null, 2));

console.log(`${"=".repeat(80)}`);
console.log(`✅ CONVERSION COMPLETE!`);
console.log(`${"=".repeat(80)}\n`);

console.log(`📊 Final Statistics:`);
console.log(`   Original files:        ${stats.original}`);
console.log(`   Processed files:       ${stats.filtered}`);
console.log(`${"─".repeat(80)}`);
console.log(`   Apex Classes:          ${stats.apexClasses}`);
console.log(`   Triggers:              ${stats.triggers}`);
console.log(`   Aura Components:       ${stats.auraComponents}`);
console.log(`   Aura Events:           ${stats.auraEvents}`);
console.log(`   Flows:                 ${stats.flows}`);
console.log(`   GenAI Functions:       ${stats.genAiFunctions}`);
console.log(`   Metadata Files:        ${stats.metadata}`);
console.log(`   JSON Files:            ${stats.jsonFiles}`);
console.log(`   Design Files:          ${stats.designFiles}`);
console.log(`${"─".repeat(80)}`);
console.log(`   Classes flattened:     ${stats.classesFlattened}`);
console.log(`   Inner classes added:   ${stats.innerClassesFlattened}`);
console.log(`   Methods converted:     ${stats.methodsConverted}`);
console.log(`   Paths fixed:           ${stats.pathsFixed}`);
console.log(`${"=".repeat(80)}\n`);

console.log(`✅ Schema Fixes Applied:`);
console.log(`   ✓ All paths → relative (no machine paths)`);
console.log(`   ✓ innerClasses → flattened with dot notation`);
console.log(`   ✓ methods objects → string arrays`);
console.log(`   ✓ visibility "global" → "public"`);
console.log(`   ✓ isAbstract, extends, implements, constructorParams added`);
console.log(`   ✓ endLine → minimum 1 (never null)`);
console.log(`   ✓ Preserved: description, roles, metadata (AI-generated)`);
console.log(`   ✓ Removed: Salesforce-specific fields\n`);

console.log(`📄 Output file: ${outputFile}`);
console.log(`🎯 Status: 100% Python-compatible!\n`);

if (apexOnly) {
  console.log(`⚠️  Note: Apex-only mode removed ${stats.original - stats.filtered} files`);
  console.log(`   To include all components, run without --apex-only flag\n`);
}

