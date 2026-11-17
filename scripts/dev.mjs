// Runs the Vite dev server and the API proxy together. Ctrl+C stops both.
import { spawn } from 'node:child_process';

const procs = [
  ['engine', 'npm run dev:engine'],
  ['web', 'npm run dev:web'],
  ['api', 'npm run dev:server'],
].map(([name, cmd]) => {
  const child = spawn(cmd, { shell: true, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    for (const p of procs) if (p !== child) p.kill();
    process.exit(code ?? 0);
  });
  return child;
});
