// End-to-end: a tab loaded from build A keeps running after the server is
// restarted on build B. Navigating (client-side, through the sidebar) to a
// page whose sequence diagram needs a lazy chunk A named but B does not serve
// must recover by exactly one reload into B, then render.
//
// Usage: node verification/stale-build.mjs <chromium|webkit> <buildA-root> [buildB-root=.]
// Each root holds dist/server and dist/client and resolves node_modules. Uses
// port 4316 (owned by this script for its run) and the default repository.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checks, HERE, loadPlaywright, log, SCREENSHOTS, waitForDiagrams, waitForDocument, writeResult } from './lib.mjs';

const PORT = 4316;
const BASE = `http://127.0.0.1:${PORT}`;

function entryOf(root) {
  return /\/assets\/index-[A-Za-z0-9_-]+\.js/.exec(readFileSync(join(root, 'dist/client/index.html'), 'utf8'))?.[0] ?? null;
}

async function startServer(root) {
  const child = spawn(process.execPath, [join(root, 'dist/server/server/main.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i += 1) {
    try {
      const health = await (await fetch(`${BASE}/api/health`)).json();
      if (health.ok) return { child, client: health.client };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error(`server for ${root} did not start on ${PORT}`);
}

async function stopServer(server) {
  await new Promise((resolveExit) => {
    server.child.once('exit', resolveExit);
    server.child.kill();
  });
}

export async function runStaleBuild(engine, rootA, rootB) {
  const c = checks();
  const facts = { entryA: entryOf(rootA), entryB: entryOf(rootB) };
  c.check('two different builds', facts.entryA && facts.entryB && facts.entryA !== facts.entryB, facts);
  const playwright = loadPlaywright();
  const browser = await playwright[engine].launch();
  let server = await startServer(rootA);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    let loads = 0;
    const assets = [];
    page.on('load', () => (loads += 1));
    page.on('response', (r) => {
      if (/sequenceDiagram|\/assets\/index-/.test(r.url())) assets.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    await page.goto(`${BASE}/docs/nessa`);
    await waitForDocument(page, 'nessa');
    await waitForDiagrams(page);
    facts.servedA = server.client;
    await stopServer(server);
    server = await startServer(rootB);
    facts.servedB = server.client;
    await page.locator('#sidebar nav[aria-label="Documents"] a[data-doc-id="provenance"]').click();
    await page.waitForFunction(() => location.pathname === '/docs/provenance');
    await page.waitForTimeout(500);
    await waitForDocument(page, 'provenance');
    await waitForDiagrams(page);
    await page.waitForTimeout(500);
    const end = await page.evaluate(() => ({
      entry: [...document.scripts].map((s) => new URL(s.src || location.href).pathname).find((p) => p.startsWith('/assets/index-')) ?? null,
      states: [...document.querySelectorAll('figure.diagram')].map((f) => f.dataset.state),
      actors: document.querySelectorAll('figure.diagram svg rect.actor, figure.diagram svg g.actor-man').length,
      reloadedFor: sessionStorage.getItem('nessa-state-browser:reloaded-for'),
    }));
    Object.assign(facts, { loads, assets, end });
    await page.screenshot({ path: join(SCREENSHOTS, `${engine}-stale-build-recovered.png`) });
    c.check("build A's lazy sequence chunk was requested and 404'd after the switch", assets.some((a) => a.startsWith('404') && a.includes('sequenceDiagram')), { assets });
    c.check('exactly one automatic reload, into build B', loads === 2 && end.entry === facts.entryB && end.reloadedFor === facts.entryB, { loads, end });
    c.check('after the reload every diagram renders, including the sequence diagram', end.states.length > 0 && end.states.every((s) => s === 'rendered') && end.actors > 0, end);
    await page.waitForTimeout(2500);
    c.check('no further reloads (no loop)', loads === 2, { loads });
    await context.close();
  } catch (error) {
    c.check('stale-build run completed without exception', false, { error: String(error) });
  } finally {
    await stopServer(server);
    await browser.close();
  }
  const result = { engine, script: 'stale-build', ok: c.ok, passed: c.list.filter((x) => x.pass).length, total: c.list.length, checks: c.list, facts };
  writeResult(`stale-build-${engine}`, result);
  log(engine, JSON.stringify(facts));
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const engine = process.argv[2] || 'chromium';
  const rootA = resolve(process.argv[3]);
  const rootB = resolve(process.argv[4] || join(HERE, '..'));
  const result = await runStaleBuild(engine, rootA, rootB);
  console.log(JSON.stringify({ engine: result.engine, ok: result.ok, passed: result.passed, total: result.total }));
  process.exit(result.ok ? 0 : 1);
}
