#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import chalk from "chalk";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import Logger from "../utils/logger.js";
import { getConfigValue, validateConfig } from "../src/commands/config.js";

const logger = new Logger();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const packageJson = require(path.resolve(__dirname, "../package.json"));

// Import commands
import initCommand from "../src/commands/init.js";
import deployCommand from "../src/commands/deploy.js";
import generateCICDCommand from "../src/commands/generateCICD.js";
import configCommand from "../src/commands/config.js";

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
    // Set global options
    global.verbose = thisCommand.opts().verbose;
    global.dryRun = thisCommand.opts().dryRun;

    // Set AWS profile if specified
    if (thisCommand.opts().profile) {
      process.env.AWS_PROFILE = thisCommand.opts().profile;
    }

    // Set AWS region if specified
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
    // Check for Gemini API key if AI is enabled
    if (options.ai !== false) {
      const geminiKey = await getConfigValue("gemini.apiKey") || process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        logger.warn("⚠️  Gemini API key not found. AI features will be disabled.");
        logger.info("Configure with: mydeploy config set gemini.apiKey <your-key>");
        logger.info("Or set GEMINI_API_KEY environment variable");
        options.ai = false;
      }
    }
    
    await initCommand(projectPath, options);
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
    // Validate AWS configuration
    const requiredConfig = [];
    
    // Check AWS credentials
    if (!process.env.AWS_PROFILE && !process.env.AWS_ACCESS_KEY_ID) {
      logger.error("❌ AWS credentials not configured");
      logger.info("Either set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY");
      logger.info("Or use: aws configure");
      process.exit(1);
    }

    // Set region from config if not provided
    if (!options.region) {
      options.region = await getConfigValue("aws.region") || process.env.AWS_DEFAULT_REGION || "us-east-1";
    }

    await deployCommand(projectPath, options);
  });

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
  .description("Configure API keys and settings")
  .argument("<action>", "Action: set, get, remove, list, init")
  .argument("[key]", "Configuration key")
  .argument("[value]", 'Value to set (for "set" action)')
  .action(configCommand);

// Additional utility commands
program
  .command("status")
  .description("Check deployment status")
  .option("--cluster <name>", "ECS cluster name")
  .option("--service <name>", "ECS service name")
  .option("--region <region>", "AWS region")
  .action(async (options) => {
    logger.info("Checking deployment status...");
    
    // Set region from config if not provided
    if (!options.region) {
      options.region = await getConfigValue("aws.region") || process.env.AWS_DEFAULT_REGION || "us-east-1";
    }
    
    // Implementation placeholder
    logger.warn("Status command not yet implemented");
    logger.info("Coming soon: Real-time deployment status and health checks");
  });

program
  .command("logs")
  .description("View application logs")
  .option("--cluster <name>", "ECS cluster name")
  .option("--service <name>", "ECS service name")
  .option("--region <region>", "AWS region")
  .option("--tail", "Follow log output")
  .option("--lines <count>", "Number of lines to show", "100")
  .action(async (options) => {
    logger.info("Fetching logs...");
    
    // Set region from config if not provided
    if (!options.region) {
      options.region = await getConfigValue("aws.region") || process.env.AWS_DEFAULT_REGION || "us-east-1";
    }
    
    // Implementation placeholder
    logger.warn("Logs command not yet implemented");
    logger.info("Coming soon: CloudWatch logs integration");
  });

program
  .command("cleanup")
  .description("Clean up AWS resources")
  .option("--cluster <name>", "ECS cluster name")
  .option("--repository <name>", "ECR repository name")
  .option("--region <region>", "AWS region")
  .option("--force", "Skip confirmation prompts")
  .action(async (options) => {
    logger.info("Cleaning up resources...");
    
    // Set region from config if not provided
    if (!options.region) {
      options.region = await getConfigValue("aws.region") || process.env.AWS_DEFAULT_REGION || "us-east-1";
    }
    
    // Implementation placeholder
    logger.warn("Cleanup command not yet implemented");
    logger.info("Coming soon: Safe resource cleanup with confirmation");
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

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (global.verbose) {
    console.error(reason);
  }
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error.message);
  if (global.verbose) {
    console.error(error);
  }
  process.exit(1);
});

// Environment and dependency checks
async function performPreflightChecks() {
  const warnings = [];
  
  // Check Docker
  try {
    const { execa } = await import("execa");
    await execa("docker", ["--version"], { stdout: "pipe" });
  } catch (error) {
    warnings.push("Docker not found or not running");
  }
  
  // Check AWS CLI (optional but recommended)
  try {
    const { execa } = await import("execa");
    await execa("aws", ["--version"], { stdout: "pipe" });
  } catch (error) {
    warnings.push("AWS CLI not found (optional but recommended)");
  }
  
  // Check Gemini API key
  const geminiKey = await getConfigValue("gemini.apiKey") || process.env.GEMINI_API_KEY;
  if (!geminiKey && !program.args.includes("config")) {
    warnings.push("Gemini API key not configured (AI features will be limited)");
  }
  
  // Display warnings if any
  if (warnings.length > 0 && global.verbose) {
    logger.warn("⚠️  Preflight checks found issues:");
    warnings.forEach(warning => {
      console.log(chalk.yellow(`  • ${warning}`));
    });
    console.log();
  }
}

// Parse command line arguments
program.parseAsync().then(async () => {
  // Show help if no command provided
  if (!process.argv.slice(2).length) {
    program.outputHelp();
    console.log(chalk.dim("\nTip: Start with 'mydeploy init' to analyze your project"));
    console.log(chalk.dim("      or 'mydeploy config init' to configure settings"));
  }
}).catch(error => {
  logger.error("CLI Error:", error.message);
  if (global.verbose) {
    console.error(error);
  }
  process.exit(1);
});

performPreflightChecks();