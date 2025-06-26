# 🚀 Automated Deploy CLI

> Effortless ECS deployment for Node.js, Python (Django), Go, and Java (Spring Boot) projects — powered by 🧠 AI and 🔧 templates.

---

## 📦 Installation

```bash
npm install -g automatic-deploy
```
or
```bash
npm i automatic-deploy
```

---

## 💻 Usage

```bash
mydeploy <command> [options]
```

## 📜 Commands

```
┌────────────┬────────────────────────────────────────────────────┐
│ 🧾 Command │ 📝 Description                                     │
├────────────┼────────────────────────────────────────────────────┤
│ init       │ 🔍 Detects project framework & generates Dockerfile│
│ config     │ ⚙️  Add your API keys and AWS credentials         │
│ deploy     │ 🚀 Deploys your app to AWS ECS                    │
└────────────┴────────────────────────────────────────────────────┘
```


---

## 🔥 Features

- 🤖 AI-powered Dockerfile generation using Google Gemini
- 🧰 Fallback to production-ready Dockerfile templates
- ☁️ One-command ECS + ECR provisioning & deployment
- 🪄 Smart CLI interaction using Inquirer, Chalk, and Figlet
- 🔐 .env support for secrets and API keys

---

## 🧪 Example Workflow

```bash
# 1. Analyze your project & generate Dockerfile
mydeploy init <project-path>

# 2. Set up AWS credentials and deploy config
mydeploy config <KEY> <Value>

# 3. Deploy your app to AWS ECS
mydeploy deploy <project-path>
```

---

## 🗂 Folder Structure

```
automated-deploy/
├── bin/
│   └── cli.js               # 🏁 CLI entry point
├── src/
│   ├── ai/                  # 🤖 Gemini logic
│   ├── aws/                 # ☁️ ECS + ECR utilities
│   ├── commands/            # 🧾 CLI command handlers
│   ├── templates/           # 🧰 Dockerfile templates
│   └── utils/               # 🧱 Logging, prompts, etc.
├── .env                     # 🔐 Environment secrets
├── package.json
└── README.md
```

---

## 🔐 .env Configuration

Create a `.env` file in the root:

```
GEMINI_API_KEY=your-google-api-key
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
CLUSTER_NAME=your-cluster-name
SERVICE_NAME=your-service-name
```

---

## 🌍 Supported Frameworks

- ⚡ Node.js (Express)
- 🐍 Python (Django)
- 🧬 Go (Go Modules)
- ☕ Java (Spring Boot)

---
## 🌍 Demo Video
https://github.com/user-attachments/assets/43450154-222b-4cbd-9c7d-892df618aa97

## 📦 NPM Package Info

- 📛 CLI Name: `mydeploy`
- 📁 Main: `cli.js` (via `bin/`)
- 🔖 Version: 1.0.0
- 📚 License: ISC
- 👤 Author:
  - [DarkStar1709](https://github.com/DarkStar1709)
  - [Yashagarwal9798](https://github.com/Yashagarwal9798)

---

## 🐛 Issues & Feedback

Found a bug or have a suggestion? [Open an issue](https://github.com/DarkStar1709/automated-deploy/issues) — contributions welcome!

---

## 💬 Star ⭐ the repo if this saved you time!

---
