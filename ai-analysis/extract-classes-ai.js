/**
 * AI-Based Salesforce Apex Class Extractor
 * Uses GPT-4 to parse Apex code with high accuracy
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

function getAPIKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable not set");
  }
  return apiKey;
}

/**
 * Call OpenAI API with retry logic
 */
async function callOpenAI(prompt, retries = 3) {
  const apiKey = getAPIKey();
  
  const data = JSON.stringify({
    model: "gpt-4-turbo-preview",
    messages: [
      {
        role: "system",
        content: "You are a Salesforce Apex code parser. Return only valid JSON, no markdown, no explanations."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0
  });

  const options = {
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(data, 'utf8')
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          
          if (parsed.error) {
            if (retries > 0 && parsed.error.type === 'rate_limit_error') {
              console.log(`⏳ Rate limited, retrying in 5s... (${retries} retries left)`);
              setTimeout(() => {
                callOpenAI(prompt, retries - 1).then(resolve).catch(reject);
              }, 5000);
              return;
            }
            reject(new Error(parsed.error.message));
            return;
          }

          const content = parsed.choices[0].message.content;
          resolve(JSON.parse(content));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      if (retries > 0) {
        console.log(`⏳ Request failed, retrying... (${retries} retries left)`);
        setTimeout(() => {
          callOpenAI(prompt, retries - 1).then(resolve).catch(reject);
        }, 2000);
      } else {
        reject(e);
      }
    });

    req.write(data);
    req.end();
  });
}

/**
 * Extract Apex classes using AI
 */
async function extractApexClassesAI(filePath, repoPath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const relativePath = path.relative(repoPath, filePath);
  
  // Truncate very large files to avoid token limits
  const maxLength = 8000; // ~2000 tokens
  const truncatedContent = content.length > maxLength 
    ? content.substring(0, maxLength) + "\n// ... (file truncated)"
    : content;
  
  // Use original content - JSON.stringify will handle escaping
  const cleanContent = truncatedContent;

  const prompt = `Parse this Salesforce Apex code and return EXACTLY this JSON structure (no additional fields):

{
  "path": "${relativePath}",
  "type": "apex_class",
  "importFiles": [],
  "externalImports": [],
  "sobjects": [],
  "functions": [],
  "classes": [
    {
      "name": "ClassName",
      "type": "class",
      "visibility": "public",
      "sharing": "with sharing",
      "startLine": 1,
      "endLine": 100,
      "innerClasses": [
        {
          "name": "InnerClass",
          "type": "inner_class",
          "visibility": "public",
          "sharing": null,
          "startLine": 10,
          "endLine": 20,
          "innerClasses": [],
          "methods": []
        }
      ],
      "methods": [
        {
          "name": "methodName",
          "type": "method",
          "visibility": "public",
          "isStatic": true,
          "isOverride": false,
          "returnType": "void",
          "params": ["String param"],
          "startLine": 5,
          "endLine": 10,
          "calls": [{"name": "System.debug", "path": null}],
          "isInvocable": false,
          "isAuraEnabled": false,
          "soqlQueries": []
        }
      ]
    }
  ]
}

Rules:
1. Extract ALL classes (main and inner)
2. Extract ALL methods with their annotations
3. Detect @InvocableMethod and @AuraEnabled
4. Find SOQL queries in [SELECT...] format
5. List standard Salesforce classes in externalImports (Database, System, List, Map, etc)
6. List SObjects used in sobjects array (User, Account, custom objects ending in __c)
7. functions array should always be empty (Apex has no standalone functions)
8. Return ONLY the JSON, no markdown, no explanations

Apex Code (analyze this):
---START_CODE---
${cleanContent}
---END_CODE---

Return the JSON now (only valid JSON, no other text):`;

  try {
    const result = await callOpenAI(prompt);
    
    // Validate and fix the result
    if (!result.path) result.path = relativePath;
    if (!result.type) result.type = "apex_class";
    if (!result.importFiles) result.importFiles = [];
    if (!result.externalImports) result.externalImports = [];
    if (!result.sobjects) result.sobjects = [];
    if (!result.functions) result.functions = [];
    if (!result.classes) result.classes = [];
    
    return result;
  } catch (error) {
    console.error(`\n❌ AI parsing failed for ${relativePath}: ${error.message}`);
    
    // Return fallback structure
    return {
      path: relativePath,
      type: "apex_class",
      importFiles: [],
      externalImports: [],
      sobjects: [],
      functions: [],
      classes: [],
      _error: error.message
    };
  }
}

/**
 * Extract triggers using AI
 */
async function extractTriggersAI(filePath, repoPath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const relativePath = path.relative(repoPath, filePath);

  const prompt = `Parse this Salesforce Apex trigger and return EXACTLY this JSON structure:

{
  "path": "${relativePath}",
  "type": "apex_trigger",
  "triggerName": "TriggerName",
  "sobject": "Case",
  "events": ["after insert"],
  "importFiles": [],
  "externalImports": [],
  "sobjects": [],
  "functions": [],
  "classes": [],
  "triggerLogic": {
    "usesTriggerNew": true,
    "usesTriggerOld": false,
    "usesTriggerNewMap": false,
    "usesTriggerOldMap": false,
    "usesIsBefore": false,
    "usesIsAfter": true,
    "usesIsInsert": true,
    "usesIsUpdate": false,
    "usesIsDelete": false,
    "usesIsUndelete": false,
    "dmlOperations": ["insert", "update"],
    "soqlQueries": [],
    "methodCalls": []
  }
}

Trigger Code:
\`\`\`apex
${content}
\`\`\``;

  try {
    const result = await callOpenAI(prompt);
    if (!result.path) result.path = relativePath;
    if (!result.type) result.type = "apex_trigger";
    return result;
  } catch (error) {
    console.error(`\n❌ AI parsing failed for ${relativePath}: ${error.message}`);
    return {
      path: relativePath,
      type: "apex_trigger",
      triggerName: path.basename(filePath, '.trigger'),
      sobject: "Unknown",
      events: [],
      importFiles: [],
      externalImports: [],
      sobjects: [],
      functions: [],
      classes: [],
      triggerLogic: {},
      _error: error.message
    };
  }
}

module.exports = {
  extractApexClassesAI,
  extractTriggersAI
};

