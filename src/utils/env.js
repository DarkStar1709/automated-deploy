import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

const ENV_PATH = path.resolve(process.cwd(), '.env');

export async function writeEnvKey(key, value) {
  let envVars = {};
  if (await fs.pathExists(ENV_PATH)) {
    const content = await fs.readFile(ENV_PATH, 'utf8');
    envVars = dotenv.parse(content);
  }

  // Update or add the key
  envVars[key] = value;

  // Format and write back
  const updatedContent = Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  await fs.writeFile(ENV_PATH, updatedContent, 'utf8');
}
