#!/usr/bin/env node
/**
 * Compare Regex vs AI-based parsing outputs
 */

const fs = require("fs");
const path = require("path");

if (process.argv.length < 4) {
  console.error("Usage: node compare-outputs.js <regexJson> <aiJson>");
  process.exit(1);
}

const regexPath = path.resolve(process.argv[2]);
const aiPath = path.resolve(process.argv[3]);

// Load JSON files
const regexData = JSON.parse(fs.readFileSync(regexPath, 'utf-8'));
const aiData = JSON.parse(fs.readFileSync(aiPath, 'utf-8'));

// Create maps for easy lookup
const regexMap = new Map(regexData.map(item => [item.path, item]));
const aiMap = new Map(aiData.map(item => [item.path, item]));

// Comparison results
const comparison = {
  summary: {
    regexFiles: regexData.length,
    aiFiles: aiData.length,
    matchingFiles: 0,
    onlyInRegex: [],
    onlyInAI: [],
    aiErrors: 0
  },
  detailedComparison: [],
  accuracyMetrics: {
    classNameMatch: 0,
    methodCountMatch: 0,
    annotationMatch: 0,
    totalComparisons: 0
  }
};

// Find files in each
regexData.forEach(item => {
  if (!aiMap.has(item.path)) {
    comparison.summary.onlyInRegex.push(item.path);
  }
});

aiData.forEach(item => {
  if (!regexMap.has(item.path)) {
    comparison.summary.onlyInAI.push(item.path);
  }
  if (item._error) {
    comparison.summary.aiErrors++;
  }
});

// Compare matching files
regexData.forEach(regexItem => {
  const aiItem = aiMap.get(regexItem.path);
  
  if (!aiItem) return;
  
  comparison.summary.matchingFiles++;
  
  const fileComparison = {
    path: regexItem.path,
    regex: {
      classes: regexItem.classes?.length || 0,
      methods: regexItem.classes?.reduce((sum, c) => sum + (c.methods?.length || 0), 0) || 0,
      invocable: regexItem.classes?.reduce((sum, c) => 
        sum + (c.methods?.filter(m => m.isInvocable).length || 0), 0) || 0,
      auraEnabled: regexItem.classes?.reduce((sum, c) => 
        sum + (c.methods?.filter(m => m.isAuraEnabled).length || 0), 0) || 0,
      sobjects: regexItem.sobjects?.length || 0
    },
    ai: {
      classes: aiItem.classes?.length || 0,
      methods: aiItem.classes?.reduce((sum, c) => sum + (c.methods?.length || 0), 0) || 0,
      invocable: aiItem.classes?.reduce((sum, c) => 
        sum + (c.methods?.filter(m => m.isInvocable).length || 0), 0) || 0,
      auraEnabled: aiItem.classes?.reduce((sum, c) => 
        sum + (c.methods?.filter(m => m.isAuraEnabled).length || 0), 0) || 0,
      sobjects: aiItem.sobjects?.length || 0,
      hasError: !!aiItem._error
    },
    differences: {}
  };
  
  // Calculate differences
  fileComparison.differences = {
    classesDiff: fileComparison.ai.classes - fileComparison.regex.classes,
    methodsDiff: fileComparison.ai.methods - fileComparison.regex.methods,
    invocableDiff: fileComparison.ai.invocable - fileComparison.regex.invocable,
    auraEnabledDiff: fileComparison.ai.auraEnabled - fileComparison.regex.auraEnabled,
    sobjectsDiff: fileComparison.ai.sobjects - fileComparison.regex.sobjects
  };
  
  // Check class name matches
  const regexClassNames = new Set(regexItem.classes?.map(c => c.name) || []);
  const aiClassNames = new Set(aiItem.classes?.map(c => c.name) || []);
  
  let classMatches = 0;
  regexClassNames.forEach(name => {
    if (aiClassNames.has(name)) classMatches++;
  });
  
  fileComparison.classNameMatchRate = regexClassNames.size > 0 
    ? (classMatches / regexClassNames.size * 100).toFixed(1) 
    : 100;
  
  // Update accuracy metrics
  comparison.accuracyMetrics.totalComparisons++;
  if (fileComparison.classNameMatchRate === '100.0') {
    comparison.accuracyMetrics.classNameMatch++;
  }
  if (fileComparison.differences.methodsDiff === 0) {
    comparison.accuracyMetrics.methodCountMatch++;
  }
  if (fileComparison.differences.invocableDiff === 0 && 
      fileComparison.differences.auraEnabledDiff === 0) {
    comparison.accuracyMetrics.annotationMatch++;
  }
  
  comparison.detailedComparison.push(fileComparison);
});

// Calculate percentages
const total = comparison.accuracyMetrics.totalComparisons;
comparison.accuracyMetrics.classNameMatchPct = total > 0 
  ? (comparison.accuracyMetrics.classNameMatch / total * 100).toFixed(1) 
  : 0;
comparison.accuracyMetrics.methodCountMatchPct = total > 0 
  ? (comparison.accuracyMetrics.methodCountMatch / total * 100).toFixed(1) 
  : 0;
comparison.accuracyMetrics.annotationMatchPct = total > 0 
  ? (comparison.accuracyMetrics.annotationMatch / total * 100).toFixed(1) 
  : 0;

// Find significant differences
comparison.significantDifferences = comparison.detailedComparison
  .filter(item => 
    Math.abs(item.differences.classesDiff) > 0 ||
    Math.abs(item.differences.methodsDiff) > 3 ||
    Math.abs(item.differences.invocableDiff) > 0
  )
  .sort((a, b) => 
    Math.abs(b.differences.methodsDiff) - Math.abs(a.differences.methodsDiff)
  );

// Display results
console.log(`\n${'='.repeat(70)}`);
console.log(`📊 Regex vs AI Parsing Comparison`);
console.log(`${'='.repeat(70)}\n`);

console.log(`📁 Files:`);
console.log(`   Regex:          ${comparison.summary.regexFiles}`);
console.log(`   AI:             ${comparison.summary.aiFiles}`);
console.log(`   Matching:       ${comparison.summary.matchingFiles}`);
console.log(`   AI Errors:      ${comparison.summary.aiErrors}\n`);

console.log(`✅ Accuracy Metrics:`);
console.log(`   Class Names:    ${comparison.accuracyMetrics.classNameMatchPct}% match`);
console.log(`   Method Counts:  ${comparison.accuracyMetrics.methodCountMatchPct}% match`);
console.log(`   Annotations:    ${comparison.accuracyMetrics.annotationMatchPct}% match\n`);

console.log(`⚠️  Significant Differences: ${comparison.significantDifferences.length} files\n`);

if (comparison.significantDifferences.length > 0) {
  console.log(`Top Differences:`);
  comparison.significantDifferences.slice(0, 5).forEach(item => {
    console.log(`   ${item.path}`);
    console.log(`      Classes:  Regex=${item.regex.classes}, AI=${item.ai.classes}`);
    console.log(`      Methods:  Regex=${item.regex.methods}, AI=${item.ai.methods}`);
    if (item.ai.hasError) {
      console.log(`      ❌ AI had parsing errors`);
    }
  });
}

console.log(`\n${'='.repeat(70)}\n`);

// Write detailed comparison
const outputPath = path.join(path.dirname(aiPath), 'comparison-detailed.json');
fs.writeFileSync(outputPath, JSON.stringify(comparison, null, 2));
console.log(`📄 Detailed comparison written to: ${outputPath}\n`);

// Return summary
module.exports = comparison;

