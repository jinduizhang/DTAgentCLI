/**
 * DTAgent CLI - Intelligent Unit Test Generation Tool
 * 
 * This is the main entry point for the CLI library.
 * The actual CLI execution happens in bin/dtagent.js
 */

export { initCommand, InitOptions } from './commands/init';
export { generateCommand, GenerateOptions } from './commands/generate';
export { extractExperienceCommand, ExtractExperienceOptions } from './commands/extract-experience';

// CLI version
export const VERSION = '0.1.0';