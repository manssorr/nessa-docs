// P16: accepted authored keys survive actual catalog/API/Details/inspector boundaries.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checks, loadPlaywright, openPage, waitForDiagrams, waitForDocument, writeResult } from './lib.mjs';
import { startVerificationServer } from './server.mjs';

const names = ['__proto__', 'constructor', 'ordinary'];
const labels = { ['__proto__']: 'Prototype reference', constructor: 'Constructor reference', ordinary: 'Ordinary reference' };
const metadata = (id, parent, extra = {}) => Object.entries({ id, title: id, kind: parent === null ? 'system' : 'service', status: 'fixture', summary: `Verification page ${id}`, parent, sources: [], diagramLinks: {}, ...extra }).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');

export async function runReservedLinks(engine) {
  const c = checks(); const project = await mkdtemp(join(tmpdir(), 'nessa-docs-reserved-'));
  let server; let browser; let context;
  try {
    const state = join(project, 'docs/state'); await mkdir(state, { recursive: true });
    const targets = names.map((name, index) => [name, `child-${index}`]);
    const details = names.map((node) => ({ diagram: 0, node, section: 'References' }));
    const body = '# Reserved links\n\n```mermaid\nflowchart LR\n __proto__[Prototype] --> constructor[Constructor] --> ordinary[Ordinary]\n```\n\n## References\n\n' + names.map((name) => `[${labels[name]}](${name})`).join(' ') + ' [Self](#references)\n';
    await writeFile(join(state, 'README.md'), `---\n${metadata('reserved-root', null, { diagramLinks: Object.fromEntries(targets), diagramDetails: details })}\n---\n${body}`);
    for (const [name, id] of targets) {
      await mkdir(join(state, name)); await writeFile(join(state, name, 'README.md'), `---\n${metadata(id, 'reserved-root')}\n---\n# ${id}\n`);
    }
    server = await startVerificationServer(project);
    browser = await loadPlaywright()[engine].launch();
    const opened = await openPage(browser, { width: 1280, height: 800 }); context = opened.context;
    const { page, errors } = opened;
    await page.goto(server.url); await waitForDocument(page, 'reserved-root');
    const handle = new URL(page.url()).searchParams.get('project');
    const catalog = await (await fetch(`${server.url}/api/catalog?project=${handle}`)).json();
    c.check('P16 actual catalog accepts all reserved-key relationships without issues', catalog.rootId === 'reserved-root' && catalog.issues.length === 0);
    const wire = await (await fetch(`${server.url}/api/documents/reserved-root?project=${handle}`)).json();
    for (const [name, id] of targets) c.check(`P16 actual JSON preserves own href/node key ${name}`, Object.hasOwn(wire.links, name) && wire.links[name].kind === 'document' && wire.links[name].id === id && Object.hasOwn(wire.diagramLinks, name) && wire.diagramLinks[name].id === id);
    await waitForDiagrams(page);
    c.check('P16 reserved-key chart renders', await page.locator('figure.diagram[data-state="rendered"] .diagram-svg svg').count() === 1, { charts: await page.locator('figure.diagram').innerText() });
    const rootUrl = page.url();
    for (const [name, id] of targets) {
      await page.locator('[data-view="details"]').first().click();
      await page.locator('article.document').getByRole('link', { name: labels[name], exact: true }).click(); await waitForDocument(page, id);
      c.check(`P16 Details ${name} navigates within the selected project`, new URL(page.url()).searchParams.get('project') === handle);
      await page.goto(rootUrl); await waitForDocument(page, 'reserved-root'); await waitForDiagrams(page);
      const bound = page.locator(`.diagram-svg [data-target-id="${id}"][role="button"]`).first();
      c.check(`P16 diagram alias ${name} binds to its accepted destination`, await bound.count() === 1);
      await bound.click();
      const inspector = page.locator('.detail-inspector'); await inspector.locator('.inspector-title').waitFor();
      const preserved = await Promise.all(names.map((key) => inspector.getByRole('link', { name: labels[key], exact: true }).count()));
      c.check(`P16 ${name} inspector retains every reserved/ordinary reference and anchor remapping`, preserved.every((count) => count === 1) && (await inspector.getByRole('link', { name: 'Self', exact: true }).getAttribute('href')).includes('#references'));
      await inspector.getByRole('link', { name: labels[name], exact: true }).click(); await waitForDocument(page, id);
      c.check(`P16 inspector ${name} navigation closes the inspector and preserves the project`, new URL(page.url()).searchParams.get('project') === handle && await page.locator('.detail-inspector[open]').count() === 0);
      await page.goto(rootUrl); await waitForDocument(page, 'reserved-root'); await waitForDiagrams(page);
    }
    c.check('P16 reserved-key journey has no page errors', errors.page.length === 0, errors.page);
  } catch (error) { c.check('P16 reserved-key journey completed', false, { error: String(error), stack: error.stack }); }
  finally { await context?.close(); await browser?.close(); server?.stop(); await rm(project, { recursive: true, force: true }); }
  const result = { script: 'reserved-links', engine, ok: c.ok, passed: c.list.filter((row) => row.pass).length, total: c.list.length, checks: c.list };
  writeResult(`${engine}-reserved-links`, result); return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const result = await runReservedLinks(process.argv[2] || 'chromium'); console.log(JSON.stringify(result)); process.exitCode = result.ok ? 0 : 1; }
