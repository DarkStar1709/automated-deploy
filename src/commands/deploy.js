// src/commands/deploy.js

import path from "path";
import fs from "fs-extra";
import logger from "../utils/logger.js";
import { buildDockerImage } from "../utils/docker.js";

export default async function deployCommand(projectPath, options) {
  console.log("🚀 Deploy command triggered!");
  console.log("Project path:", projectPath);
  console.log("Options:", options);  
  try {
    const resolvedPath = path.resolve(projectPath);

    // Optionally read package.json to name image dynamically
    const pkgPath = path.join(resolvedPath, "package.json");
    let imageName = "mydeploy-app:latest";

    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      imageName = `${pkg.name || "mydeploy-app"}:latest`;
    }

    logger.title("🚀 Starting deployment...");

    // Step 1: Build Docker image
    await buildDockerImage(resolvedPath, imageName);

    // TODO: Next steps - push image to ECR, deploy to ECS
    logger.success("🎉 Deployment process completed (build stage)");

  } catch (err) {
    logger.error(`Deployment failed: ${err.message}`);
    process.exit(1);
  }
}
