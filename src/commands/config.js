// src/commands/config.js
import fs from "fs-extra";
import path from "path";
import os from "os";
import chalk from "chalk";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import Logger from "../utils/logger.js";

const logger = new Logger();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config file location
const CONFIG_DIR = path.join(os.homedir(), ".mydeploy");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// Ensure config directory exists
async function ensureConfigDir() {
  await fs.ensureDir(CONFIG_DIR);
}

// Load config file
async function loadConfig() {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      return await fs.readJson(CONFIG_FILE);
    }
    return {};
  } catch (error) {
    logger.error("Failed to load config:", error.message);
    return {};
  }
}

// Save config file
async function saveConfig(config) {
  try {
    await ensureConfigDir();
    await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
  } catch (error) {
    logger.error("Failed to save config:", error.message);
    throw error;
  }
}

// Set configuration value
export async function setConfig(key, value) {
  try {
    const config = await loadConfig();
    
    // Handle nested keys (e.g., "aws.region")
    const keys = key.split('.');
    let current = config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    
    await saveConfig(config);
    logger.success(`✅ Set ${key} = ${maskSensitiveValue(key, value)}`);
  } catch (error) {
    logger.error("Failed to set config:", error.message);
    throw error;
  }
}

// Get configuration value
export async function getConfig(key) {
  try {
    const config = await loadConfig();
    
    if (!key) {
      return config;
    }
    
    // Handle nested keys
    const keys = key.split('.');
    let current = config;
    
    for (const k of keys) {
      if (current[k] === undefined) {
        return undefined;
      }
      current = current[k];
    }
    
    return current;
  } catch (error) {
    logger.error("Failed to get config:", error.message);
    throw error;
  }
}

// Get configuration value with fallback to environment variable
export async function getConfigValue(key) {
  // First check config file
  const configValue = await getConfig(key);
  if (configValue !== undefined) {
    return configValue;
  }
  
  // Then check environment variables
  const envKey = key.toUpperCase().replace(/\./g, '_');
  return process.env[envKey];
}

// Remove configuration value
export async function removeConfig(key) {
  try {
    const config = await loadConfig();
    
    const keys = key.split('.');
    let current = config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        logger.warn(`Config key '${key}' not found`);
        return;
      }
      current = current[keys[i]];
    }
    
    delete current[keys[keys.length - 1]];
    
    await saveConfig(config);
    logger.success(`✅ Removed ${key}`);
  } catch (error) {
    logger.error("Failed to remove config:", error.message);
    throw error;
  }
}

// List all configuration
export async function listConfig() {
  try {
    const config = await loadConfig();
    
    if (Object.keys(config).length === 0) {
      logger.info("No configuration found");
      return;
    }
    
    logger.title("📋 Configuration");
    printConfigObject(config);
  } catch (error) {
    logger.error("Failed to list config:", error.message);
    throw error;
  }
}

// Print config object recursively
function printConfigObject(obj, prefix = '') {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null) {
      console.log(chalk.cyan.bold(`${fullKey}:`));
      printConfigObject(value, fullKey);
    } else {
      const displayValue = maskSensitiveValue(fullKey, value);
      console.log(`  ${chalk.blue(fullKey)}: ${chalk.white(displayValue)}`);
    }
  }
}

// Mask sensitive values for display
function maskSensitiveValue(key, value) {
  const sensitiveKeys = ['key', 'secret', 'token', 'password', 'pass'];
  const lowerKey = key.toLowerCase();
  
  if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
    if (typeof value === 'string' && value.length > 8) {
      return value.substring(0, 4) + '*'.repeat(value.length - 8) + value.substring(value.length - 4);
    }
    return '*'.repeat(8);
  }
  
  return value;
}

// Initialize configuration with prompts
export async function initConfig(options = {}) {
  logger.title("🔧 Configuration Setup");
  
  const config = await loadConfig();
  
  // AWS Configuration
  if (!config.aws) config.aws = {};
  
  if (!config.aws.region && !process.env.AWS_DEFAULT_REGION) {
    logger.info("AWS region not configured. Common regions:");
    logger.info("  • us-east-1 (N. Virginia)");
    logger.info("  • us-west-2 (Oregon)");
    logger.info("  • eu-west-1 (Ireland)");
    logger.info("  • ap-southeast-1 (Singapore)");
    console.log();
  }
  
  // Gemini API Configuration
  if (!config.gemini?.apiKey && !process.env.GEMINI_API_KEY) {
    logger.warn("⚠️  Gemini API key not configured");
    logger.info("Get your API key from: https://makersuite.google.com/app/apikey");
    console.log();
  }
  
  // Display current configuration
  if (Object.keys(config).length > 0) {
    logger.subtitle("Current Configuration:");
    printConfigObject(config);
  } else {
    logger.info("No configuration found. Use 'mydeploy config set <key> <value>' to configure.");
  }
  
  // Suggestions
  logger.separator();
  logger.subtitle("Configuration Examples:");
  console.log(chalk.dim("  mydeploy config set aws.region us-east-1"));
  console.log(chalk.dim("  mydeploy config set gemini.apiKey your-api-key"));
  console.log(chalk.dim("  mydeploy config set aws.profile default"));
  console.log(chalk.dim("  mydeploy config set docker.registry your-registry"));
}

// Validate required configuration
export async function validateConfig(requiredKeys = []) {
  const missing = [];
  
  for (const key of requiredKeys) {
    const value = await getConfigValue(key);
    if (!value) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    logger.error("❌ Missing required configuration:");
    missing.forEach(key => {
      console.log(`  • ${chalk.red(key)}`);
    });
    
    logger.info("\nConfigure missing values:");
    missing.forEach(key => {
      console.log(chalk.dim(`  mydeploy config set ${key} <value>`));
    });
    
    return false;
  }
  
  return true;
}

// Export con fig file location for other modules
export { CONFIG_FILE, CONFIG_DIR };

// Main config command handler
export default async function configCommand(action, key, value, options = {}) {
  try {
    switch (action.toLowerCase()) {
      case 'set':
        if (!key) {
          logger.error("Key required for 'set' action");
          process.exit(1);
        }
        if (!value) {
          logger.error("Value required for 'set' action");
          process.exit(1);
        }
        await setConfig(key, value);
        break;
        
      case 'get':
        if (!key) {
          logger.error("Key required for 'get' action");
          process.exit(1);
        }
        const result = await getConfigValue(key);
        if (result !== undefined) {
          console.log(chalk.cyan(`${key} = ${maskSensitiveValue(key, result)}`));
        } else {
          logger.warn(`⚠️  No value set for ${key}`);
        }
        break;
        
      case 'remove':
      case 'delete':
        if (!key) {
          logger.error("Key required for 'remove' action");
          process.exit(1);
        }
        await removeConfig(key);
        break;
        
      case 'list':
        await listConfig();
        break;
        
      case 'init':
        await initConfig(options);
        break;
        
      default:
        logger.error(`Unknown action: ${action}`);
        logger.info("Available actions: set, get, remove, list, init");
        process.exit(1);
    }
  } catch (error) {
    logger.error("Config command failed:", error.message);
    if (global.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}