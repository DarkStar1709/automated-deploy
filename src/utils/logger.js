import chalk from 'chalk';
import logSymbols from 'log-symbols';
import ora from 'ora';

class Logger {
  constructor() {
    this.spinners = new Map();
  }

  // Basic logging methods
  info(message, ...args) {
    console.log(logSymbols.info, chalk.blue(message), ...args);
  }

  success(message, ...args) {
    console.log(logSymbols.success, chalk.green(message), ...args);
  }

  warn(message, ...args) {
    console.log(logSymbols.warning, chalk.yellow(message), ...args);
  }

  error(message, ...args) {
    console.log(logSymbols.error, chalk.red(message), ...args);
  }

  debug(message, ...args) {
    if (global.verbose) {
      console.log(chalk.dim('🐛 DEBUG:'), chalk.dim(message), ...args);
    }
  }

  // Spinner methods for long-running operations
  startSpinner(id, message, options = {}) {
    const spinner = ora({
      text: message,
      color: options.color || 'cyan',
      spinner: options.spinner || 'dots'
    }).start();
    
    this.spinners.set(id, spinner);
    return spinner;
  }

  updateSpinner(id, message) {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.text = message;
    }
  }

  succeedSpinner(id, message) {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.succeed(message);
      this.spinners.delete(id);
    }
  }

  failSpinner(id, message) {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.fail(message);
      this.spinners.delete(id);
    }
  }

  stopSpinner(id) {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.stop();
      this.spinners.delete(id);
    }
  }

  // Formatted output methods
  title(message) {
    console.log('\n' + chalk.cyan.bold('═'.repeat(50)));
    console.log(chalk.cyan.bold(`  ${message}`));
    console.log(chalk.cyan.bold('═'.repeat(50)));
  }

  subtitle(message) {
    console.log('\n' + chalk.blue.bold(`▶ ${message}`));
  }

  step(number, total, message) {
    const progress = chalk.dim(`[${number}/${total}]`);
    console.log(`\n${progress} ${chalk.bold(message)}`);
  }

  table(data, options = {}) {
    if (!Array.isArray(data) || data.length === 0) {
      this.warn('No data to display');
      return;
    }

    const headers = options.headers || Object.keys(data[0]);
    const maxWidths = {};

    // Calculate column widths
    headers.forEach(header => {
      maxWidths[header] = Math.max(
        header.length,
        ...data.map(row => String(row[header] || '').length)
      );
    });

    // Print headers
    const headerRow = headers.map(header => 
      chalk.bold(header.padEnd(maxWidths[header]))
    ).join(' │ ');
    console.log('┌' + '─'.repeat(headerRow.length - 10) + '┐');
    console.log('│ ' + headerRow + ' │');
    console.log('├' + '─'.repeat(headerRow.length - 10) + '┤');

    // Print data rows
    data.forEach(row => {
      const dataRow = headers.map(header => 
        String(row[header] || '').padEnd(maxWidths[header])
      ).join(' │ ');
      console.log('│ ' + dataRow + ' │');
    });
    console.log('└' + '─'.repeat(headerRow.length - 10) + '┘');
  }

  code(code, language = '') {
    console.log(chalk.dim('```' + language));
    console.log(chalk.white(code));
    console.log(chalk.dim('```'));
  }

  separator() {
    console.log(chalk.dim('─'.repeat(60)));
  }

  // Progress bar for file operations
  progressBar(current, total, message = '') {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * 20);
    const empty = 20 - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const progress = `${chalk.cyan(bar)} ${percentage}% ${message}`;
    
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(progress);
    
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  // Dry run indicator
  dryRun(message) {
    if (global.dryRun) {
      console.log(chalk.yellow('🔍 DRY RUN:'), chalk.dim(message));
    }
  }

  // Interactive prompts results
  promptResult(question, answer) {
    console.log(chalk.dim(`  ${question}:`), chalk.white(answer));
  }

  // Command execution logging
  command(cmd) {
    if (global.verbose) {
      console.log(chalk.dim('$ '), chalk.cyan(cmd));
    }
  }

  // File operations
  fileOperation(operation, file) {
    const operations = {
      create: { symbol: '✨', color: 'green', verb: 'Created' },
      update: { symbol: '📝', color: 'yellow', verb: 'Updated' },
      delete: { symbol: '🗑️', color: 'red', verb: 'Deleted' },
      read: { symbol: '📖', color: 'blue', verb: 'Read' }
    };

    const op = operations[operation] || operations.create;
    console.log(
      chalk[op.color](op.symbol), 
      chalk[op.color](op.verb), 
      chalk.dim(file)
    );
  }

  // Network operations
  network(method, url, status) {
    const statusColor = status >= 200 && status < 300 ? 'green' : 'red';
    console.log(
      chalk.blue('🌐'),
      chalk.bold(method.toUpperCase()),
      chalk.dim(url),
      chalk[statusColor](`[${status}]`)
    );
  }

  // AWS operations
  aws(service, operation, resource) {
    console.log(
      chalk.hex('#FFA500')('☁️'),
      chalk.bold(service),
      chalk.dim(operation),
      chalk.white(resource)
    );
  }
}

export default Logger;