import path from "path";
import fs from "fs-extra";
import { buildDockerImage } from "../utils/docker.js";
import { pushToECR, deployToECS } from "../aws/deployToECS.js";
import { createResources } from "../aws/createResources.js";
import Logger from "../utils/logger.js";

const logger = new Logger();

export default async function deployCommand(projectPath = ".", options) {
  const resolvedPath = path.resolve(projectPath);
  const { env, region, cluster, service } = options;

  logger.title(`🚀 Deploy to ${env.toUpperCase()}`);
  logger.info("Project path:", resolvedPath);
  logger.info("Environment:", env);
  logger.info("Region:", region);

  const dockerfilePath = path.join(resolvedPath, "Dockerfile");
  if (!fs.existsSync(dockerfilePath)) {
    logger.error("❌ Dockerfile not found. Run 'mydeploy init' first.");
    process.exit(1);
  }

  const pkgPath = path.join(resolvedPath, "package.json");
  const projectName =
    fs.existsSync(pkgPath)
      ? JSON.parse(await fs.readFile(pkgPath, "utf8")).name ||
        path.basename(resolvedPath)
      : path.basename(resolvedPath);

  const sanitizedName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const clusterName =
    cluster || process.env.CLUSTER_NAME || `${sanitizedName}-cluster`;

  const serviceName =
    service || process.env.SERVICE_NAME || `${sanitizedName}-service`;

  const repositoryName = `${sanitizedName}-${env}`;
  const imageName = `${repositoryName}:latest`;

  logger.debug("Resolved names:", {
    clusterName,
    serviceName,
    repositoryName,
    imageName
  });

  if (global.dryRun) {
    logger.dryRun("Would build Docker image");
    logger.dryRun("Would create AWS resources");
    logger.dryRun("Would push to ECR");
    logger.dryRun("Would deploy to ECS");
    return;
  }

  try {
    logger.step(1, 4, "Building Docker image");
    await buildDockerImage(resolvedPath, imageName);

    logger.step(2, 4, "Creating AWS resources");
    const { repositoryUri } = await createResources({
      clusterName,
      serviceName,         
      region
    });

    logger.step(3, 4, "Pushing image to ECR");
    await pushToECR(imageName, repositoryUri, region);

    logger.step(4, 4, "Updating ECS service");
    await deployToECS({
      clusterName,
      serviceName,
      repositoryUri,
      region,
      localImageTag: imageName
    });

    logger.success("✅ Deployment completed!");
    logger.separator();
    logger.table([
      { Property: "Cluster", Value: clusterName },
      { Property: "Service", Value: serviceName },
      { Property: "Repository", Value: repositoryUri },
      { Property: "Region", Value: region },
      { Property: "Environment", Value: env }
    ]);
  } catch (err) {
    logger.error("❌ Deployment failed:", err.message);
    if (global.verbose) console.error(err);
    process.exit(1);
  }
}
