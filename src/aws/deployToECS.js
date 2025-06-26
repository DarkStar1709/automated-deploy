// src/aws/deployToECS.js
import {
  ECSClient,
  UpdateServiceCommand,
  DescribeServicesCommand,
  RegisterTaskDefinitionCommand,
  DescribeTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import { ECRClient, GetAuthorizationTokenCommand } from "@aws-sdk/client-ecr";
import {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
} from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { execa } from "execa";
import Logger from "../utils/logger.js";

const logger = new Logger();

/* ------------------------------------------------------------------ */
/* 1. Push local Docker image to ECR                                   */
/* ------------------------------------------------------------------ */
export async function pushToECR(localImage, repositoryUri, region) {
  const ecr = new ECRClient({ region });
  logger.startSpinner("ecr-auth", "Authenticating with ECR…");
  const { authorizationData } = await ecr.send(
    new GetAuthorizationTokenCommand({})
  );
  const auth = authorizationData[0];
  const [user, pass] = Buffer.from(auth.authorizationToken, "base64")
    .toString()
    .split(":");
  await execa(
    "docker",
    ["login", "--username", user, "--password-stdin", auth.proxyEndpoint],
    { input: pass, stdio: global.verbose ? "inherit" : "pipe" }
  );
  logger.succeedSpinner("ecr-auth", "✅ Logged into ECR");

  const remoteTag = `${repositoryUri}:latest`;
  logger.startSpinner("ecr-push", `Pushing image ${remoteTag}`);
  await execa("docker", ["tag", localImage, remoteTag], {
    stdio: global.verbose ? "inherit" : "pipe",
  });
  await execa("docker", ["push", remoteTag], {
    stdio: global.verbose ? "inherit" : "pipe",
  });
  logger.succeedSpinner("ecr-push", "✅ Image pushed");
  return remoteTag;
}

/* ------------------------------------------------------------------ */
/* 2. Ensure/return ARN of execution role                              */
/* ------------------------------------------------------------------ */
async function ensureExecutionRole(region, roleName = "ecsTaskExecutionRole") {
  const iam = new IAMClient({ region });
  const sts = new STSClient({ region });
  const { Account } = await sts.send(new GetCallerIdentityCommand({}));
  const roleArn = `arn:aws:iam::${Account}:role/${roleName}`;

  try {
    await iam.send(new GetRoleCommand({ RoleName: roleName }));
  } catch {
    logger.info(`Creating execution role ${roleName}`);
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
  }

  const { AttachedPolicies } = await iam.send(
    new ListAttachedRolePoliciesCommand({ RoleName: roleName })
  );
  const policyArn =
    "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy";
  if (!AttachedPolicies.some((p) => p.PolicyArn === policyArn)) {
    await iam.send(
      new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn })
    );
  }
  return roleArn;
}

/* ------------------------------------------------------------------ */
/* 3. Ensure/return ARN of task role                                   */
/* ------------------------------------------------------------------ */
async function ensureTaskRole(region, roleName = "ecsTaskRole") {
  const iam = new IAMClient({ region });
  const sts = new STSClient({ region });
  const { Account } = await sts.send(new GetCallerIdentityCommand({}));
  const roleArn = `arn:aws:iam::${Account}:role/${roleName}`;

  try {
    await iam.send(new GetRoleCommand({ RoleName: roleName }));
  } catch {
    logger.info(`Creating task role ${roleName}`);
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
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
      })
    );
  }
  return roleArn;
}

/* ------------------------------------------------------------------ */
/* 4. Deploy to ECS                                                   */
/* ------------------------------------------------------------------ */
export async function deployToECS({
  clusterName,
  serviceName,
  repositoryUri,
  region = "us-east-1",
  localImageTag = "latest",
}) {
  const ecs = new ECSClient({ region });
  logger.title("🚀 Deploying to ECS");

  const executionRoleArn = await ensureExecutionRole(region);
  const taskRoleArn = await ensureTaskRole(region);

  await pushToECR(localImageTag, repositoryUri, region);

  const { services } = await ecs.send(
    new DescribeServicesCommand({
      cluster: clusterName,
      services: [serviceName],
    })
  );
  if (!services.length) {
    throw new Error(
      `Service ${serviceName} not found in cluster ${clusterName}`
    );
  }
  const currentDefArn = services[0].taskDefinition;
  const { taskDefinition: td } = await ecs.send(
    new DescribeTaskDefinitionCommand({ taskDefinition: currentDefArn })
  );

  const { taskDefinition } = await ecs.send(
    new RegisterTaskDefinitionCommand({
      family: td.family,
      networkMode: td.networkMode,
      requiresCompatibilities: td.requiresCompatibilities,
      cpu: td.cpu,
      memory: td.memory,
      executionRoleArn,
      taskRoleArn,
      containerDefinitions: td.containerDefinitions.map((c) => ({
        ...c,
        image: `${repositoryUri}:latest`,
      })),
    })
  );

  await ecs.send(
    new UpdateServiceCommand({
      cluster: clusterName,
      service: serviceName,
      taskDefinition: taskDefinition.taskDefinitionArn,
      forceNewDeployment: true,
    })
  );

  await waitForStable(ecs, clusterName, serviceName);
  logger.success("✅ Deployment successful");
}

/* ------------------------------------------------------------------ */
/* 5. Wait for service stability                                      */
/* ------------------------------------------------------------------ */
async function waitForStable(ecs, cluster, service, timeout = 10 * 60 * 1000) {
  const start = Date.now();
  let printedEventIds = new Set();

  while (Date.now() - start < timeout) {
    const { services } = await ecs.send(
      new DescribeServicesCommand({ cluster, services: [service] })
    );
    const svc = services[0];

    (svc.events || []).forEach((ev) => {
      if (!printedEventIds.has(ev.id)) {
        printedEventIds.add(ev.id);
        logger.info(`🛈  ${ev.message}`);
        if (/was stopped|failed|unable to place/i.test(ev.message)) {
          throw new Error(`Deployment failed: ${ev.message}`);
        }
      }
    });

    const primary = svc.deployments.find((d) => d.status === "PRIMARY");
    if (
      primary &&
      primary.runningCount === primary.desiredCount &&
      svc.deployments.length === 1
    ) {
      logger.success(
        `✅ Service stable: ${primary.runningCount}/${primary.desiredCount}`
      );
      return;
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error("Deployment timed-out; tasks never reached steady state");
}
