// Regressions from PR #2: keep diagram identity and focus, header hit targets,
// edge direction, translated errors, and mixed-direction search clearance.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import {loadPlaywright, waitForDiagrams} from './lib.mjs';
import {startVerificationServer} from './server.mjs';
const server = await startVerificationServer(fileURLToPath(new URL('../fixtures/details-repo', import.meta.url)));
let browser;
const failures = [];
const output = process.env.EVIDENCE_DIR;
if (output) mkdirSync(output, {recursive: true});
async function check(name, run) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
}
try {
  browser = await loadPlaywright().chromium.launch();
  const context = await browser.newContext({locale: 'en', viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(server.url);
  await page.locator('article.document').waitFor();
  await waitForDiagrams(page);
  await page.locator('[data-target-id="gate"]').first().click();
  await waitForDiagrams(page);
  const node = page.locator('g.node[data-detail-key="0"]');
  await node.click();
  await page.locator('.detail-inspector').waitFor();
  await node.evaluate(element => { window.originalInvoker = element; });
  for (const language of ['ar', 'en', 'ar']) {
    await page.locator('.language-switch').click();
    await check(`inspector state and SVG identity after ${language}`, async () => {
      assert.equal(await page.locator('html').getAttribute('lang'), language);
      assert.equal(await page.locator('.detail-inspector').isVisible(), true);
      assert.equal(await node.evaluate(element => element === window.originalInvoker), true);
      assert.equal(await node.getAttribute('aria-expanded'), 'true');
      assert.ok((await node.getAttribute('aria-label')).startsWith(language === 'ar' ? 'التفاصيل:' : 'Details:'));
      assert.equal(await node.evaluate(element => element.hasAttribute('data-selected')), true);
      const bounds = await page.locator('.detail-inspector').boundingBox();
      const main = await page.locator('#main').boundingBox();
      assert.ok(bounds.x >= main.x && bounds.x + bounds.width <= main.x + main.width);
    });
  }
  if (output) await page.screenshot({path: `${output}/fixed-inspector.png`});
  await page.locator('[data-action="close-details"]').click();
  await check('closing inspector restores its original node focus', async () => {
    assert.equal(await node.evaluate(element => element === document.activeElement), true);
  });
  for (const language of ['ar', 'en']) {
    if (await page.locator('html').getAttribute('lang') !== language) await page.locator('.language-switch').click();
    await page.locator('.diagram-edge-detail').first().click();
    await page.locator('.detail-inspector').waitFor();
    await check(`edge source precedes target in ${language}`, async () => {
      const codes = page.locator('.inspector-element code');
      const from = await codes.nth(0).boundingBox(), to = await codes.nth(1).boundingBox();
      assert.ok(from.x < to.x);
    });
    const edge = page.locator('.diagram-edge-detail').first();
    await edge.evaluate(element => { window.originalEdge = element; });
    await page.locator('.language-switch').click();
    await page.locator('.language-switch').click();
    await check(`edge selection survives language changes in ${language}`, async () => {
      assert.equal(await edge.evaluate(element => element === window.originalEdge), true);
      assert.equal(await edge.getAttribute('aria-expanded'), 'true');
      assert.equal(await edge.evaluate(element => element.hasAttribute('data-selected')), true);
    });
    if (output && language === 'ar') await page.screenshot({path: `${output}/fixed-edge.png`});
    await page.locator('[data-action="close-details"]').click();
    assert.equal(await edge.evaluate(element => element === document.activeElement), true);
  }
  for (const language of ['en', 'ar']) {
    await page.evaluate(language => {
      localStorage.setItem('nessa-state-browser:language', language);
      localStorage.setItem('nessa-state-browser:sidebar', 'hidden');
      localStorage.setItem('nessa-state-browser:sidebar-width', '400');
    }, language);
    await page.route('**/api/**', async route => {
      const response = await route.fetch();
      if (!response.headers()['content-type']?.includes('json')) return route.fulfill({response});
      const data = await response.json();
      if (data.documents) data.documents = data.documents.map(doc => doc.parent === null
        ? {...doc, title: 'Architecture and behavior of the payment processing system'} : doc);
      await route.fulfill({response, json: data});
    });
    await page.goto(server.url);
    await page.locator('article.document').waitFor();
    await waitForDiagrams(page);
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 1000});
      await check(`long brand leaves history targets clear: ${language}, ${width}`, async () => {
        assert.equal(await page.locator('[data-history]').evaluateAll(buttons => buttons.every(button => {
          const rect = button.getBoundingClientRect();
          return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        })), true);
      });
      if (output) await page.screenshot({path: `${output}/fixed-header-${language}-${width}.png`});
    }
    await page.setViewportSize({width: 1440, height: 1000});
    // Exercise the actual history controls, not only their rectangles.
    await page.locator('[data-target-id="gate"]').first().click();
    await page.locator('[data-history="back"]').click();
    await page.locator('.document-layout[data-doc-id="nessa"]').waitFor();
    await page.locator('[data-history="forward"]').click();
    await page.locator('.document-layout[data-doc-id="gate"]').waitFor();
    await page.unroute('**/api/**');
    await page.locator('[data-sidebar-toggle]').click();
    await page.locator('#doc-search').fill(language === 'ar'
      ? 'Architecture and behavior of the payment processing system'
      : 'دليل النظام وشرح تفاصيل المشروع ومسار العمل');
    await check(`search reserves both icon and clear-button space in ${language}`, async () => {
      const padding = await page.locator('#doc-search').evaluate(element => {
        const style = getComputedStyle(element);
        return [parseFloat(style.paddingLeft), parseFloat(style.paddingRight)];
      });
      assert.ok(padding.every(value => value >= 30));
    });
    if (output) await page.screenshot({path: `${output}/fixed-search-${language}.png`});
  }
  await page.evaluate(() => localStorage.setItem('nessa-state-browser:language', 'ar'));
  for (const path of ['/missing-route', '/docs/not-present']) {
    await page.goto(server.url + path);
    await page.locator('h1').waitFor();
    await check(`Arabic error heading and browser title: ${path}`, async () => {
      assert.match(await page.title(), /غير موجود/);
      assert.doesNotMatch(await page.locator('.not-found').innerText(), /Nothing at|No document|Documents live at|or search from/);
    });
    await page.locator('.language-switch').click();
    await check(`error title changes to English without navigation: ${path}`, async () => {
      assert.match(await page.title(), /[Nn]ot found/);
    });
    await page.locator('.language-switch').click();
    if (output) await page.screenshot({path: `${output}/fixed-error${path.startsWith('/docs') ? '-document' : '-route'}.png`});
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
} finally {
  try { await browser?.close(); } finally { server.stop(); }
}
