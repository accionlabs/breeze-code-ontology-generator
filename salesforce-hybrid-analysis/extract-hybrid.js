/**
 * Hybrid Salesforce Apex Parser
 * Combines Regex (fast baseline) + AI (for complex files)
 */

const fs = require("fs");
const path = require("path");

/**
 * Simple regex-based Apex class extraction (baseline)
 */
function extractApexClasses(filePath, repoPath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(repoPath, filePath);
  
  const result = {
    path: relativePath,
    type: 'apex_class',
    classes: [],
    sobjects: [],
    externalImports: []
  };
  
  // Extract class name
  const classMatch = content.match(/(?:public|global|private)\s+(?:with sharing|without sharing|inherited sharing\s+)?class\s+(\w+)/);
  if (classMatch) {
    const methods = [];
    const methodRegex = /(?:public|private|protected|global)\s+(?:static\s+)?(?:override\s+)?[\w<>,\s]+\s+(\w+)\s*\([^)]*\)/g;
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      methods.push({ name: match[1] });
    }
    
    result.classes.push({
      name: classMatch[1],
      methods: methods,
      visibility: 'public',
      startLine: 1,
      endLine: content.split('\n').length
    });
  }
  
  return result;
}

/**
 * Simple regex-based trigger extraction (baseline)
 */
function extractTriggers(filePath, repoPath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(repoPath, filePath);
  
  const result = {
    path: relativePath,
    type: 'apex_trigger',
    classes: []
  };
  
  return result;
}

/**
 * AI-based extraction (from ai-analysis module)
 */
async function extractApexClassesAI(filePath, repoPath) {
  // Lazy load to avoid circular deps
  const { extractApexClassesAI: aiExtract } = require("../ai-analysis/extract-classes-ai");
  return await aiExtract(filePath, repoPath);
}

/**
 * Determine if file needs AI enhancement
 */
function needsAIEnhancement(regexResult, filePath) {
  // Check if regex found very few methods (might have missed some)
  const methodCount = regexResult.classes?.reduce((sum, c) => 
    sum + (c.methods?.length || 0), 0) || 0;
  
  // Check if file is complex
  const fileSize = fs.statSync(filePath).size;
  const isLarge = fileSize > 5000; // > 5KB
  const hasFewMethods = methodCount < 2;
  const hasInnerClasses = regexResult.classes?.some(c => 
    c.innerClasses && c.innerClasses.length > 0);
  
  // Use AI if:
  // 1. Large file with few methods detected (might have missed some)
  // 2. Has complex inner class structure
  // 3. Zero methods found but file is not empty
  const needsAI = (isLarge && hasFewMethods) || 
                   (hasInnerClasses && methodCount < 5) ||
                   (methodCount === 0 && fileSize > 500);
  
  return needsAI;
}

/**
 * Merge regex and AI results intelligently
 */
function mergeResults(regexResult, aiResult) {
  // Start with regex as baseline
  const merged = JSON.parse(JSON.stringify(regexResult));
  
  if (!aiResult || aiResult._error) {
    // AI failed, use regex only
    merged._source = 'regex';
    return merged;
  }
  
  // Merge classes: prefer AI if it found more
  if (aiResult.classes && aiResult.classes.length > merged.classes.length) {
    merged.classes = aiResult.classes;
    merged._source = 'ai_classes';
  } else {
    merged._source = 'regex_classes';
  }
  
  // Merge SObjects: union of both
  const allSObjects = new Set([
    ...merged.sobjects,
    ...(aiResult.sobjects || [])
  ]);
  merged.sobjects = Array.from(allSObjects);
  
  // Merge external imports: union of both
  const allImports = new Set([
    ...merged.externalImports,
    ...(aiResult.externalImports || [])
  ]);
  merged.externalImports = Array.from(allImports);
  
  // For each class, merge methods if AI found more
  if (merged._source === 'regex_classes' && aiResult.classes) {
    merged.classes.forEach((regexClass, idx) => {
      const aiClass = aiResult.classes.find(c => c.name === regexClass.name);
      if (aiClass && aiClass.methods && aiClass.methods.length > regexClass.methods.length) {
        merged.classes[idx].methods = aiClass.methods;
        merged.classes[idx]._methodSource = 'ai';
      }
    });
  }
  
  merged._enhanced = 'hybrid';
  return merged;
}

/**
 * Extract with hybrid approach
 */
async function extractApexHybrid(filePath, repoPath) {
  console.log(`\n🔄 Hybrid parsing: ${path.relative(repoPath, filePath)}`);
  
  // Step 1: Fast regex parse
  console.log(`   ⚡ Regex baseline...`);
  const regexResult = extractApexClasses(filePath, repoPath);
  
  // Step 2: Check if AI is needed
  const needsAI = needsAIEnhancement(regexResult, filePath);
  
  if (!needsAI) {
    console.log(`   ✅ Regex sufficient`);
    regexResult._source = 'regex_only';
    return regexResult;
  }
  
  // Step 3: Enhance with AI
  console.log(`   🤖 AI enhancement needed...`);
  try {
    const aiResult = await extractApexClassesAI(filePath, repoPath);
    console.log(`   ✅ AI enhanced`);
    
    // Step 4: Merge intelligently
    return mergeResults(regexResult, aiResult);
  } catch (error) {
    console.log(`   ⚠️  AI failed, using regex: ${error.message}`);
    regexResult._source = 'regex_fallback';
    return regexResult;
  }
}

/**
 * Extract triggers with hybrid approach
 */
async function extractTriggerHybrid(filePath, repoPath) {
  // Triggers are usually simple, just use regex
  const result = extractTriggers(filePath, repoPath);
  result._source = 'regex_only';
  return result;
}

module.exports = {
  extractApexHybrid,
  extractTriggerHybrid,
  needsAIEnhancement,
  mergeResults
};

