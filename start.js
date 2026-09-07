const { spawn, execSync } = require('child_process');
const path = require('path');

const ROOT_DIR = __dirname;

const services = [
  {
    name: 'Backend API',
    prefix: '[Backend]',
    script: path.join(ROOT_DIR, 'backend', 'src', 'server.js'),
    cwd: path.join(ROOT_DIR, 'backend'),
    port: 5000,
    url: 'http://localhost:5000'
  },
  {
    name: 'Admin Panel',
    prefix: '[Admin]  ',
    script: path.join(ROOT_DIR, 'admin', 'serve.js'),
    cwd: path.join(ROOT_DIR, 'admin'),
    port: 3000,
    url: 'http://localhost:3000'
  },
  {
    name: 'Web Preview',
    prefix: '[Preview]',
    script: path.join(ROOT_DIR, 'frontend', 'web_preview', 'serve.js'),
    cwd: path.join(ROOT_DIR, 'frontend', 'web_preview'),
    port: 3001,
    url: 'http://localhost:3001'
  }
];

// Kill any old processes on the ports first
for (const svc of services) {
  try {
    const pids = execSync(`lsof -ti :${svc.port} 2>/dev/null`, { encoding: 'utf-8' }).trim();
    if (pids) {
      for (const pid of pids.split('\n')) {
        if (pid.trim()) {
          try { process.kill(parseInt(pid.trim(), 10), 'SIGKILL'); } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

const children = [];

let isExiting = false;

function cleanExit() {
  if (isExiting) return;
  isExiting = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch (_) {}
  }
  process.exit(0);
}

process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);
process.on('SIGHUP', cleanExit);

console.log('=============================================');
console.log('🚀 Starting SolWash Services...');
console.log('=============================================');

for (const svc of services) {
  const child = spawn(process.execPath, [svc.script], {
    cwd: svc.cwd,
    env: { ...process.env, PORT: String(svc.port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().trimEnd().split('\n');
    for (const line of lines) {
      console.log(`${svc.prefix} ${line}`);
    }
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().trimEnd().split('\n');
    for (const line of lines) {
      console.error(`${svc.prefix} ${line}`);
    }
  });

  child.on('error', (err) => {
    console.error(`${svc.prefix} Failed to start:`, err.message);
  });

  child.on('close', (code) => {
    console.log(`${svc.prefix} Process exited with code ${code}`);
  });

  children.push(child);
}

console.log('🔗 Backend API:     http://localhost:5000');
console.log('🔗 Admin Panel:     http://localhost:3000');
console.log('🔗 Mobile Preview:  http://localhost:3001');
console.log('=============================================');
