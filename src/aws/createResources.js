// src/aws/createResources.js
import {
  ECSClient,
  CreateClusterCommand,
  DescribeClustersCommand,
  RegisterTaskDefinitionCommand,
  CreateServiceCommand,
  DescribeServicesCommand
} from "@aws-sdk/client-ecs";

import {
  ECRClient,
  CreateRepositoryCommand,
  DescribeRepositoriesCommand
} from "@aws-sdk/client-ecr";

import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand
} from "@aws-sdk/client-iam";

import {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand
} from "@aws-sdk/client-ec2";

import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

import Logger from "../utils/logger.js";

const logger = new Logger();

export async function createResources({ 
  clusterName, 
  repositoryName, 
  region = "us-east-1",
  taskDef = {} 
}) {
  const ecs = new ECSClient({ region });
  const ecr = new ECRClient({ region });
  const iam = new IAMClient({ region });
  const ec2 = new EC2Client({ region });
  const sts = new STSClient({ region });

  logger.title("🏗️ Creating AWS Resources");

  try {
    // Get AWS Account ID
    const accountId = await getAccountId(sts);
    logger.debug("AWS Account ID:", accountId);

    // Step 1: Create or find ECR repository
    const repositoryUri = await ensureECRRepository(ecr, repositoryName);

    // Step 2: Create or find ECS cluster
    await ensureECSCluster(ecs, clusterName);

    // Step 3: Create or find IAM execution role
    const executionRoleArn = await ensureExecutionRole(iam, accountId);

    // Step 4: Get VPC and networking info
    const networkConfig = await getNetworkConfiguration(ec2, repositoryName);

    // Step 5: Register task definition
    const taskDefinitionArn = await registerTaskDefinition(ecs, {
      repositoryName,
      repositoryUri,
      executionRoleArn,
      containerPort: taskDef.containerPort || 3000,
      cpu: taskDef.cpu || "256",
      memory: taskDef.memory || "512"
    });

    // Step 6: Create ECS service
    await createECSService(ecs, {
      clusterName,
      serviceName: `${repositoryName}-service`,
      taskDefinitionArn,
      networkConfig
    });

    logger.success("🎯 All AWS resources created successfully!");
    
    return {
      repositoryUri,
      clusterName,
      serviceName: `${repositoryName}-service`,
      taskDefinitionArn,
      executionRoleArn,
      networkConfig
    };

  } catch (error) {
    logger.error("❌ Failed to create AWS resources:", error.message);
    throw error;
  }
}

async function getAccountId(sts) {
  try {
    const result = await sts.send(new GetCallerIdentityCommand({}));
    return result.Account;
  } catch (error) {
    logger.error("Failed to get AWS account ID:", error.message);
    throw error;
  }
}

async function ensureECRRepository(ecr, repositoryName) {
  try {
    const result = await ecr.send(new DescribeRepositoriesCommand({
      repositoryNames: [repositoryName]
    }));
    
    const repositoryUri = result.repositories[0].repositoryUri;
    logger.success(`✅ ECR repository exists: ${repositoryUri}`);
    return repositoryUri;
    
  } catch (error) {
    if (error.name === "RepositoryNotFoundException") {
      logger.startSpinner("ecr-create", `Creating ECR repository: ${repositoryName}`);
      
      const result = await ecr.send(new CreateRepositoryCommand({
        repositoryName,
        imageScanningConfiguration: {
          scanOnPush: true
        }
      }));
      
      const repositoryUri = result.repository.repositoryUri;
      logger.succeedSpinner("ecr-create", `✅ ECR repository created: ${repositoryUri}`);
      return repositoryUri;
    }
    throw error;
  }
}

async function ensureECSCluster(ecs, clusterName) {
  try {
    const result = await ecs.send(new DescribeClustersCommand({
      clusters: [clusterName]
    }));
    
    if (result.clusters.length > 0 && result.clusters[0].status === "ACTIVE") {
      logger.success(`✅ ECS cluster exists: ${clusterName}`);
      return;
    }
  } catch (error) {
    // Cluster doesn't exist, create it
  }

  logger.startSpinner("ecs-cluster", `Creating ECS cluster: ${clusterName}`);
  
  await ecs.send(new CreateClusterCommand({
    clusterName,
    capacityProviders: ["FARGATE"],
    defaultCapacityProviderStrategy: [
      {
        capacityProvider: "FARGATE",
        weight: 1
      }
    ]
  }));
  
  logger.succeedSpinner("ecs-cluster", `✅ ECS cluster created: ${clusterName}`);
}

async function ensureExecutionRole(iam, accountId) {
  const roleName = "ecsTaskExecutionRole";
  const roleArn = `arn:aws:iam::${accountId}:role/${roleName}`;

  try {
    await iam.send(new GetRoleCommand({ RoleName: roleName }));
    logger.success(`✅ IAM execution role exists: ${roleName}`);
    return roleArn;
  } catch (error) {
    if (error.name === "NoSuchEntityException") {
      logger.startSpinner("iam-role", `Creating IAM execution role: ${roleName}`);
      
      // Create the role
      await iam.send(new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Service: "ecs-tasks.amazonaws.com"
              },
              Action: "sts:AssumeRole"
            }
          ]
        })
      }));

      // Attach the AWS managed policy
      await iam.send(new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
      }));

      logger.succeedSpinner("iam-role", `✅ IAM execution role created: ${roleName}`);
      return roleArn;
    }
    throw error;
  }
}

async function getNetworkConfiguration(ec2, projectName) {
  try {
    // Get default VPC
    const vpcs = await ec2.send(new DescribeVpcsCommand({
      Filters: [{ Name: "is-default", Values: ["true"] }]
    }));
    
    if (vpcs.Vpcs.length === 0) {
      throw new Error("No default VPC found");
    }
    
    const defaultVpc = vpcs.Vpcs[0];
    logger.debug(`Using default VPC: ${defaultVpc.VpcId}`);

    // Get public subnets
    const subnets = await ec2.send(new DescribeSubnetsCommand({
      Filters: [
        { Name: "vpc-id", Values: [defaultVpc.VpcId] },
        { Name: "default-for-az", Values: ["true"] }
      ]
    }));

    const subnetIds = subnets.Subnets.map(subnet => subnet.SubnetId);
    logger.debug(`Found subnets: ${subnetIds.join(", ")}`);

    // Create or find security group
    const securityGroupId = await ensureSecurityGroup(ec2, defaultVpc.VpcId, projectName);

    return {
      subnets: subnetIds,
      securityGroups: [securityGroupId],
      assignPublicIp: "ENABLED"
    };

  } catch (error) {
    logger.error("Failed to get network configuration:", error.message);
    throw error;
  }
}

async function ensureSecurityGroup(ec2, vpcId, projectName) {
  const groupName = `${projectName}-sg`;
  const groupDescription = `Security group for ${projectName} ECS service`;

  try {
    // Check if security group exists
    const result = await ec2.send(new DescribeSecurityGroupsCommand({
      Filters: [
        { Name: "group-name", Values: [groupName] },
        { Name: "vpc-id", Values: [vpcId] }
      ]
    }));

    if (result.SecurityGroups.length > 0) {
      const securityGroupId = result.SecurityGroups[0].GroupId;
      logger.success(`✅ Security group exists: ${securityGroupId}`);
      return securityGroupId;
    }

  } catch (error) {
    // Security group doesn't exist, create it
  }

  logger.startSpinner("security-group", `Creating security group: ${groupName}`);

  // Create security group
  const createResult = await ec2.send(new CreateSecurityGroupCommand({
    GroupName: groupName,
    Description: groupDescription,
    VpcId: vpcId
  }));

  const securityGroupId = createResult.GroupId;

  // Add ingress rules
  await ec2.send(new AuthorizeSecurityGroupIngressCommand({
    GroupId: securityGroupId,
    IpPermissions: [
      {
        IpProtocol: "tcp",
        FromPort: 3000,
        ToPort: 3000,
        IpRanges: [{ CidrIp: "0.0.0.0/0" }]
      },
      {
        IpProtocol: "tcp",
        FromPort: 80,
        ToPort: 80,
        IpRanges: [{ CidrIp: "0.0.0.0/0" }]
      },
      {
        IpProtocol: "tcp",
        FromPort: 443,
        ToPort: 443,
        IpRanges: [{ CidrIp: "0.0.0.0/0" }]
      }
    ]
  }));

  logger.succeedSpinner("security-group", `✅ Security group created: ${securityGroupId}`);
  return securityGroupId;
}

async function registerTaskDefinition(ecs, {
  repositoryName,
  repositoryUri,
  executionRoleArn,
  containerPort,
  cpu,
  memory
}) {
  const taskDefName = `${repositoryName}-task`;
  
  logger.startSpinner("task-def", `Registering task definition: ${taskDefName}`);

  const params = {
    family: taskDefName,
    requiresCompatibilities: ["FARGATE"],
    networkMode: "awsvpc",
    cpu,
    memory,
    executionRoleArn,
    containerDefinitions: [
      {
        name: repositoryName,
        image: `${repositoryUri}:latest`,
        essential: true,
        portMappings: [
          {
            containerPort: parseInt(containerPort),
            protocol: "tcp"
          }
        ],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": `/ecs/${taskDefName}`,
            "awslogs-region": "us-east-1", // Should be parameterized
            "awslogs-stream-prefix": "ecs",
            "awslogs-create-group": "true"
          }
        }
      }
    ]
  };

  const result = await ecs.send(new RegisterTaskDefinitionCommand(params));
  const taskDefinitionArn = result.taskDefinition.taskDefinitionArn;
  
  logger.succeedSpinner("task-def", `✅ Task definition registered: ${taskDefinitionArn}`);
  return taskDefinitionArn;
}

async function createECSService(ecs, {
  clusterName,
  serviceName,
  taskDefinitionArn,
  networkConfig
}) {
  try {
    // Check if service already exists
    const existingServices = await ecs.send(new DescribeServicesCommand({
      cluster: clusterName,
      services: [serviceName]
    }));

    if (existingServices.services.length > 0 && 
        existingServices.services[0].status === "ACTIVE") {
      logger.success(`✅ ECS service already exists: ${serviceName}`);
      return existingServices.services[0].serviceArn;
    }
  } catch (error) {
    // Service doesn't exist, create it
  }

  logger.startSpinner("ecs-service", `Creating ECS service: ${serviceName}`);

  const result = await ecs.send(new CreateServiceCommand({
    cluster: clusterName,
    serviceName,
    taskDefinition: taskDefinitionArn,
    desiredCount: 1,
    launchType: "FARGATE",
    networkConfiguration: {
      awsvpcConfiguration: networkConfig
    },
    enableExecuteCommand: true // Enable ECS Exec for debugging
  }));

  logger.succeedSpinner("ecs-service", `✅ ECS service created: ${result.service.serviceArn}`);
  return result.service.serviceArn;
}