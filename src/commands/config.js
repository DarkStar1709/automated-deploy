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

const CONFIG_DIR = path.join(os.homedir(), ".mydeploy");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

async function ensureConfigDir() {
  await fs.ensureDir(CONFIG_DIR);
}

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

async function saveConfig(config) {
  try {
    await ensureConfigDir();
    await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
  } catch (error) {
    logger.error("Failed to save config:", error.message);
    throw error;
  }
}

import { writeEnvKey } from '../utils/env.js';

export async function setConfig(key, value) {
  try {
    const envKey = key.toUpperCase().replace(/\./g, '_');
    await writeEnvKey(envKey, value);
    logger.success(`✅ Set ${key} = ${maskSensitiveValue(key, value)} in .env`);
  } catch (error) {
    logger.error("Failed to set config:", error.message);
    throw error;
  }
}

export async function getConfigValue(key) {
  const envKey = key.toUpperCase().replace(/\./g, '_');
  return process.env[envKey];
}

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
  
  if (!config.gemini?.apiKey && !process.env.GEMINI_API_KEY) {
    logger.warn("⚠️  Gemini API key not configured");
    logger.info("Get your API key from: https://makersuite.google.com/app/apikey");
    console.log();
  }
  
  if (Object.keys(config).length > 0) {
    logger.subtitle("Current Configuration:");
    printConfigObject(config);
  } else {
    logger.info("No configuration found. Use 'mydeploy config set <key> <value>' to configure.");
  }
  
  logger.separator();
  logger.subtitle("Configuration Examples:");
  console.log(chalk.dim("  mydeploy config set aws.region us-east-1"));
  console.log(chalk.dim("  mydeploy config set gemini.apiKey your-api-key"));
  console.log(chalk.dim("  mydeploy config set aws.profile default"));
  console.log(chalk.dim("  mydeploy config set docker.registry your-registry"));
}

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

export { CONFIG_FILE, CONFIG_DIR };

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