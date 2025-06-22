// src/commands/deploy.js
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

  try {
    // Step 1: Validate Docker setup
    const dockerfilePath = path.join(resolvedPath, "Dockerfile");
    if (!fs.existsSync(dockerfilePath)) {
      logger.error("❌ Dockerfile not found. Run 'mydeploy init' first.");
      process.exit(1);
    }

    // Step 2: Generate names based on project
    const packageJsonPath = path.join(resolvedPath, "package.json");
    let projectName = "my-app";
    
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
      projectName = pkg.name || path.basename(resolvedPath);
    } else {
      projectName = path.basename(resolvedPath);
    }

    const sanitizedName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const clusterName = cluster || `${sanitizedName}-cluster`;
    const serviceName = service || `${sanitizedName}-service`;
    const repositoryName = `${sanitizedName}-${env}`;
    const imageName = `${repositoryName}:latest`;

    logger.debug("Generated names:", {
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

    // Step 3: Build Docker image
    logger.step(1, 4, "Building Docker image");
    await buildDockerImage(resolvedPath, imageName);

    // Step 4: Create AWS resources
    logger.step(2, 4, "Creating AWS resources");
    const resourceConfig = {
      clusterName,
      repositoryName,
      region,
      taskDef: {
        containerPort: 3000, // Default port, can be made configurable
        executionRoleArn: await getOrCreateExecutionRole(region),
        subnets: [], // Will be populated by createResources
        securityGroups: [] // Will be populated by createResources
      }
    };

    const { repositoryUri } = await createResources(resourceConfig);

    // Step 5: Push to ECR
    logger.step(3, 4, "Pushing to ECR");
    await pushToECR(imageName, repositoryUri, region);

    // Step 6: Deploy to ECS
    logger.step(4, 4, "Deploying to ECS");
    await deployToECS({
      clusterName,
      serviceName,
      repositoryUri,
      region,
      taskDefinition: `${repositoryName}-task`
    });

    logger.success("✅ Deployment completed successfully!");
    logger.info("🌐 Your application is being deployed to AWS ECS");
    
    // Display useful information
    logger.separator();
    logger.table([
      { Property: "Cluster", Value: clusterName },
      { Property: "Service", Value: serviceName },
      { Property: "Repository", Value: repositoryUri },
      { Property: "Region", Value: region },
      { Property: "Environment", Value: env }
    ]);

  } catch (error) {
    logger.error("❌ Deployment failed:", error.message);
    if (global.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

// Helper function to get or create execution role
async function getOrCreateExecutionRole(region) {
  // This would typically be implemented to check for existing role
  // or create a new one with proper ECS task execution permissions
  return `arn:aws:iam::${await getAccountId()}:role/ecsTaskExecutionRole`;
}

// Helper to get AWS account ID
async function getAccountId() {
  // This would use AWS SDK to get current account ID
  // For now, return a placeholder
  return "123456789012";
}