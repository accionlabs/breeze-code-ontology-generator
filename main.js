/**
 * Breeze Code Ontology Generator - Auto-Detect Module
 * Automatically detects languages in a repository and processes them
 *
 * This module exports functions to be used by index.js
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const glob = require("glob");

// Import language analyzers
const { analyzeTypeScriptRepo } = require("./typescript/file-tree-mapper-typescript");
const { analyzeJavaScriptRepo } = require("./nodejs/file-tree-mapper-nodejs");
const { analyzePythonRepo } = require("./python/file-tree-mapper-python");
const { analyzeJavaRepo } = require("./java/file-tree-main-java");

const isWindows = process.platform === "win32";

// Language configuration
const LANGUAGE_CONFIG = {
  typescript: {
    extensions: ["**/*.ts", "**/*.tsx"],
    name: "TypeScript",
    analyzer: analyzeTypeScriptRepo,
    priority: 1 // Higher priority means it's checked first
  },
  javascript: {
    extensions: ["**/*.js", "**/*.jsx"],
    name: "JavaScript",
    analyzer: analyzeJavaScriptRepo
  },
  python: {
    extensions: ["**/*.py"],
    name: "Python",
    analyzer: analyzePythonRepo
  },
  java: {
    extensions: ["**/*.java"],
    name: "Java",
    analyzer: analyzeJavaRepo
  }
};

const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/build/**",
  "**/dist/**",
  "**/target/**",
  "**/.venv/**",
  "**/venv/**",
  "**/env/**",
  "**/__pycache__/**",
  "**/.eggs/**",
  "**/*.egg-info/**",
  "**/.git/**"
];

// ----------------------------
// Detect languages in repository
// ----------------------------
function detectLanguages(repoPath, verbose = false) {
  if (verbose) {
    console.log("\n🔍 Detecting languages in repository...");
  }

  const detectedLanguages = [];

  // Sort by priority (if defined) to check TypeScript before JavaScript
  const languageEntries = Object.entries(LANGUAGE_CONFIG).sort((a, b) => {
    const priorityA = a[1].priority || 0;
    const priorityB = b[1].priority || 0;
    return priorityB - priorityA;
  });

  for (const [langKey, config] of languageEntries) {
    if (verbose) {
      console.log(`   Checking for ${config.name} files...`);
    }

    let hasFiles = false;

    // Check each extension pattern
    for (const pattern of config.extensions) {
      const files = glob.sync(path.join(repoPath, pattern), {
        ignore: IGNORE_PATTERNS.map(p => path.join(repoPath, p)),
        nodir: true
      });

      if (files.length > 0) {
        hasFiles = true;
        if (verbose) {
          console.log(`   ✓ Found ${files.length} ${pattern} files`);
        }
        break;
      }
    }

    if (hasFiles) {
      detectedLanguages.push({
        key: langKey,
        name: config.name,
        analyzer: config.analyzer
      });
      if (verbose) {
        console.log(`   ✅ ${config.name} detected`);
      }
    }
  }

  return detectedLanguages;
}

// ----------------------------
// Process a single language
// ----------------------------
async function processLanguage(language, repoPath, verbose = false) {
  try {
    console.log(`\n🚀 Processing ${language.name}...`);

    // Call the analyzer function directly (no more temp files!)
    const data = await Promise.resolve(language.analyzer(repoPath));

    console.log(`✅ ${language.name} analysis complete!`);

    return { language: language.key, name: language.name, data };
  } catch (err) {
    console.error(`\n❌ ${language.name} analysis failed:`, err.message);
    return null;
  }
}

// ----------------------------
// Merge all language outputs into single JSON
// ----------------------------
function mergeLanguageOutputs(languageResults, repoPath, outputDir) {
  console.log("\n🔄 Merging all language outputs...");

  const mergedFiles = [];
  const analyzedLanguages = [];

  for (const result of languageResults) {
    if (result && result.data) {
      analyzedLanguages.push(result.language);

      // Each language output should have an array of file objects
      if (Array.isArray(result.data)) {
        // Add language identifier to each file
        result.data.forEach(file => {
          mergedFiles.push({
            ...file,
            language: result.language
          });
        });
      } else {
        console.warn(`⚠️  Warning: ${result.name} output is not an array`);
      }
    }
  }

  // Create the final merged structure
  const mergedOutput = {
    projectMetaData: {
      repositoryPath: repoPath,
      repositoryName: path.basename(repoPath),
      analyzedLanguages,
      totalFiles: mergedFiles.length,
      generatedAt: new Date().toISOString(),
      toolVersion: "1.0.0"
    },
    files: mergedFiles
  };

  // Write merged output
  const mergedOutputPath = path.join(outputDir, "project-analysis.json");
  fs.writeFileSync(mergedOutputPath, JSON.stringify(mergedOutput, null, 2));

  console.log(`✅ Merged output created!`);
  console.log(`📄 Output: ${mergedOutputPath}`);
  console.log(`   - Languages: ${analyzedLanguages.join(", ")}`);
  console.log(`   - Total files: ${mergedFiles.length}`);

  return mergedOutputPath;
}

// ----------------------------
// Generate descriptions for merged output
// ----------------------------
function generateDescriptions(mergedOutputPath, repoPath, args, verbose = false) {
  if (!args["api-key"]) {
    console.error("❌ Error: --api-key is required for --generate-descriptions");
    return false;
  }

  console.log("\n🤖 Generating descriptions...");

  const descScriptPath = path.resolve(__dirname, "generate-file-descriptions.js");
  let descCommand = `node "${descScriptPath}" "${repoPath}" "${mergedOutputPath}"`;

  descCommand += ` --provider ${args.provider || "openai"}`;
  descCommand += ` --api-key ${args["api-key"]}`;

  if (args.model) descCommand += ` --model ${args.model}`;
  if (args["api-url"]) descCommand += ` --api-url ${args["api-url"]}`;
  if (args["max-concurrent"]) descCommand += ` --max-concurrent ${args["max-concurrent"]}`;

  try {
    if (verbose) {
      console.log("Running:", descCommand);
    }
    execSync(descCommand, {
      stdio: "inherit",
      shell: isWindows ? "cmd.exe" : undefined
    });
    console.log("✅ Descriptions generated!");
    return true;
  } catch (err) {
    console.error("❌ Description generation failed:", err.message);
    return false;
  }
}

// ----------------------------
// Add metadata for merged output
// ----------------------------
function addMetadata(mergedOutputPath, repoPath, args, verbose = false) {
  if (!args["api-key"]) {
    console.error("❌ Error: --api-key is required for --add-metadata");
    return false;
  }

  console.log("\n🏷️  Adding metadata...");

  const metadataScriptPath = path.resolve(__dirname, "add-metadata.js");
  let metadataCommand = `node "${metadataScriptPath}" "${mergedOutputPath}" "${repoPath}"`;

  metadataCommand += ` --provider ${args.provider || "openai"}`;
  metadataCommand += ` --api-key ${args["api-key"]}`;

  if (args.model) metadataCommand += ` --model ${args.model}`;
  if (args["api-url"]) metadataCommand += ` --api-url ${args["api-url"]}`;
  if (args.mode) metadataCommand += ` --mode ${args.mode}`;
  if (args["max-concurrent"]) metadataCommand += ` --max-concurrent ${args["max-concurrent"]}`;

  try {
    if (verbose) {
      console.log("Running:", metadataCommand);
    }
    execSync(metadataCommand, {
      stdio: "inherit",
      shell: isWindows ? "cmd.exe" : undefined
    });
    console.log("✅ Metadata added!");
    return true;
  } catch (err) {
    console.error("❌ Metadata addition failed:", err.message);
    return false;
  }
}

// ----------------------------
// Main auto-detect function
// ----------------------------
async function autoDetectAndProcess(repoPath, outputDir, args) {
  const verbose = args.verbose || false;

  try {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║   Breeze Code Ontology Generator - Auto Language Mode     ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log(`\n📂 Repository: ${repoPath}`);
    console.log(`📁 Output directory: ${outputDir}`);

    // Step 1: Detect languages
    const detectedLanguages = detectLanguages(repoPath, verbose);

    if (detectedLanguages.length === 0) {
      console.log("\n⚠️  No supported languages detected in the repository.");
      console.log("Supported file types: .js, .jsx, .ts, .tsx, .py, .java");
      return { success: true, languagesDetected: 0 };
    }

    console.log(`\n📊 Detected ${detectedLanguages.length} language(s): ${detectedLanguages.map(l => l.name).join(", ")}`);

    // Step 2: Process each detected language
    const results = [];
    for (const language of detectedLanguages) {
      const result = await processLanguage(language, repoPath, verbose);
      if (result) {
        results.push(result);
      }
    }

    if (results.length === 0) {
      console.error("\n❌ No languages were successfully processed");
      return { success: false, error: "No languages were successfully processed" };
    }

    // Step 3: Merge all outputs
    const mergedOutputPath = mergeLanguageOutputs(results, repoPath, outputDir);

    // Step 4: Generate descriptions if requested
    if (args["generate-descriptions"]) {
      generateDescriptions(mergedOutputPath, repoPath, args, verbose);
    }

    // Step 5: Add metadata if requested
    if (args["add-metadata"]) {
      addMetadata(mergedOutputPath, repoPath, args, verbose);
    }

    // Summary
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║                    Processing Complete!                   ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log(`\n✅ Successfully processed ${results.length} language(s)`);
    console.log(`📄 Merged output: ${mergedOutputPath}`);
    console.log("\n🎉 All tasks completed successfully!");

    return {
      success: true,
      languagesDetected: results.length,
      outputPath: mergedOutputPath
    };

  } catch (err) {
    console.error("\n❌ Analysis failed:", err.message);
    if (err.stderr) {
      console.error("Error details:", err.stderr.toString());
    }
    console.error("\n💡 Troubleshooting:");
    console.error("   1. Make sure the repository path is correct");
    console.error("   2. Check that tree-sitter modules are installed: npm rebuild");
    console.error("   3. Use --verbose flag to see detailed processing information");
    console.error("   4. On Windows, try running in WSL or Git Bash if issues persist");
    return { success: false, error: err.message };
  }
}

// Export functions
module.exports = {
  autoDetectAndProcess,
  detectLanguages,
  processLanguage,
  mergeLanguageOutputs,
  generateDescriptions,
  addMetadata
};
