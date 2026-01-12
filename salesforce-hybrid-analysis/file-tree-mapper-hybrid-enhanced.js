#!/usr/bin/env node
/**
 * Enhanced Hybrid Salesforce Code Analyzer
 * Includes: Apex, Triggers, Aura Components, Flows, GenAI Functions
 * Usage: node file-tree-mapper-hybrid-enhanced.js <repoPath> <outputJson> <apiKey>
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");

if (process.argv.length < 4) {
  console.error("Usage: node file-tree-mapper-hybrid-enhanced.js <repoPath> <outputJson> <apiKey>");
  process.exit(1);
}

const repoPath = path.resolve(process.argv[2]);
const outputPath = path.resolve(process.argv[3]);
const apiKey = process.argv[4];

// Set API key BEFORE requiring modules that check for it
if (apiKey) {
  process.env.OPENAI_API_KEY = apiKey;
}

// Now load modules that depend on API key
const { extractApexHybrid, extractTriggerHybrid } = require("./extract-hybrid");
const { extractAuraComponent, extractAuraEvent } = require("./extract-aura-components");
const { extractFlow } = require("./extract-flows");
const { extractGenAIFunction } = require("./extract-genai");

// Get all Salesforce files
function getSalesforceFiles() {
  console.log(`🔍 Scanning for Salesforce components in: ${repoPath}`);
  
  // Apex files
  const apexClasses = glob.sync(`${repoPath}/**/*.cls`, {
    ignore: [`${repoPath}/**/node_modules/**`, `${repoPath}/**/.sfdx/**`]
  });
  
  const triggers = glob.sync(`${repoPath}/**/*.trigger`, {
    ignore: [`${repoPath}/**/node_modules/**`]
  });
  
  // Aura components (scan directories)
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
      
      // Check if it's a component or event
      if (files.some(f => f.endsWith('.cmp'))) {
        auraComponents.push(dirPath);
      } else if (files.some(f => f.endsWith('.evt'))) {
        auraEvents.push(dirPath);
      }
    }
  }
  
  // Flows
  const flows = glob.sync(`${repoPath}/**/flows/**/*.flow-meta.xml`, {
    ignore: [`${repoPath}/**/node_modules/**`]
  });
  
  // GenAI Functions
  const genAiFunctions = glob.sync(`${repoPath}/**/genAiFunctions/**/*.genAiFunction-meta.xml`, {
    ignore: [`${repoPath}/**/node_modules/**`]
  });
  
  console.log(`📋 Apex Classes:       ${apexClasses.length}`);
  console.log(`⚡ Triggers:           ${triggers.length}`);
  console.log(`🎨 Aura Components:    ${auraComponents.length}`);
  console.log(`📡 Aura Events:        ${auraEvents.length}`);
  console.log(`🔄 Flows:              ${flows.length}`);
  console.log(`🤖 GenAI Functions:    ${genAiFunctions.length}`);
  
  return { apexClasses, triggers, auraComponents, auraEvents, flows, genAiFunctions };
}

// Analyze with hybrid approach
async function analyzeHybrid() {
  const { apexClasses, triggers, auraComponents, auraEvents, flows, genAiFunctions } = getSalesforceFiles();
  const results = [];
  
  console.log(`\n🔄 Starting Enhanced Hybrid Analysis...\n`);
  
  const totalFiles = apexClasses.length + triggers.length + auraComponents.length + 
                     auraEvents.length + flows.length + genAiFunctions.length;
  let processed = 0;
  let regexOnly = 0;
  let aiEnhanced = 0;
  let errors = 0;
  let totalCost = 0;
  
  // Process Apex classes
  console.log(`\n📝 Processing Apex Classes...`);
  for (const file of apexClasses) {
    processed++;
    const percentage = ((processed / totalFiles) * 100).toFixed(1);
    const fileName = path.relative(repoPath, file);
    
    process.stdout.write(`\r🔄 ${processed}/${totalFiles} (${percentage}%) - ${fileName.substring(0, 60).padEnd(60, ' ')}   `);
    
    try {
      const result = await extractApexHybrid(file, repoPath);
      
      if (result._source.includes('ai')) {
        aiEnhanced++;
        const fileSize = fs.statSync(file).size;
        const estimatedCost = (fileSize / 4 * 0.01 + 1000 * 0.03) / 1000;
        totalCost += estimatedCost;
      } else {
        regexOnly++;
      }
      
      if (result._error) errors++;
      results.push(result);
      
      if (result._source.includes('ai')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (e) {
      console.log(`\n❌ Error: ${fileName} - ${e.message}`);
      errors++;
    }
  }
  
  // Process triggers
  if (triggers.length > 0) {
    console.log(`\n\n⚡ Processing Triggers...`);
    for (const file of triggers) {
      processed++;
      const percentage = ((processed / totalFiles) * 100).toFixed(1);
      const fileName = path.relative(repoPath, file);
      
      process.stdout.write(`\r🔄 ${processed}/${totalFiles} (${percentage}%) - ${fileName.substring(0, 60).padEnd(60, ' ')}   `);
      
      try {
        const result = await extractTriggerHybrid(file, repoPath);
        results.push(result);
        regexOnly++;
      } catch (e) {
        console.log(`\n❌ Error: ${fileName} - ${e.message}`);
        errors++;
      }
    }
  }
  
  // Process Aura Components
  if (auraComponents.length > 0) {
    console.log(`\n\n🎨 Processing Aura Components...`);
    for (const dir of auraComponents) {
      processed++;
      const percentage = ((processed / totalFiles) * 100).toFixed(1);
      const fileName = path.relative(repoPath, dir);
      
      process.stdout.write(`\r🔄 ${processed}/${totalFiles} (${percentage}%) - ${fileName.substring(0, 60).padEnd(60, ' ')}   `);
      
      try {
        const result = extractAuraComponent(dir);
        results.push(result);
        regexOnly++;
      } catch (e) {
        console.log(`\n❌ Error: ${fileName} - ${e.message}`);
        errors++;
      }
    }
  }
  
  // Process Aura Events
  if (auraEvents.length > 0) {
    console.log(`\n\n📡 Processing Aura Events...`);
    for (const dir of auraEvents) {
      processed++;
      const percentage = ((processed / totalFiles) * 100).toFixed(1);
      const fileName = path.relative(repoPath, dir);
      
      process.stdout.write(`\r🔄 ${processed}/${totalFiles} (${percentage}%) - ${fileName.substring(0, 60).padEnd(60, ' ')}   `);
      
      try {
        const result = extractAuraEvent(dir);
        results.push(result);
        regexOnly++;
      } catch (e) {
        console.log(`\n❌ Error: ${fileName} - ${e.message}`);
        errors++;
      }
    }
  }
  
  // Process Flows
  if (flows.length > 0) {
    console.log(`\n\n🔄 Processing Flows...`);
    for (const file of flows) {
      processed++;
      const percentage = ((processed / totalFiles) * 100).toFixed(1);
      const fileName = path.relative(repoPath, file);
      
      process.stdout.write(`\r🔄 ${processed}/${totalFiles} (${percentage}%) - ${fileName.substring(0, 60).padEnd(60, ' ')}   `);
      
      try {
        const result = extractFlow(file);
        results.push(result);
        regexOnly++;
      } catch (e) {
        console.log(`\n❌ Error: ${fileName} - ${e.message}`);
        errors++;
      }
    }
  }
  
  // Process GenAI Functions
  if (genAiFunctions.length > 0) {
    console.log(`\n\n🤖 Processing GenAI Functions...`);
    for (const file of genAiFunctions) {
      processed++;
      const percentage = ((processed / totalFiles) * 100).toFixed(1);
      const fileName = path.relative(repoPath, file);
      
      process.stdout.write(`\r🔄 ${processed}/${totalFiles} (${percentage}%) - ${fileName.substring(0, 60).padEnd(60, ' ')}   `);
      
      try {
        const result = extractGenAIFunction(file);
        results.push(result);
        regexOnly++;
      } catch (e) {
        console.log(`\n❌ Error: ${fileName} - ${e.message}`);
        errors++;
      }
    }
  }
  
  process.stdout.write('\r' + ' '.repeat(150) + '\r');
  
  // Enhanced statistics
  const stats = {
    totalComponents: results.length,
    apexClasses: results.filter(r => r.type === 'apex_class').length,
    triggers: results.filter(r => r.type === 'apex_trigger').length,
    auraComponents: results.filter(r => r.type === 'aura_component').length,
    auraEvents: results.filter(r => r.type === 'aura_event').length,
    flows: results.filter(r => r.type === 'flow').length,
    genAiFunctions: results.filter(r => r.type === 'genai_function').length,
    regexOnly: regexOnly,
    aiEnhanced: aiEnhanced,
    aiPercentage: ((aiEnhanced / totalFiles) * 100).toFixed(1),
    totalClasses: results.filter(r => r.classes).reduce((sum, r) => sum + (r.classes?.length || 0), 0),
    totalMethods: results.filter(r => r.classes).reduce((sum, r) => 
      sum + (r.classes?.reduce((s, c) => s + (c.methods?.length || 0), 0) || 0), 0),
    totalAuraFunctions: results.filter(r => r.type === 'aura_component').reduce((sum, r) => sum + (r.functions?.length || 0), 0),
    totalFlowActions: results.filter(r => r.type === 'flow').reduce((sum, r) => sum + (r.actions?.length || 0), 0),
    invocableMethods: results.filter(r => r.classes).reduce((sum, r) => 
      sum + (r.classes?.reduce((s, c) => 
        s + (c.methods?.filter(m => m.isInvocable).length || 0), 0) || 0), 0),
    auraEnabledMethods: results.filter(r => r.classes).reduce((sum, r) => 
      sum + (r.classes?.reduce((s, c) => 
        s + (c.methods?.filter(m => m.isAuraEnabled).length || 0), 0) || 0), 0),
    errors: errors,
    estimatedCost: totalCost
  };
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔄 Enhanced Hybrid Analysis Complete`);
  console.log(`${'='.repeat(70)}\n`);
  console.log(`📦 Total Components:     ${stats.totalComponents}`);
  console.log(`   📝 Apex Classes:      ${stats.apexClasses}`);
  console.log(`   ⚡ Triggers:          ${stats.triggers}`);
  console.log(`   🎨 Aura Components:   ${stats.auraComponents}`);
  console.log(`   📡 Aura Events:       ${stats.auraEvents}`);
  console.log(`   🔄 Flows:             ${stats.flows}`);
  console.log(`   🤖 GenAI Functions:   ${stats.genAiFunctions}`);
  console.log(``);
  console.log(`⚡ Regex Only:          ${stats.regexOnly} (${((stats.regexOnly/stats.totalComponents)*100).toFixed(1)}%)`);
  console.log(`🤖 AI Enhanced:         ${stats.aiEnhanced} (${stats.aiPercentage}%)`);
  console.log(``);
  console.log(`🏛️  Code Entities:`);
  console.log(`   Classes:             ${stats.totalClasses}`);
  console.log(`   Methods:             ${stats.totalMethods}`);
  console.log(`   Aura Functions:      ${stats.totalAuraFunctions}`);
  console.log(`   Flow Actions:        ${stats.totalFlowActions}`);
  console.log(``);
  console.log(`🎯 Annotations:`);
  console.log(`   @InvocableMethod:    ${stats.invocableMethods}`);
  console.log(`   @AuraEnabled:        ${stats.auraEnabledMethods}`);
  console.log(``);
  console.log(`❌ Errors:              ${stats.errors}`);
  console.log(`💰 Estimated Cost:      $${stats.estimatedCost.toFixed(2)}`);
  console.log(`\n${'='.repeat(70)}\n`);
  
  return { results, stats };
}

// Main
(async () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔄 Enhanced Hybrid Salesforce Analyzer`);
  console.log(`   Apex + Aura + Flows + GenAI + Triggers`);
  console.log(`${'='.repeat(70)}\n`);
  
  const startTime = Date.now();
  
  try {
    const { results, stats } = await analyzeHybrid();
    
    // Write output
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`✅ Analysis complete in ${duration}s`);
    console.log(`📄 Output written to: ${outputPath}`);
    
    // Write stats
    const statsPath = outputPath.replace('.json', '-stats.json');
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    console.log(`📊 Statistics written to: ${statsPath}\n`);
    
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
})();

