// Review repairs P14/P15: contradictory handshake and malformed body cannot project a reader.
import { fileURLToPath } from 'node:url';
import { baseUrl, checks, loadPlaywright, openPage, waitForDocument, writeResult } from './lib.mjs';
import { S } from './selectors.mjs';
export async function runReleaseRecovery(engine) {
  const base = baseUrl('http://127.0.0.1:4321'); const c = checks(); const browser = await loadPlaywright()[engine].launch();
  const { page, context, errors } = await openPage(browser, { width: 1280, height: 800 });
  try {
    let malformed = true;
    await page.route('**/api/documents/example-store*', (route) => malformed ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"version":' }) : route.continue());
    await page.goto(base); await page.locator(S.projectFolder).waitFor();
    await page.getByRole('button', { name: 'Browse example', exact: true }).click(); await page.locator(S.documentFailure).waitFor();
    c.check('P15 completed malformed body exits Loading with typed error and retry', (await page.locator(S.documentFailure).innerText()).includes('unreadable response') && await page.getByRole('button', { name: 'Try again', exact: true }).isEnabled());
    malformed = false; await page.getByRole('button', { name: 'Try again', exact: true }).click(); await waitForDocument(page, 'example-store');
    const handle = new URL(page.url()).searchParams.get('project');
    c.check('P15 retry reads the valid document in the same project', Boolean(handle) && (await page.locator(S.title).innerText()) === 'Example store');
    await page.unroute('**/api/documents/example-store*');
    let matching = false; let catalogReads = 0;
    await page.route('**/api/catalog*', (route) => { catalogReads++; return route.continue(); });
    await page.route('**/api/projects/current*', (route) => route.fulfill({ json: { kind: 'opened', project: { id: matching ? handle : 'different-handle', title: matching ? 'Example store' : 'Contradictory title' } } }));
    await page.goto(`${base}/docs/example-store?project=${handle}`); await page.locator(S.projectOpeningError).waitFor();
    c.check('P14 contradictory current identity is refused before catalog/reader/title application', catalogReads === 0 && (await page.locator(S.documentLayout).count()) === 0 && (await page.locator(S.projectOpeningError).innerText()).includes('different project') && (await page.title()) === 'Open project · Nessa Docs');
    matching = true; await page.reload(); await waitForDocument(page, 'example-store');
    c.check('P14 correlated explicit identity remains usable', catalogReads > 0 && new URL(page.url()).searchParams.get('project') === handle && (await page.locator(S.title).innerText()) === 'Example store');
    await page.goto(base); await waitForDocument(page, 'example-store');
    c.check('P14 null startup discovery may select the returned project', new URL(page.url()).searchParams.get('project') === handle && (await page.locator(S.title).innerText()) === 'Example store');
    c.check('review recovery has no page errors', errors.page.length === 0, errors.page);
  } catch (error) { c.check('review recovery completed', false, { error: String(error), stack: error.stack }); }
  finally { await context.close(); await browser.close(); }
  const result = { script: 'release-recovery', engine, baseUrl: base, ok: c.ok, passed: c.list.filter((x) => x.pass).length, total: c.list.length, checks: c.list };
  writeResult(`${engine}-release-recovery`, result); return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const result = await runReleaseRecovery(process.argv[2] || 'chromium'); console.log(JSON.stringify(result)); process.exitCode = result.ok ? 0 : 1; }
