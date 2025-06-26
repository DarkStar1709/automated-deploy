import {
  ECSClient,
  CreateClusterCommand,
  DescribeClustersCommand,
  RegisterTaskDefinitionCommand,
  CreateServiceCommand,
  DescribeServicesCommand,
} from "@aws-sdk/client-ecs";

import {
  ECRClient,
  CreateRepositoryCommand,
  DescribeRepositoriesCommand,
} from "@aws-sdk/client-ecr";

import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand,
} from "@aws-sdk/client-iam";

import {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
} from "@aws-sdk/client-ec2";

import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import Logger from "../utils/logger.js";
const logger = new Logger();

/* ────────────────────────── MAIN ────────────────────────── */
export async function createResources({
  clusterName,
  serviceName,
  repositoryName,
  region = "us-east-1",
  taskDef = {},
}) {
  const ecs = new ECSClient({ region });
  const ecr = new ECRClient({ region });
  const iam = new IAMClient({ region });
  const ec2 = new EC2Client({ region });
  const sts = new STSClient({ region });

  logger.title("🏗️  Creating AWS Resources");

  const accountId = (await sts.send(new GetCallerIdentityCommand({}))).Account;

  const repositoryUri = await ensureECR(ecr, repositoryName);

  const clusterArn = await ensureCluster(ecs, clusterName);

  const executionRoleArn = await ensureRole(
    iam,
    accountId,
    "ecsTaskExecutionRole",
    "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
  );
  const taskRoleArn = await ensureRole(
    iam,
    accountId,
    "ecsTaskRole",
    "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
  );

  const networkConfig = await getNetworkConfig(ec2, repositoryName);

  const taskDefinitionArn = await registerTaskDefinition(ecs, {
    repositoryName,
    repositoryUri,
    executionRoleArn,
    taskRoleArn,
    containerPort: taskDef.containerPort || 3000,
    cpu: taskDef.cpu || "256",
    memory: taskDef.memory || "512",
    region,
  });

  const serviceArn = await ensureService(ecs, {
    clusterName,
    serviceName,
    taskDefinitionArn,
    networkConfig,
  });

  logger.success("🎯 Resources ready");
  return {
    repositoryUri,
    clusterName,
    clusterArn,
    serviceName,
    serviceArn,
    taskDefinitionArn,
    executionRoleArn,
    taskRoleArn,
  };
}

/* ────────────────────────── HELPERS ────────────────────────── */
async function ensureECR(ecr, repo) {
  try {
    const { repositories } = await ecr.send(
      new DescribeRepositoriesCommand({ repositoryNames: [repo] })
    );
    logger.success(`✅ ECR exists → ${repositories[0].repositoryUri}`);
    return repositories[0].repositoryUri;
  } catch (e) {
    if (e.name !== "RepositoryNotFoundException") throw e;
    logger.startSpinner("ecr", `Creating ECR repo ${repo}…`);
    const { repository } = await ecr.send(
      new CreateRepositoryCommand({
        repositoryName: repo,
        imageScanningConfiguration: { scanOnPush: true },
      })
    );
    logger.succeedSpinner("ecr", `✅ Created ECR repo → ${repository.repositoryUri}`);
    return repository.repositoryUri;
  }
}

async function ensureCluster(ecs, name) {
  const { clusters } = await ecs.send(
    new DescribeClustersCommand({ clusters: [name] })
  );
  if (clusters[0]?.status === "ACTIVE") {
    logger.success(`✅ Cluster exists → ${clusters[0].clusterArn}`);
    return clusters[0].clusterArn;
  }
  logger.startSpinner("cluster", `Creating cluster ${name}…`);
  const { cluster } = await ecs.send(
    new CreateClusterCommand({
      clusterName: name,
      capacityProviders: ["FARGATE"],
      defaultCapacityProviderStrategy: [{ capacityProvider: "FARGATE", weight: 1 }],
    })
  );
  logger.succeedSpinner("cluster", `✅ Created cluster → ${cluster.clusterArn}`);
  return cluster.clusterArn;
}

async function ensureRole(iam, account, roleName, policyArn) {
  const fullArn = `arn:aws:iam::${account}:role/${roleName}`;
  try {
    await iam.send(new GetRoleCommand({ RoleName: roleName }));
    logger.success(`✅ Role exists → ${fullArn}`);
  } catch {
    logger.startSpinner("iam", `Creating IAM role ${roleName}…`);
    await iam.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "ecs-tasks.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        }),
      })
    );
    await iam.send(
      new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn })
    );
    logger.succeedSpinner("iam", `✅ Created role → ${fullArn}`);
  }
  return fullArn;
}

async function getNetworkConfig(ec2, project) {
  const { Vpcs } = await ec2.send(
    new DescribeVpcsCommand({ Filters: [{ Name: "is-default", Values: ["true"] }] })
  );
  const vpcId = Vpcs[0].VpcId;
  const { Subnets } = await ec2.send(
    new DescribeSubnetsCommand({ Filters: [{ Name: "vpc-id", Values: [vpcId] }] })
  );
  const subnetIds = Subnets.map((s) => s.SubnetId);
  const sgId = await ensureSG(ec2, vpcId, project);
  return {
    subnets: subnetIds,
    securityGroups: [sgId],
    assignPublicIp: "ENABLED",
  };
}

async function ensureSG(ec2, vpcId, project) {
  const name = `${project}-sg`;
  const { SecurityGroups } = await ec2.send(
    new DescribeSecurityGroupsCommand({
      Filters: [
        { Name: "group-name", Values: [name] },
        { Name: "vpc-id", Values: [vpcId] },
      ],
    })
  );
  if (SecurityGroups.length) {
    logger.success(`✅ Security group exists → ${SecurityGroups[0].GroupId}`);
    return SecurityGroups[0].GroupId;
  }
  logger.startSpinner("sg", `Creating security group ${name}…`);
  const { GroupId } = await ec2.send(
    new CreateSecurityGroupCommand({
      GroupName: name,
      Description: `SG for ${project}`,
      VpcId: vpcId,
    })
  );
  await ec2.send(
    new AuthorizeSecurityGroupIngressCommand({
      GroupId,
      IpPermissions: [
        { IpProtocol: "tcp", FromPort: 80, ToPort: 80, IpRanges: [{ CidrIp: "0.0.0.0/0" }] },
        { IpProtocol: "tcp", FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: "0.0.0.0/0" }] },
        { IpProtocol: "tcp", FromPort: 3000, ToPort: 3000, IpRanges: [{ CidrIp: "0.0.0.0/0" }] },
      ],
    })
  );
  logger.succeedSpinner("sg", `✅ Created SG → ${GroupId}`);
  return GroupId;
}

async function registerTaskDefinition(
  ecs,
  {
    repositoryName,
    repositoryUri,
    executionRoleArn,
    taskRoleArn,
    containerPort,
    cpu,
    memory,
    region,
  }
) {
  const family = `${repositoryName}-task`;
  const { taskDefinition } = await ecs.send(
    new RegisterTaskDefinitionCommand({
      family,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu,
      memory,
      executionRoleArn,
      taskRoleArn,
      containerDefinitions: [
        {
          name: repositoryName,
          image: `${repositoryUri}:latest`,
          essential: true,
          portMappings: [{ containerPort, protocol: "tcp" }],
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": `/ecs/${family}`,
              "awslogs-region": region,
              "awslogs-stream-prefix": "ecs",
              "awslogs-create-group": "true",
            },
          },
        },
      ],
    })
  );
  logger.success(`✅ Task definition registered → ${taskDefinition.taskDefinitionArn}`);
  return taskDefinition.taskDefinitionArn;
}

async function ensureService(
  ecs,
  { clusterName, serviceName, taskDefinitionArn, networkConfig }
) {
  const { services } = await ecs.send(
    new DescribeServicesCommand({
      cluster: clusterName,
      services: [serviceName],
    })
  );
  if (services[0]?.status === "ACTIVE") {
    logger.success(`✅ Service active → ${services[0].serviceArn}`);
    return services[0].serviceArn;
  }
  logger.startSpinner("service", `Creating service ${serviceName}…`);
  const { service } = await ecs.send(
    new CreateServiceCommand({
      cluster: clusterName,
      serviceName,
      taskDefinition: taskDefinitionArn,
      desiredCount: 1,
      launchType: "FARGATE",
      enableExecuteCommand: true,
      networkConfiguration: { awsvpcConfiguration: networkConfig },
    })
  );
  logger.succeedSpinner("service", `✅ Created service → ${service.serviceArn}`);
  return service.serviceArn;
}
