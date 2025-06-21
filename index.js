#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const packageJson = require('./package.json');

console.log('This package is a CLI tool. Use `mydeploy` command instead.');
console.log(chalk.cyan.bold(`
╔══════════════════════════════════════╗
║  🚀 Automated Deploy CLI v${packageJson.version}      ║
║   AI-Powered AWS ECS Deployment      ║
╚══════════════════════════════════════╝
`));
