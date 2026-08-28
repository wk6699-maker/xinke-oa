import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['server.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })
];

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach(child => child.on('exit', code => {
  if (code && code !== 0) process.exitCode = code;
}));
