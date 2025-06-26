#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import chalk from "chalk";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import Logger from "../src/utils/logger.js";

const logger = new Logger();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const packageJson = require(path.resolve(__dirname, "../package.json"));

// Import commands
import initCommand from "../src/commands/init.js";
import deployCommand from "../src/commands/deploy.js";
import { getConfigValue, setConfig } from "../src/commands/config.js";

const program = new Command();

// CLI Header
console.log(
  chalk.cyan.bold(`
╔══════════════════════════════════════╗
║  🚀 Automated Deploy CLI v${packageJson.version}      ║
║   AI-Powered AWS ECS Deployment      ║
╚══════════════════════════════════════╝
`)
);

program
  .name("mydeploy")
  .description("AI-powered automated deployment CLI for AWS ECS")
  .version(packageJson.version);

// Global options
program
  .option("-v, --verbose", "Enable verbose logging")
  .option("--dry-run", "Show what would be done without executing")
  .option("--profile <profile>", "AWS profile to use")
  .option("--region <region>", "AWS region to use")
  .hook("preAction", async (thisCommand) => {
    global.verbose = thisCommand.opts().verbose;
    global.dryRun = thisCommand.opts().dryRun;

    if (thisCommand.opts().profile) {
      process.env.AWS_PROFILE = thisCommand.opts().profile;
    }
    if (thisCommand.opts().region) {
      process.env.AWS_DEFAULT_REGION = thisCommand.opts().region;
    }

    if (global.verbose) {
      console.log(chalk.dim("Verbose mode enabled"));
    }
    if (global.dryRun) {
      console.log(chalk.yellow("🔍 Dry run mode - no changes will be made"));
    }
  });

// Commands
program
  .command("init")
  .description("Analyze project and generate Docker setup using AI")
  .argument("[project-path]", "Path to project directory", ".")
  .option("-f, --force", "Overwrite existing Docker files")
  .option("--no-ai", "Skip AI analysis and use templates")
  .action(async (projectPath, options) => {
    if (options.ai !== false) {
      let geminiKey = await getConfigValue("GEMINI_API_KEY");
      if (!geminiKey) {
        logger.warn("⚠️  Gemini API key not found. AI features will be disabled.");
        logger.info("You can configure it using:");
        logger.info(chalk.cyan("mydeploy config set GEMINI_API_KEY <your-key>"));
        options.ai = false;
      } else {
        process.env.GEMINI_API_KEY = geminiKey;
        logger.success("✅ Gemini API key loaded successfully.");
      }
    }

    await initCommand(projectPath, options);
  });

program
  .command("config")
  .description("Configure API keys")
  .argument("<action>", "set or get")
  .argument("<key>", "Config key")
  .argument("[value]", 'Value to set (if using "set")')
  .action(async (action, key, value) => {
    if (action === "set") {
      if (!value) {
        console.log(chalk.red("Value required for setting config."));
        process.exit(1);
      }
      await setConfig(key, value);
    } else if (action === "get") {
      const result = await getConfigValue(key);
      if (result) {
        console.log(chalk.cyan(`${key} = ${result}`));
      } else {
        console.log(chalk.yellow(`⚠️  No value set for ${key}`));
      }
    } else {
      console.log(chalk.red('Unknown action. Use "set" or "get".'));
    }
  });

program
  .command("deploy")
  .description("Build, push and deploy to AWS ECS")
  .argument("[project-path]", "Path to project directory", ".")
  .option("-e, --env <environment>", "Deployment environment", "production")
  .option("--region <region>", "AWS region")
  .option("--cluster <name>", "ECS cluster name")
  .option("--service <name>", "ECS service name")
  .option("--skip-build", "Skip Docker image build")
  .option("--skip-push", "Skip ECR push")
  .action(async (projectPath, options) => {
    if (!process.env.AWS_PROFILE && !process.env.AWS_ACCESS_KEY_ID) {
      logger.error("❌ AWS credentials not configured");
      logger.info("Set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY");
      process.exit(1);
    }

    if (!options.region) {
      options.region = await getConfigValue("AWS_REGION") || process.env.AWS_DEFAULT_REGION || "us-east-1";
    }

    await deployCommand(projectPath, options);
  });

program.configureOutput({
  writeErr: (str) => process.stderr.write(chalk.red(str)),
});

program.exitOverride((err) => {
  if (["commander.help", "commander.version"].includes(err.code)) {
    process.exit(0);
  }
  console.error(chalk.red("Error:"), err.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  if (global.verbose) console.error(reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error.message);
  if (global.verbose) console.error(error);
  process.exit(1);
});

async function performPreflightChecks() {
  const warnings = [];
  try {
    const { execa } = await import("execa");
    await execa("docker", ["--version"], { stdout: "pipe" });
  } catch {
    warnings.push("Docker not found or not running");
  }
  try {
    const { execa } = await import("execa");
    await execa("aws", ["--version"], { stdout: "pipe" });
  } catch {
    warnings.push("AWS CLI not found (optional but recommended)");
  }
  const geminiKey = await getConfigValue("GEMINI_API_KEY") || process.env.GEMINI_API_KEY;
  if (!geminiKey && !program.args.includes("config")) {
    warnings.push("Gemini API key not configured (AI features will be limited)");
  }
  if (warnings.length > 0 && global.verbose) {
    logger.warn("⚠️  Preflight checks found issues:");
    warnings.forEach((w) => console.log(chalk.yellow(`  • ${w}`)));
    console.log();
  }
}

program.parseAsync().then(async () => {
  if (!process.argv.slice(2).length) {
    program.outputHelp();
    console.log(chalk.dim("\nTip: Start with 'mydeploy init' to analyze your project"));
    console.log(chalk.dim("      or 'mydeploy config set GEMINI_API_KEY <key>' to configure settings"));
  }
}).catch(error => {
  logger.error("CLI Error:", error.message);
  if (global.verbose) console.error(error);
  process.exit(1);
});

performPreflightChecks();