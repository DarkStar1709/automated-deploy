import { execa } from "execa";
import path from "path";
import fs from "fs-extra";
import logger from "./logger.js";

export async function buildDockerImage(projectPath, imageName) {
  const dockerfilePath = path.join(projectPath, "Dockerfile");

  if (!fs.existsSync(dockerfilePath)) {
    logger.error("❌ Dockerfile not found. Run `mydeploy init` first.");
    process.exit(1);
  }

  const spinnerId = "dockerBuild";
  logger.startSpinner(spinnerId, `Building Docker image: ${imageName}...`);

  try {
    await execa("docker", ["build", "-t", imageName, "."], {
      cwd: projectPath,
      stdout: global.verbose ? "inherit" : "pipe",
      stderr: global.verbose ? "inherit" : "pipe",
    });

    logger.succeedSpinner(spinnerId, `✅ Image built: ${imageName}`);
    return imageName;
  } catch (error) {
    logger.failSpinner(spinnerId, "❌ Failed to build Docker image");
    logger.debug(error.message);
    process.exit(1);
  }
}
