#!/usr/bin/env node
/**
 * COMPLETE Salesforce Code Analyzer - 100% File Coverage
 * Includes: Apex, Triggers, Aura, Flows, GenAI, Metadata XML, JSON, Design files
 * Usage: node file-tree-mapper-complete.js <repoPath> <outputJson> <apiKey>
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");

if (process.argv.length < 4) {
  console.error("Usage: node file-tree-mapper-complete.js <repoPath> <outputJson> [apiKey]");
  process.exit(1);
}

const repoPath = path.resolve(process.argv[2]);
const outputPath = path.resolve(process.argv[3]);
const apiKey = process.argv[4] || process.env.OPENAI_API_KEY;

// Set API key BEFORE requiring modules that check for it
if (apiKey) {
  process.env.OPENAI_API_KEY = apiKey;
}

// Load all extractors
const { extractApexHybrid, extractTriggerHybrid } = require("./extract-hybrid");
const { extractAuraComponent, extractAuraEvent } = require("./extract-aura-components");
const { extractFlow } = require("./extract-flows");
const { extractGenAIFunction } = require("./extract-genai");
const { extractMetadata } = require("./extract-metadata");
const { extractJsonFile } = require("./extract-json-files");
const { extractDesignFile } = require("./extract-design-files");

// Get all Salesforce files (100% coverage)
function getAllSalesforceFiles() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🔍 COMPLETE Salesforce Project Scanner - 100% Coverage`);
  console.log(`${"=".repeat(80)}\n`);
  console.log(`📂 Scanning: ${repoPath}\n`);
  
  // 1. Apex Code Files
  const apexClasses = glob.sync(`${repoPath}/**/*.cls`, {
    ignore: [`${repoPath}/**/node_modules/**`, `${repoPath}/**/.sfdx/**`]
  });
  
  const triggers = glob.sync(`${repoPath}/**/*.trigger`, {
    ignore: [`${repoPath}/**/node_modules/**`]
  });
  
  // 2. Aura Components & Events
  const auraBasePath = path.join(repoPath, 'force-app/main/default/aura');
  let auraComponents = [];
  let auraEvents = [];
  
  if (fs.existsSync(auraBasePath)) {
    const auraDirs = fs.readdirSync(auraBasePath).filter(f => {
      const fullPath = path.join(auraBasePath, f);
      return fs.statSync(fullPath).isDirectory();
    });
    
    for (const dir of auraDirs) {
      const dirPath = path.join(auraBasePath, dir);
      const files = fs.readdirSync(dirPath);
      
      if (files.some(f => f.endsWith('.cmp'))) {
        auraComponents.push(dirPath);
      } else if (files.some(f => f.endsWith('.evt'))) {
        auraEvents.push(dirPath);
      }
    }
  }
  
  // 3. Flows
  const flows = glob.sync(`${repoPath}/**/flows/**/*.flow-meta.xml`, {
    ignore: [`${repoPath}/**/node_modules/**`]
  });
  
  // 4. GenAI Functions
  const genAiFunctions = glob.sync(`${repoPath}/**/genAiFunctions/**/*.genAiFunction-meta.xml`, {
    ignore: [`${repoPath}/**/node_modules/**`]
  });
  
  // 5. Metadata XML Files (excluding flows & genAI already counted)
  const metadataFiles = glob.sync(`${repoPath}/**/*-meta.xml`, {
    ignore: [
      `${repoPath}/**/node_modules/**`,
      `${repoPath}/**/*.flow-meta.xml`,
      `${repoPath}/**/*.genAiFunction-meta.xml`
    ]
  });
  
  // 6. JSON Files
  const jsonFiles = glob.sync(`${repoPath}/**/*.json`, {
    ignore: [
      `${repoPath}/**/node_modules/**`,
      `${repoPath}/**/.sfdx/**`,
      `${repoPath}/**/package-lock.json`
    ]
  });
  
  // 7. Design Files
  const designFiles = glob.sync(`${repoPath}/**/*.design`, {
    ignore: [`${repoPath}/**/node_modules/**`]
  });
  
  console.log(`📊 FILE DISCOVERY RESULTS:`);
  console.log(`${"─".repeat(80)}`);
  console.log(`   📝 Apex Classes:          ${apexClasses.length}`);
  console.log(`   ⚡ Triggers:              ${triggers.length}`);
  console.log(`   🎨 Aura Components:       ${auraComponents.length}`);
  console.log(`   📡 Aura Events:           ${auraEvents.length}`);
  console.log(`   🔄 Flows:                 ${flows.length}`);
  console.log(`   🤖 GenAI Functions:       ${genAiFunctions.length}`);
  console.log(`   📋 Metadata XML Files:    ${metadataFiles.length}`);
  console.log(`   🔧 JSON Files:            ${jsonFiles.length}`);
  console.log(`   🎨 Design Files:          ${designFiles.length}`);
  console.log(`${"─".repeat(80)}`);
  const total = apexClasses.length + triggers.length + auraComponents.length + 
                auraEvents.length + flows.length + genAiFunctions.length +
                metadataFiles.length + jsonFiles.length + designFiles.length;
  console.log(`   📦 TOTAL FILES:           ${total}`);
  console.log(`${"=".repeat(80)}\n`);
  
  return { 
    apexClasses, triggers, auraComponents, auraEvents, 
    flows, genAiFunctions, metadataFiles, jsonFiles, designFiles 
  };
}

// Process all files with hybrid approach
async function analyzeComplete() {
  const startTime = Date.now();
  const { 
    apexClasses, triggers, auraComponents, auraEvents, 
    flows, genAiFunctions, metadataFiles, jsonFiles, designFiles 
  } = getAllSalesforceFiles();
  
  const results = [];
  const stats = {
    totalFiles: 0,
    apexClasses: 0,
    triggers: 0,
    auraComponents: 0,
    auraEvents: 0,
    flows: 0,
    genAiFunctions: 0,
    metadataFiles: 0,
    jsonFiles: 0,
    designFiles: 0,
    regexOnly: 0,
    aiEnhanced: 0,
    errors: 0,
    totalClasses: 0,
    totalMethods: 0,
    totalAuraFunctions: 0,
    totalFlowActions: 0,
    totalMetadataFields: 0,
    invocableMethods: 0,
    auraEnabledMethods: 0,
    estimatedCost: 0
  };
  
  const totalFiles = apexClasses.length + triggers.length + auraComponents.length + 
                     auraEvents.length + flows.length + genAiFunctions.length +
                     metadataFiles.length + jsonFiles.length + designFiles.length;
  
  let processed = 0;
  
  console.log(`🚀 Starting COMPLETE Analysis (100% Coverage)...\n`);
  
  // Process Apex Classes
  for (const file of apexClasses) {
    processed++;
    console.log(`🔄 Processing: ${processed}/${totalFiles} (${((processed/totalFiles)*100).toFixed(1)}%) - ${path.basename(file)}`);
    
    try {
      const result = await extractApexHybrid(file, repoPath);
      results.push(result);
      stats.apexClasses++;
      
      if (result._source === 'regex' || result._source === 'regex_only' || result._source === 'regex_fallback') stats.regexOnly++;
      if (result._enhanced || result._source === 'hybrid') stats.aiEnhanced++;
      
      result.classes?.forEach(cls => {
        stats.totalClasses++;
        if (cls.methods) stats.totalMethods += cls.methods.length;
        if (cls.isInvocable) stats.invocableMethods++;
        if (cls.isAuraEnabled) stats.auraEnabledMethods++;
      });
    } catch (err) {
      console.error(`❌ Error processing ${file}: ${err.message}`);
      stats.errors++;
    }
  }
  
  // Process Triggers
  for (const file of triggers) {
    processed++;
    console.log(`🔄 Processing: ${processed}/${totalFiles} (${((processed/totalFiles)*100).toFixed(1)}%) - ${path.basename(file)}`);
    
    try {
      const result = await extractTriggerHybrid(file, repoPath);
      results.push(result);
      stats.triggers++;
      
      if (result._source === 'regex' || result._source === 'regex_only' || result._source === 'regex_fallback') stats.regexOnly++;
      if (result._enhanced || result._source === 'hybrid') stats.aiEnhanced++;
    } catch (err) {
      console.error(`❌ Error processing ${file}: ${err.message}`);
      stats.errors++;
    }
  }
  
  // Helper function to convert absolute path to relative
  function makeRelativePath(absolutePath) {
    const relativePath = path.relative(repoPath, absolutePath);
    return relativePath;
  }

  // Process Aura Components
  for (const dir of auraComponents) {
    processed++;
    console.log(`🔄 Processing: ${processed}/${totalFiles} (${((processed/totalFiles)*100).toFixed(1)}%) - ${path.basename(dir)}`);
    
    try {
      const result = extractAuraComponent(dir);
      result.path = makeRelativePath(dir);
      results.push(result);
      stats.auraComponents++;
      stats.regexOnly++;
      
      if (result.functions) stats.totalAuraFunctions += result.functions.length;
    } catch (err) {
      console.error(`❌ Error processing ${dir}: ${err.message}`);
      stats.errors++;
    }
  }
  
  // Process Aura Events
  for (const dir of auraEvents) {
    processed++;
    console.log(`🔄 Processing: ${processed}/${totalFiles} (${((processed/totalFiles)*100).toFixed(1)}%) - ${path.basename(dir)}`);
    
    try {
      const result = extractAuraEvent(dir);
      result.path = makeRelativePath(dir);
      results.push(result);
      stats.auraEvents++;
      stats.regexOnly++;
    } catch (err) {
      console.error(`❌ Error processing ${dir}: ${err.message}`);
      stats.errors++;
    }
  }
  
  // Process Flows
  for (const file of flows) {
    processed++;
    console.log(`🔄 Processing: ${processed}/${totalFiles} (${((processed/totalFiles)*100).toFixed(1)}%) - ${path.basename(file)}`);
    
    try {
      const result = extractFlow(file);
      result.path = makeRelativePath(file);
      results.push(result);
      stats.flows++;
      stats.regexOnly++;
      
      if (result.actions) stats.totalFlowActions += result.actions.length;
    } catch (err) {
      console.error(`❌ Error processing ${file}: ${err.message}`);
      stats.errors++;
    }
  }
  
  // Process GenAI Functions
  for (const file of genAiFunctions) {
    processed++;
    console.log(`🔄 Processing: ${processed}/${totalFiles} (${((processed/totalFiles)*100).toFixed(1)}%) - ${path.basename(file)}`);
    
    try {
      const result = extractGenAIFunction(file);
      result.path = makeRelativePath(file);
      results.push(result);
      stats.genAiFunctions++;
      stats.regexOnly++;
    } catch (err) {
      console.error(`❌ Error processing ${file}: ${err.message}`);
      stats.errors++;
    }
  }
  
  // Process Metadata XML Files
  for (const file of metadataFiles) {
    processed++;
    console.log(`🔄 Processing: ${processed}/${totalFiles} (${((processed/totalFiles)*100).toFixed(1)}%) - ${path.basename(file)}`);
    
    try {
      const content = fs.readFileSync(file, 'utf8');
      const result = extractMetadata(file, content);
      result.path = makeRelativePath(file);
      results.push(result);
      stats.metadataFiles++;
      stats.regexOnly++;
      
      if (result.fields) stats.totalMetadataFields += result.fields.length;
    } catch (err) {
      console.error(`❌ Error processing ${file}: ${err.message}`);
      stats.errors++;
    }
  }
  
  // Process JSON Files
  for (const file of jsonFiles) {
    processed++;
    console.log(`🔄 Processing: ${processed}/${totalFiles} (${((processed/totalFiles)*100).toFixed(1)}%) - ${path.basename(file)}`);
    
    try {
      const content = fs.readFileSync(file, 'utf8');
      const result = extractJsonFile(file, content);
      result.path = makeRelativePath(file);
      results.push(result);
      stats.jsonFiles++;
      stats.regexOnly++;
    } catch (err) {
      console.error(`❌ Error processing ${file}: ${err.message}`);
      stats.errors++;
    }
  }
  
  // Process Design Files
  for (const file of designFiles) {
    processed++;
    console.log(`🔄 Processing: ${processed}/${totalFiles} (${((processed/totalFiles)*100).toFixed(1)}%) - ${path.basename(file)}`);
    
    try {
      const content = fs.readFileSync(file, 'utf8');
      const result = extractDesignFile(file, content);
      result.path = makeRelativePath(file);
      results.push(result);
      stats.designFiles++;
      stats.regexOnly++;
    } catch (err) {
      console.error(`❌ Error processing ${file}: ${err.message}`);
      stats.errors++;
    }
  }
  
  // Calculate final stats
  stats.totalFiles = results.length;
  stats.aiPercentage = ((stats.aiEnhanced / stats.totalFiles) * 100).toFixed(1);
  stats.estimatedCost = stats.aiEnhanced * 0.003; // Rough estimate
  
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Print summary
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 COMPLETE Analysis Summary`);
  console.log(`${"=".repeat(80)}`);
  console.log(`📦 Total Files:          ${stats.totalFiles}`);
  console.log(`⚡ Regex Only:           ${stats.regexOnly} (${((stats.regexOnly/stats.totalFiles)*100).toFixed(1)}%)`);
  console.log(`🤖 AI Enhanced:          ${stats.aiEnhanced} (${stats.aiPercentage}%)`);
  console.log(`${"─".repeat(80)}`);
  console.log(`📝 Apex Classes:         ${stats.apexClasses}`);
  console.log(`⚡ Triggers:             ${stats.triggers}`);
  console.log(`🎨 Aura Components:      ${stats.auraComponents}`);
  console.log(`📡 Aura Events:          ${stats.auraEvents}`);
  console.log(`🔄 Flows:                ${stats.flows}`);
  console.log(`🤖 GenAI Functions:      ${stats.genAiFunctions}`);
  console.log(`📋 Metadata XML:         ${stats.metadataFiles}`);
  console.log(`🔧 JSON Files:           ${stats.jsonFiles}`);
  console.log(`🎨 Design Files:         ${stats.designFiles}`);
  console.log(`${"─".repeat(80)}`);
  console.log(`🏛️  Total Classes:        ${stats.totalClasses}`);
  console.log(`📋 Total Methods:        ${stats.totalMethods}`);
  console.log(`🎯 @InvocableMethod:     ${stats.invocableMethods}`);
  console.log(`⚡ @AuraEnabled:         ${stats.auraEnabledMethods}`);
  console.log(`🎨 Aura Functions:       ${stats.totalAuraFunctions}`);
  console.log(`🔄 Flow Actions:         ${stats.totalFlowActions}`);
  console.log(`📋 Metadata Fields:      ${stats.totalMetadataFields}`);
  console.log(`❌ Errors:               ${stats.errors}`);
  console.log(`💰 Estimated Cost:       $${stats.estimatedCost.toFixed(2)}`);
  console.log(`${"=".repeat(80)}`);
  console.log(`✅ Analysis complete in ${elapsedTime}s`);
  console.log(`📄 Output written to: ${outputPath}`);
  
  // Write results
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  // Write stats
  const statsPath = outputPath.replace('.json', '-stats.json');
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  console.log(`📊 Statistics written to: ${statsPath}`);
  console.log(`${"=".repeat(80)}\n`);
  
  return stats;
}

// Run analysis
analyzeComplete().catch(err => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});

