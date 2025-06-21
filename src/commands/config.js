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
