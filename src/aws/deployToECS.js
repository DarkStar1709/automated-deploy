// src/aws/deployToECS.js
import {
  ECSClient,
  UpdateServiceCommand,
  DescribeServicesCommand,
  RegisterTaskDefinitionCommand,
  DescribeTaskDefinitionCommand
} from "@aws-sdk/client-ecs";

import {
  ECRClient,
  GetAuthorizationTokenCommand,
  BatchGetImageCommand
} from "@aws-sdk/client-ecr";

import { execa } from "execa";
import Logger from "../utils/logger.js";

const logger = new Logger();

export async function pushToECR(localImageName, repositoryUri, region) {
  const ecr = new ECRClient({ region });
  
  try {
    // Get ECR login token
    logger.startSpinner("ecr-auth", "Authenticating with ECR...");
    const authResult = await ecr.send(new GetAuthorizationTokenCommand({}));
    const authToken = authResult.authorizationData[0].authorizationToken;
    const [username, password] = Buffer.from(authToken, 'base64').toString().split(':');
    const registryUrl = authResult.authorizationData[0].proxyEndpoint;
    
    logger.succeedSpinner("ecr-auth", "✅ ECR authentication successful");

    // Docker login to ECR
    logger.startSpinner("docker-login", "Logging into ECR registry...");
    await execa("docker", ["login", "--username", username, "--password-stdin", registryUrl], {
      input: password,
      stdout: global.verbose ? "inherit" : "pipe",
      stderr: global.verbose ? "inherit" : "pipe"
    });
    logger.succeedSpinner("docker-login", "✅ Docker login successful");

    // Tag image for ECR
    const ecrImageName = `${repositoryUri}:latest`;
    logger.startSpinner("docker-tag", `Tagging image: ${ecrImageName}`);
    await execa("docker", ["tag", localImageName, ecrImageName], {
      stdout: global.verbose ? "inherit" : "pipe",
      stderr: global.verbose ? "inherit" : "pipe"
    });
    logger.succeedSpinner("docker-tag", "✅ Image tagged successfully");

    // Push to ECR
    logger.startSpinner("docker-push", `Pushing to ECR: ${ecrImageName}`);
    await execa("docker", ["push", ecrImageName], {
      stdout: global.verbose ? "inherit" : "pipe",
      stderr: global.verbose ? "inherit" : "pipe"
    });
    logger.succeedSpinner("docker-push", "✅ Image pushed to ECR successfully");

    return ecrImageName;

  } catch (error) {
    logger.error("❌ Failed to push to ECR:", error.message);
    throw error;
  }
}

export async function deployToECS({
  clusterName,
  serviceName,
  repositoryUri,
  region,
  taskDefinition
}) {
  const ecs = new ECSClient({ region });

  try {
    // Check if service exists
    logger.startSpinner("service-check", "Checking ECS service status...");
    let serviceExists = false;
    let currentTaskDef = null;

    try {
      const serviceResult = await ecs.send(new DescribeServicesCommand({
        cluster: clusterName,
        services: [serviceName]
      }));

      if (serviceResult.services.length > 0 && serviceResult.services[0].status === "ACTIVE") {
        serviceExists = true;
        currentTaskDef = serviceResult.services[0].taskDefinition;
        logger.succeedSpinner("service-check", "✅ Found existing ECS service");
      } else {
        logger.succeedSpinner("service-check", "ℹ️ ECS service not found or inactive");
      }
    } catch (error) {
      logger.succeedSpinner("service-check", "ℹ️ ECS service not found");
    }

    if (!serviceExists) {
      logger.error("❌ ECS service not found. Please run resource creation first.");
      throw new Error("ECS service not found");
    }

    // Get current task definition
    logger.startSpinner("task-def-fetch", "Fetching current task definition...");
    const taskDefResult = await ecs.send(new DescribeTaskDefinitionCommand({
      taskDefinition: currentTaskDef
    }));
    logger.succeedSpinner("task-def-fetch", "✅ Task definition fetched");

    // Create new task definition with updated image
    logger.startSpinner("task-def-update", "Creating new task definition...");
    const oldTaskDef = taskDefResult.taskDefinition;
    
    // Update container image
    const updatedContainers = oldTaskDef.containerDefinitions.map(container => ({
      ...container,
      image: `${repositoryUri}:latest`
    }));

    const newTaskDefParams = {
      family: oldTaskDef.family,
      taskRoleArn: oldTaskDef.taskRoleArn,
      executionRoleArn: oldTaskDef.executionRoleArn,
      networkMode: oldTaskDef.networkMode,
      requiresCompatibilities: oldTaskDef.requiresCompatibilities,
      cpu: oldTaskDef.cpu,
      memory: oldTaskDef.memory,
      containerDefinitions: updatedContainers
    };

    const newTaskDefResult = await ecs.send(new RegisterTaskDefinitionCommand(newTaskDefParams));
    const newTaskDefArn = newTaskDefResult.taskDefinition.taskDefinitionArn;
    logger.succeedSpinner("task-def-update", `✅ New task definition created: ${newTaskDefArn}`);

    // Update service with new task definition
    logger.startSpinner("service-update", "Updating ECS service...");
    await ecs.send(new UpdateServiceCommand({
      cluster: clusterName,
      service: serviceName,
      taskDefinition: newTaskDefArn,
      forceNewDeployment: true
    }));
    logger.succeedSpinner("service-update", "✅ ECS service updated successfully");

    // Wait for deployment to stabilize
    logger.startSpinner("deployment-wait", "Waiting for deployment to complete...");
    await waitForDeployment(ecs, clusterName, serviceName);
    logger.succeedSpinner("deployment-wait", "✅ Deployment completed successfully");

    logger.aws("ECS", "DEPLOY", `${clusterName}/${serviceName}`);
    return newTaskDefArn;

  } catch (error) {
    logger.error("❌ Failed to deploy to ECS:", error.message);
    throw error;
  }
}

async function waitForDeployment(ecs, clusterName, serviceName, maxWaitTime = 10 * 60 * 1000) {
  const startTime = Date.now();
  const pollInterval = 15000; // 15 seconds

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const result = await ecs.send(new DescribeServicesCommand({
        cluster: clusterName,
        services: [serviceName]
      }));

      const service = result.services[0];
      const deployments = service.deployments;
      
      // Check if primary deployment is stable
      const primaryDeployment = deployments.find(d => d.status === "PRIMARY");
      if (primaryDeployment && primaryDeployment.runningCount === primaryDeployment.desiredCount) {
        // Check if there are any other deployments still running
        const otherDeployments = deployments.filter(d => d.status !== "PRIMARY");
        if (otherDeployments.length === 0) {
          return; // Deployment is stable
        }
      }

      logger.debug(`Deployment in progress. Running: ${primaryDeployment?.runningCount || 0}, Desired: ${primaryDeployment?.desiredCount || 0}`);
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (error) {
      logger.debug("Error checking deployment status:", error.message);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error("Deployment timed out");
}