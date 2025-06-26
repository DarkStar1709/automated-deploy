// src/commands/init.js

import path from "path";
import Logger from "../utils/logger.js";
import { analyzeProject } from "../ai/analyzeProject.js";

const logger = new Logger();

export default async function initCommand(projectPath = ".", options) {
  const resolvedPath = path.resolve(projectPath);

  logger.title("🔧 Init Command");
  logger.info("Project path:", resolvedPath);
  logger.debug("Options:", options);

  try {
    await analyzeProject(resolvedPath, options.ai !== false); 
    logger.success("✅ Initialization completed.");
  } catch (error) {
    logger.error("❌ Initialization failed:", error.message);
    if (global.verbose) console.error(error);
  }
}
