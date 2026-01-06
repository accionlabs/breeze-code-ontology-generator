const fs = require("fs");
const path = require("path");

/**
 * Load and parse tsconfig.json to extract path aliases
 */
const ts = require("typescript");

function loadPathAliases(repoPath) {
  const configPath = ts.findConfigFile(
    repoPath,
    ts.sys.fileExists,
    "tsconfig.json"
  );

  if (!configPath) return {};

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

  if (configFile.error) {
    console.error("❌ Failed to read tsconfig.json");
    return {};
  }

  const options = configFile.config.compilerOptions || {};
  const paths = options.paths || {};
  const baseUrl = options.baseUrl || ".";

  const aliases = {};

  for (const [alias, targets] of Object.entries(paths)) {
    const cleanAlias = alias.replace(/\/\*$/, "");
    const target = targets[0].replace(/\/\*$/, "");
    aliases[cleanAlias] = path.join(repoPath, baseUrl, target);
  }

  return aliases;
}


/**
 * Resolve an import using path aliases
 */
function resolveWithAlias(importSource, pathAliases, repoPath) {
  // Check each alias to see if it matches
  for (const [alias, targetPath] of Object.entries(pathAliases)) {
    if (importSource === alias || importSource.startsWith(alias + '/')) {
      // Replace alias with actual path
      const relativePart = importSource.slice(alias.length);
      const resolvedPath = path.join(targetPath, relativePart);
      
      // Try with extensions
      return tryResolveWithExtensions(resolvedPath, repoPath);
    }
  }
  
  return null;
}

/**
 * Try to resolve a path with different extensions
 */
function tryResolveWithExtensions(basePath, repoPath) {
  // If already has extension and exists, return it
  if (path.extname(basePath) && fs.existsSync(basePath)) {
    return path.relative(repoPath, basePath);
  }

  // Try with different extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];
  for (const ext of extensions) {
    const pathWithExt = basePath + ext;
    if (fs.existsSync(pathWithExt)) {
      return path.relative(repoPath, pathWithExt);
    }
  }

  // Try as directory with index file
  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const ext of extensions) {
      const indexPath = path.join(basePath, 'index' + ext);
      if (fs.existsSync(indexPath)) {
        return path.relative(repoPath, indexPath);
      }
    }
  }

  return null;
}

module.exports = { loadPathAliases, resolveWithAlias };