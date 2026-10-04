// Mobile drawer, focus, and responsive geometry. Measures horizontal overflow,
// sidebar/outline placement, and the active element across viewport widths.
//
// Usage: node verification/responsive.mjs [chromium|webkit] [doc-id ...]
// The doc IDs default to the TEMP fixture's; pass real IDs for real data.

import { join } from 'node:path';
import {
  activeElement,
  baseUrl,
  checks,
  geometry,
  loadPlaywright,
  openPage,
  SCREENSHOTS,
  waitForDiagrams,
  waitForDocument,
  writeResult,
} from './lib.mjs';
import { S } from './selectors.mjs';

const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
];

export async function runResponsive(engine, ids = ['nessa', 'chat', 'chat-send-first', 'chat-send-retry'], tag = 'responsive') {
  const BASE_URL = baseUrl();
  const playwright = loadPlaywright();
  const browser = await playwright[engine].launch();
  const c = checks();
  const measurements = [];
  const allErrors = { console: [], page: [] };
  try {
    for (const viewport of WIDTHS) {
      const { page, errors, context } = await openPage(browser, { width: viewport.width, height: viewport.height });
      for (const id of ids) {
        await page.goto(`${BASE_URL}/docs/${id}`);
        await waitForDocument(page, id);
        await waitForDiagrams(page);
        const g = await geometry(page);
        measurements.push({ viewport: viewport.name, id, ...g });
        c.check(`${viewport.name} ${id}: no horizontal overflow`, g.horizontalOverflow === 0 && g.overflowingElements.length === 0, {
          horizontalOverflow: g.horizontalOverflow,
          overflowingElements: g.overflowingElements,
        });
        if (g.firstDiagram) {
          c.check(`${viewport.name} ${id}: diagram inside viewport`, g.firstDiagram.x >= 0 && g.firstDiagram.x + g.firstDiagram.width <= viewport.width, g.firstDiagram);
        }
        const narrow = viewport.width < 900;
        c.check(`${viewport.name} ${id}: sidebar ${narrow ? 'off-canvas' : 'docked'}`, narrow ? g.sidebar?.visible === false && g.menuButton?.visible : g.sidebar?.visible && g.main.x >= g.sidebar.width, { sidebar: g.sidebar, main: g.main });
        c.check(`${viewport.name} ${id}: no permanent outline column`, g.outline === null, { outline: g.outline });
        if (g.firstDiagram && g.document) {
          c.check(`${viewport.name} ${id}: diagram spans the reading column`, g.firstDiagram.width >= g.document.width - 2, {
            diagram: g.firstDiagram.width,
            column: g.document.width,
          });
        }
      }
      await page.goto(`${BASE_URL}/docs/${ids[0]}`);
      await waitForDocument(page, ids[0]);
      await waitForDiagrams(page);
      await page.screenshot({ path: join(SCREENSHOTS, `${engine}-${tag}-${viewport.name}.png`) });
      allErrors.console.push(...errors.console);
      allErrors.page.push(...errors.page);
      await context.close();
    }

    // Phone drawer: hidden links are not focusable; open → focus inside; Escape → focus back.
    const { page, errors, context } = await openPage(browser, { width: 390, height: 844 });
    await page.goto(`${BASE_URL}/docs/${ids[0]}`);
    await waitForDocument(page, ids[0]);
    const tabStops = [];
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      tabStops.push(await activeElement(page));
    }
    c.check('phone: closed drawer is not in the tab order', tabStops.every((stop) => !stop?.insideSidebar), { tabStops });
    const menu = page.locator(S.menuButton);
    c.check('phone: sidebar toggle ≥ 40px tall', ((await menu.boundingBox())?.height ?? 0) >= 40);
    const rendered = (buttons) => buttons.filter((b) => b.getClientRects().length > 0).map((b) => Math.round(b.getBoundingClientRect().height));
    const phoneButtons = await page.locator('.titlebar button').evaluateAll(rendered);
    // Back, Forward and On this page (the Markdown source button was removed).
    c.check('phone: every rendered titlebar control ≥ 40px', phoneButtons.length >= 3 && phoneButtons.every((h) => h >= 40), { phoneButtons });
    const viewOptions = await page.locator('.document-header [data-slot="segmented-control-option"]').evaluateAll(rendered);
    c.check('phone: view switch options ≥ 40px (when the page has diagrams)', viewOptions.every((h) => h >= 40), { viewOptions });
    await menu.click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#sidebar')).visibility === 'visible');
    const opened = await activeElement(page);
    c.check('phone: opening moves focus into the drawer', opened?.insideSidebar === true, { opened });
    c.check('phone: menu reports expanded', (await menu.getAttribute('aria-expanded')) === 'true');
    c.check('phone: main is inert while open', await page.locator(S.main).evaluate((main) => main.inert === true || main.hasAttribute('inert')));
    const drawerBox = await page.locator(S.sidebar).boundingBox();
    c.check('phone: drawer within viewport', drawerBox && drawerBox.x >= 0 && drawerBox.x + drawerBox.width <= 390, drawerBox);
    await page.screenshot({ path: join(SCREENSHOTS, `${engine}-${tag}-phone-drawer.png`) });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#sidebar')).visibility === 'hidden');
    const closed = await activeElement(page);
    c.check('phone: Escape closes and returns focus to the toggle', closed?.sidebarToggle === true && (await menu.getAttribute('aria-expanded')) === 'false', { closed });
    await menu.click();
    const target = ids[1];
    const link = page.locator(S.treeLink(target));
    if ((await link.count()) === 0) await page.locator(S.disclosure('')).first().click();
    await page.locator(S.treeLink(target)).click();
    await waitForDocument(page, target);
    c.check('phone: choosing a document navigates and closes the drawer', new URL(page.url()).pathname === `/docs/${target}` && (await menu.getAttribute('aria-expanded')) === 'false');
    allErrors.console.push(...errors.console);
    allErrors.page.push(...errors.page);
    await context.close();
    c.check('responsive: no console errors', allErrors.console.length === 0, { console: allErrors.console });
    c.check('responsive: no page errors', allErrors.page.length === 0, { page: allErrors.page });
  } catch (error) {
    c.check('responsive completed without exception', false, { error: String(error) });
  } finally {
    await browser.close();
  }
  const result = { engine, script: tag, baseUrl: BASE_URL, ok: c.ok, passed: c.list.filter((x) => x.pass).length, total: c.list.length, checks: c.list, measurements };
  writeResult(`${tag}-${engine}`, result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ids = process.argv.slice(3);
  const result = await runResponsive(process.argv[2] || 'chromium', ids.length ? ids : undefined);
  console.log(JSON.stringify({ engine: result.engine, ok: result.ok, passed: result.passed, total: result.total }));
  process.exit(result.ok ? 0 : 1);
}
