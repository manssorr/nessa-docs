// Verification tooling owns its temporary processes. It does not touch existing services.
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export async function startVerificationServer(project = null) {
  const reserve = createServer();
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const entry = fileURLToPath(new URL('../dist/server/server/main.js', import.meta.url));
  const child = spawn(process.execPath, [entry], { env: { ...process.env, PORT: String(port), NESSA_DOCS_PROJECT: project ?? '' }, stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  child.stderr.on('data', (chunk) => { log += String(chunk); });
  const url = `http://127.0.0.1:${port}`;
  for (let n = 0; n < 1200; n++) {
    try { if ((await fetch(`${url}/api/health`)).ok) return { url, stop: () => child.kill('SIGTERM'), child }; } catch {}
    if (child.exitCode !== null) throw new Error(`Verification server failed: ${log}`);
    await delay(25);
  }
  child.kill('SIGTERM'); throw new Error(`Verification server timed out: ${log}`);
}
