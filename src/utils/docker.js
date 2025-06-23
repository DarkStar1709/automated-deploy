import { execa } from "execa";
import path from "path";
import fs from "fs-extra";
import Logger from "../utils/logger.js";
const logger = new Logger();

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

  if (error.stderr) {
    logger.error("Docker Error Output:\n" + error.stderr);
  } else {
    logger.error("Error:\n" + error.message);
  }

  process.exit(1);
}

}
