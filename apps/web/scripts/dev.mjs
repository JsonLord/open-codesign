import { spawn } from 'node:child_process';

const children = [
  spawn('tsx', ['server/index.ts'], {
    env: { ...process.env, PORT: '7861' },
    stdio: 'inherit',
  }),
  spawn('vite', [], { shell: true, stdio: 'inherit' }),
];

function stop() {
  for (const child of children) child.kill('SIGTERM');
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => code && process.exit(code));
