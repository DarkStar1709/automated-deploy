// src/ai/analyzeProject.js
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import ejs from "ejs";
import { fileURLToPath } from "url";
import Logger from "../utils/logger.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const logger = new Logger();
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* 1️⃣  FRAMEWORK DETECTION                                            */
/* ------------------------------------------------------------------ */
async function detectFramework(projectPath) {
  const pj   = path.join(projectPath, "package.json");
  const req  = path.join(projectPath, "requirements.txt");
  const gom  = path.join(projectPath, "go.mod");
  const pom  = path.join(projectPath, "pom.xml");

  if (await fs.pathExists(pj)) {
    const pkg = JSON.parse(await fs.readFile(pj, "utf8"));
    if (pkg.dependencies?.express || pkg.devDependencies?.express) {
      return "node-express";
    }
  }
  if (await fs.pathExists(req)) {
    if ((await fs.readFile(req, "utf8")).toLowerCase().includes("django"))
      return "python-django";
  }
  if (await fs.pathExists(gom)) return "go";
  if (await fs.pathExists(pom)) return "java-springboot";
  return null;
}

/* ------------------------------------------------------------------ */
/* 2️⃣  BUILD CONTEXT + GENERATE WITH GEMINI                           */
/* ------------------------------------------------------------------ */
async function buildContext(framework, projectPath) {
  switch (framework) {
    case "node-express": {
      const pkg = JSON.parse(
        await fs.readFile(path.join(projectPath, "package.json"), "utf8")
      );
      return `package.json:\n${JSON.stringify(pkg, null, 2)}`;
    }
    case "python-django": {
      const txt = await fs.readFile(
        path.join(projectPath, "requirements.txt"),
        "utf8"
      );
      return `requirements.txt:\n${txt}`;
    }
    case "go": {
      const mod = await fs.readFile(path.join(projectPath, "go.mod"), "utf8");
      return `go.mod:\n${mod}`;
    }
    case "java-springboot": {
      const xml = await fs.readFile(path.join(projectPath, "pom.xml"), "utf8");
      return `pom.xml:\n${xml}`;
    }
    default:
      return "";
  }
}

async function generateDockerfile(framework, projectPath) {
  try {
    const model   = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
    const context = await buildContext(framework, projectPath);

    const prompt = `
You are a senior DevOps engineer.

Generate a production-ready **Dockerfile** for a ${framework.replace(
      "-",
      " "
    )} project.

Context:
${context}

Requirements:
- Use the best base image for this stack
- Multi-stage build if it shrinks the final image
- Expose the correct port
- Correct entry command
- Include build steps (npm ci, pip install, go build, mvn package, etc.)
Return ONLY the Dockerfile (no markdown fences).
    `.trim();

    const { response } = await model.generateContent(prompt);
    let dockerfile = response.text().trim();
    const match = dockerfile.match(/```(?:dockerfile)?\s*([\s\S]*?)```/i);
    if (match) dockerfile = match[1].trim();

    return dockerfile;
  } catch (err) {
    logger.error("❌ Gemini API error:", err.message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 3️⃣  FALLBACK TO TEMPLATE                                           */
/* ------------------------------------------------------------------ */
async function fallbackTemplate(framework, destPath) {
  const template = path.join(
    __dirname,
    "../../templates",
    `Dockerfile-${framework}.ejs`
  );

  if (!(await fs.pathExists(template))) {
    logger.error(`❌ No fallback template found for ${framework}`);
    return false;
  }

  const rendered = await ejs.renderFile(template, {}, {});
  await fs.writeFile(destPath, rendered);
  logger.warn("⚠️  Fallback Dockerfile template used.");
  logger.fileOperation("create", destPath);
  return true;
}

/* ------------------------------------------------------------------ */
/* 4️⃣  MAIN ORCHESTRATOR                                              */
/* ------------------------------------------------------------------ */
async function analyzeProject(
  projectPath,
  { useAI = true, force = false } = {}
) {
  logger.title("🔍 Analyzing project…");

  const framework = await detectFramework(projectPath);
  if (!framework) {
    logger.error("❌ Unsupported or undetected framework.");
    return;
  }
  logger.success(`📦 Detected: ${framework}`);

  const dockerPath = path.join(projectPath, "Dockerfile");
  if (await fs.pathExists(dockerPath) && !force) {
    logger.warn("⚠️  Dockerfile already exists. Use --force to overwrite.");
    return;
  }

  let content = null;
  const spinID = "docker-gen";

  if (useAI) {
    logger.startSpinner(spinID, "🤖 Generating Dockerfile with Gemini…");
    content = await generateDockerfile(framework, projectPath);
    if (content && content.trim()) {
      logger.succeedSpinner(spinID, "✅ Dockerfile generated by Gemini");
    } else {
      logger.failSpinner(spinID, "❌ Gemini failed or returned empty result");
      content = null;
    }
  }

  if (content) {
    await fs.writeFile(dockerPath, content.trim());
    logger.fileOperation("create", dockerPath);
  } else {
    logger.info("🔄 Falling back to static template…");
    await fallbackTemplate(framework, dockerPath);
  }
}

/* ------------------------------------------------------------------ */
/* 5️⃣  NAMED EXPORTS                                                  */
/* ------------------------------------------------------------------ */
export { detectFramework, generateDockerfile, analyzeProject };
