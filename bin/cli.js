#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import chalk from "chalk";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import Logger from "../utils/logger.js";

const logger = new Logger();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const packageJson = require(path.resolve(__dirname, "../package.json"));


// Import commands
import initCommand from "../src/commands/init.js";
import deployCommand from "../src/commands/deploy.js";
import generateCICDCommand from "../src/commands/generateCICD.js";

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
  .hook("preAction", (thisCommand) => {
    // Set global options
    global.verbose = thisCommand.opts().verbose;
    global.dryRun = thisCommand.opts().dryRun;

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
  .action(initCommand);

program
  .command("deploy")
  .description("Build, push and deploy to AWS ECS")
  .argument("[project-path]", "Path to project directory", ".")
  .option("-e, --env <environment>", "Deployment environment", "production")
  .option("--region <region>", "AWS region", "us-east-1")
  .option("--cluster <name>", "ECS cluster name")
  .option("--service <name>", "ECS service name")
  .action(deployCommand);

program
  .command("generate-cicd")
  .description("Generate GitHub Actions CI/CD workflow")
  .argument("[project-path]", "Path to project directory", ".")
  .option("--provider <provider>", "CI/CD provider", "github")
  .option(
    "--env <environments>",
    "Deployment environments (comma-separated)",
    "staging,production"
  )
  .action(generateCICDCommand);

program
  .command("config")
  .description("Configure API keys")
  .argument("<action>", "set or get")
  .argument("<key>", "config key")
  .argument("[value]", 'value to set (if using "set")')
  .action((action, key, value) => {
    if (action === "set") {
      if (!value) {
        console.log(chalk.red("Value required for setting config."));
        process.exit(1);
      }
      setConfig(key, value);
      console.log(chalk.green(`✅ ${key} set successfully.`));
    } else if (action === "get") {
      const result = getConfigValue(key);
      if (result) {
        console.log(chalk.cyan(`${key} = ${result}`));
      } else {
        console.log(chalk.yellow(`⚠️  No value set for ${key}`));
      }
    } else {
      console.log(chalk.red('Unknown action. Use "set" or "get".'));
    }
  });

// Additional utility commands
program
  .command("status")
  .description("Check deployment status")
  .option("--cluster <name>", "ECS cluster name")
  .option("--service <name>", "ECS service name")
  .action(async (options) => {
    const logger = require("../src/utils/logger");
    logger.info("Checking deployment status...");
    // Implementation will be added later
    logger.warn("Status command not yet implemented");
  });

program
  .command("logs")
  .description("View application logs")
  .option("--cluster <name>", "ECS cluster name")
  .option("--service <name>", "ECS service name")
  .option("--tail", "Follow log output")
  .action(async (options) => {
    logger.info("Fetching logs...");
    // Implementation will be added later
    logger.warn("Logs command not yet implemented");
  });

// Error handling
program.configureOutput({
  writeErr: (str) => process.stderr.write(chalk.red(str)),
});

program.exitOverride((err) => {
  if (err.code === "commander.help") {
    process.exit(0);
  }
  if (err.code === "commander.version") {
    process.exit(0);
  }
  console.error(chalk.red("Error:"), err.message);
  process.exit(1);
});

// Environment checks
if (
  !process.env.GEMINI_API_KEY &&
  !program.args.includes("--help") &&
  !program.args.includes("-h")
) {
  console.warn(
    chalk.yellow("⚠️  Warning: GEMINI_API_KEY not found in environment")
  );
  console.log(
    chalk.dim(
      "Some AI features may not work. Set it in .env file or environment."
    )
  );
}


// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
} else {
  program.parse();
}
