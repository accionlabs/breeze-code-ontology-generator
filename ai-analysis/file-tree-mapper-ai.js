#!/usr/bin/env node
/**
 * AI-Based Salesforce Code Analyzer
 * Usage: node file-tree-mapper-ai.js <repoPath> <outputJson>
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");
const { extractApexClassesAI, extractTriggersAI } = require("./extract-classes-ai");

if (process.argv.length < 4) {
  console.error("Usage: node file-tree-mapper-ai.js <repoPath> <outputJson>");
  process.exit(1);
}

const repoPath = path.resolve(process.argv[2]);
const outputPath = path.resolve(process.argv[3]);

// Get Salesforce files
function getSalesforceFiles() {
  console.log(`🔍 Scanning for Salesforce files in: ${repoPath}`);
  
  const apexClasses = glob.sync(`${repoPath}/**/*.cls`, {
    ignore: [
      `${repoPath}/**/node_modules/**`,
      `${repoPath}/**/.sfdx/**`
    ]
  });
  
  const triggers = glob.sync(`${repoPath}/**/*.trigger`, {
    ignore: [`${repoPath}/**/node_modules/**`]
  });
  
  console.log(`📋 Found ${apexClasses.length} Apex classes`);
  console.log(`⚡ Found ${triggers.length} triggers`);
  
  return { apexClasses, triggers };
}

// Analyze files with AI
async function analyzeWithAI() {
  const { apexClasses, triggers } = getSalesforceFiles();
  const results = [];
  
  console.log(`\n🤖 Starting AI-based analysis...\n`);
  console.log(`⏱️  This will take approximately ${Math.ceil((apexClasses.length + triggers.length) * 3 / 60)} minutes\n`);
  
  const totalFiles = apexClasses.length + triggers.length;
  let processed = 0;
  let errors = 0;
  let totalCost = 0;
  
  // Process Apex classes
  for (const file of apexClasses) {
    processed++;
    const percentage = ((processed / totalFiles) * 100).toFixed(1);
    const fileName = path.relative(repoPath, file);
    
    process.stdout.write(`\r🤖 AI Processing: ${processed}/${totalFiles} (${percentage}%) - ${fileName.substring(0, 50).padEnd(50, ' ')}`);
    
    try {
      const result = await extractApexClassesAI(file, repoPath);
      
      // Estimate cost (rough approximation)
      const fileSize = fs.statSync(file).size;
      const estimatedTokens = Math.ceil(fileSize / 4); // ~4 chars per token
      const cost = (estimatedTokens * 0.01 + 1000 * 0.03) / 1000; // Input + output
      totalCost += cost;
      
      results.push(result);
      
      if (result._error) {
        errors++;
      }
      
      // Rate limiting: wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.log(`\n❌ Error: ${fileName} - ${e.message}`);
      errors++;
    }
  }
  
  // Process triggers
  for (const file of triggers) {
    processed++;
    const percentage = ((processed / totalFiles) * 100).toFixed(1);
    const fileName = path.relative(repoPath, file);
    
    process.stdout.write(`\r🤖 AI Processing: ${processed}/${totalFiles} (${percentage}%) - ${fileName.substring(0, 50).padEnd(50, ' ')}`);
    
    try {
      const result = await extractTriggersAI(file, repoPath);
      results.push(result);
      
      const fileSize = fs.statSync(file).size;
      const estimatedTokens = Math.ceil(fileSize / 4);
      const cost = (estimatedTokens * 0.01 + 500 * 0.03) / 1000;
      totalCost += cost;
      
      if (result._error) {
        errors++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.log(`\n❌ Error: ${fileName} - ${e.message}`);
      errors++;
    }
  }
  
  process.stdout.write('\r' + ' '.repeat(150) + '\r');
  
  // Statistics
  const stats = {
    totalFiles: results.length,
    apexClasses: results.filter(r => r.type === 'apex_class').length,
    triggers: results.filter(r => r.type === 'apex_trigger').length,
    totalClasses: results.reduce((sum, r) => sum + (r.classes?.length || 0), 0),
    totalMethods: results.reduce((sum, r) => 
      sum + (r.classes?.reduce((s, c) => s + (c.methods?.length || 0), 0) || 0), 0),
    invocableMethods: results.reduce((sum, r) => 
      sum + (r.classes?.reduce((s, c) => 
        s + (c.methods?.filter(m => m.isInvocable).length || 0), 0) || 0), 0),
    auraEnabledMethods: results.reduce((sum, r) => 
      sum + (r.classes?.reduce((s, c) => 
        s + (c.methods?.filter(m => m.isAuraEnabled).length || 0), 0) || 0), 0),
    errors: errors,
    estimatedCost: totalCost
  };
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🤖 AI Analysis Complete`);
  console.log(`${'='.repeat(70)}\n`);
  console.log(`📦 Total Files:              ${stats.totalFiles}`);
  console.log(`📝 Apex Classes:             ${stats.apexClasses}`);
  console.log(`⚡ Triggers:                 ${stats.triggers}`);
  console.log(`🏛️  Total Classes:            ${stats.totalClasses}`);
  console.log(`📋 Total Methods:            ${stats.totalMethods}`);
  console.log(`🎯 @InvocableMethod:         ${stats.invocableMethods}`);
  console.log(`⚡ @AuraEnabled:             ${stats.auraEnabledMethods}`);
  console.log(`❌ Errors:                   ${stats.errors}`);
  console.log(`💰 Estimated Cost:           $${stats.estimatedCost.toFixed(2)}`);
  console.log(`\n${'='.repeat(70)}\n`);
  
  return { results, stats };
}

// Main
(async () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🤖 AI-Based Salesforce Code Analyzer`);
  console.log(`${'='.repeat(70)}\n`);
  
  const startTime = Date.now();
  
  try {
    const { results, stats } = await analyzeWithAI();
    
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
    process.exit(1);
  }
})();

