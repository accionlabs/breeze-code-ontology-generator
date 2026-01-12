const fs = require('fs');
const path = require('path');

/**
 * Extract metadata from Salesforce metadata XML files
 * Supports: cls-meta.xml, trigger-meta.xml, object-meta.xml, etc.
 */
function extractMetadata(filePath, content) {
  const fileName = path.basename(filePath);
  const result = {
    path: filePath,
    fileName: fileName,
    metadataType: getMetadataType(fileName),
    apiVersion: extractTag(content, 'apiVersion'),
    status: extractTag(content, 'status'),
    importFiles: [],
    externalImports: [],
    functions: [],
    classes: []
  };

  // Extract specific metadata based on type
  if (fileName.endsWith('.cls-meta.xml')) {
    // Apex class metadata
    result.packageVersion = extractTag(content, 'packageVersions');
    
  } else if (fileName.endsWith('.trigger-meta.xml')) {
    // Trigger metadata
    result.packageVersion = extractTag(content, 'packageVersions');
    
  } else if (fileName.endsWith('.object-meta.xml')) {
    // Custom object metadata
    result.label = extractTag(content, 'label');
    result.pluralLabel = extractTag(content, 'pluralLabel');
    result.nameField = extractTag(content, 'nameField');
    result.deploymentStatus = extractTag(content, 'deploymentStatus');
    result.sharingModel = extractTag(content, 'sharingModel');
    
    // Extract fields
    const fields = extractMultipleTags(content, 'fields');
    result.fields = fields.map(field => ({
      fullName: extractTag(field, 'fullName'),
      label: extractTag(field, 'label'),
      type: extractTag(field, 'type'),
      required: extractTag(field, 'required') === 'true',
      unique: extractTag(field, 'unique') === 'true'
    }));
    
  } else if (fileName.endsWith('.permissionset-meta.xml')) {
    // Permission set metadata
    result.label = extractTag(content, 'label');
    result.description = extractTag(content, 'description');
    
    // Extract permissions
    const classAccesses = extractMultipleTags(content, 'classAccesses');
    result.classAccesses = classAccesses.map(ca => ({
      apexClass: extractTag(ca, 'apexClass'),
      enabled: extractTag(ca, 'enabled') === 'true'
    }));
    
    const fieldPermissions = extractMultipleTags(content, 'fieldPermissions');
    result.fieldPermissions = fieldPermissions.map(fp => ({
      field: extractTag(fp, 'field'),
      readable: extractTag(fp, 'readable') === 'true',
      editable: extractTag(fp, 'editable') === 'true'
    }));
    
  } else if (fileName.endsWith('.layout-meta.xml')) {
    // Page layout metadata
    result.layoutSections = extractMultipleTags(content, 'layoutSections').map(section => ({
      label: extractTag(section, 'label'),
      style: extractTag(section, 'style')
    }));
    
  } else if (fileName.endsWith('.app-meta.xml')) {
    // App metadata
    result.label = extractTag(content, 'label');
    result.description = extractTag(content, 'description');
    result.navType = extractTag(content, 'navType');
    
  } else if (fileName.endsWith('.tab-meta.xml')) {
    // Tab metadata
    result.label = extractTag(content, 'label');
    result.motif = extractTag(content, 'motif');
    
  }

  return result;
}

function getMetadataType(fileName) {
  if (fileName.endsWith('.cls-meta.xml')) return 'ApexClassMetadata';
  if (fileName.endsWith('.trigger-meta.xml')) return 'ApexTriggerMetadata';
  if (fileName.endsWith('.object-meta.xml')) return 'CustomObject';
  if (fileName.endsWith('.permissionset-meta.xml')) return 'PermissionSet';
  if (fileName.endsWith('.layout-meta.xml')) return 'Layout';
  if (fileName.endsWith('.app-meta.xml')) return 'CustomApplication';
  if (fileName.endsWith('.tab-meta.xml')) return 'CustomTab';
  if (fileName.endsWith('.flow-meta.xml')) return 'Flow';
  if (fileName.endsWith('.genAiFunction-meta.xml')) return 'GenAiFunction';
  return 'UnknownMetadata';
}

function extractTag(content, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function extractMultipleTags(content, tagName) {
  const results = [];
  const regex = new RegExp(`<${tagName}[^>]*>(.*?)</${tagName}>`, 'gis');
  let match;
  while ((match = regex.exec(content)) !== null) {
    results.push(match[1]);
  }
  return results;
}

module.exports = { extractMetadata };

