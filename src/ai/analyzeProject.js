const detectFramework = async (projectPath) => {
if (fs.existsSync(path.join(projectPath, 'package.json'))) {
const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json')));
if (pkg.dependencies?.express || pkg.devDependencies?.express) {
return 'node-express';
}
}

if (fs.existsSync(path.join(projectPath, 'requirements.txt'))) {
const content = fs.readFileSync(path.join(projectPath, 'requirements.txt'), 'utf-8');
if (content.includes('django')) {
return 'python-django';
}
}

if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
return 'go';
}

if (fs.existsSync(path.join(projectPath, 'pom.xml'))) {
return 'java-springboot';
}

return null;
};