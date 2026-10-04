// The app bar: the sidebar toggle and the nessaDocs name at the window's
// top-left. Measures where they sit, the wordmark's weights and spacing, that
// nothing overlaps them, the docked / hidden / drawer journeys with focus, that
// resizing the docked sidebar moves neither (the pane takes the rest), and
// (with BASELINE_URL, a server on the build before the app bar) that the first
// chart and the titlebar actions did not move.
//
// Usage: node verification/brand.mjs [chromium|webkit] [deep-doc-id]
//   BASE_URL      server on the real repository (default http://127.0.0.1:4311)
//   BASELINE_URL  optional server on the previous build, for the chart comparison
//   BRAND_MUTANT  optional: 'no-titlebar-room' or 'no-sidebar-room' removes the
//                 room the layout leaves for the app bar; the run must then fail

import { join } from 'node:path';
import { activeElement, baseUrl, checks, geometry, loadPlaywright, openPage, SCREENSHOTS, waitForDiagrams, waitForDocument, writeResult } from './lib.mjs';
import { S } from './selectors.mjs';

const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
];
const DEEP_ID = 'sdk-runtime-the-first-agent-launch-is-warmed-in-the-background';
const MUTANTS = {
  'no-titlebar-room': '.shell { --app-bar-w: 0px !important; }',
  'no-sidebar-room': '.sidebar { padding-top: 0 !important; }',
};

async function open(browser, viewport, appearance, url, mutant) {
  const opened = await openPage(browser, viewport);
  await opened.context.addInitScript((value) => window.localStorage.setItem('nessa-state-browser:appearance', value), appearance);
  await opened.page.goto(url);
  if (mutant) await opened.page.addStyleTag({ content: MUTANTS[mutant] });
  return opened;
}

/** Rects and type of everything in the top-left corner and the reading pane's top. */
function corner(page) {
  return page.evaluate(() => {
    const box = (element) => {
      if (!element || element.getClientRects().length === 0) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const q = (selector) => document.querySelector(selector);
    const type = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return { weight: Number(style.fontWeight), size: parseFloat(style.fontSize), color: style.color, family: style.fontFamily };
    };
    const toggle = q('button[data-sidebar-toggle]');
    const center = toggle ? box(toggle) : null;
    const hit = center ? document.elementFromPoint(center.x + center.width / 2, center.y + center.height / 2) : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      toggle: box(toggle),
      toggleOnTop: Boolean(hit && toggle.contains(hit)),
      expanded: toggle?.getAttribute('aria-expanded'),
      label: toggle?.getAttribute('aria-label'),
      brand: box(q('a.brand')),
      name: box(q('.brand-name')),
      product: box(q('.brand-product')),
      nameType: type(q('.brand-name')),
      productType: type(q('.brand-product')),
      back: box(q('button[data-history="back"]')),
      titlebar: box(q('.titlebar')),
      actions: box(q('.titlebar-actions')),
      search: box(q('#doc-search')),
      sidebar: box(q('#sidebar')),
      sidebarVisible: getComputedStyle(q('#sidebar')).visibility === 'visible',
      chart: box(q('figure.diagram')),
      column: box(q('article.document')),
    };
  });
}

const round = (value) => (value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 10) / 10 : v])) : value);

export async function runBrand(engine, deepId = DEEP_ID) {
  const BASE_URL = baseUrl('http://127.0.0.1:4311');
  const BASELINE_URL = process.env.BASELINE_URL?.replace(/\/$/, '') || null;
  const mutant = process.env.BRAND_MUTANT || null;
  if (mutant && !MUTANTS[mutant]) throw new Error(`unknown BRAND_MUTANT ${mutant}`);
  const tag = mutant ? `brand-mutant-${mutant}` : 'brand';
  const playwright = loadPlaywright();
  const browser = await playwright[engine].launch();
  const c = checks();
  const measurements = [];
  const allErrors = { console: [], page: [] };
  const keep = (errors) => {
    allErrors.console.push(...errors.console);
    allErrors.page.push(...errors.page);
  };
  const pages = [
    { name: 'root', path: '/', id: 'nessa' },
    { name: 'deep', path: `/docs/${deepId}`, id: deepId },
  ];
  try {
    // 1. Geometry at every width, both appearances, root and a deep document.
    for (const viewport of WIDTHS) {
      for (const appearance of ['dark', 'light']) {
        for (const target of pages) {
          const { page, errors, context } = await open(browser, viewport, appearance, `${BASE_URL}${target.path}`, mutant);
          await waitForDocument(page, target.id);
          await waitForDiagrams(page);
          const m = await corner(page);
          const g = await geometry(page);
          const where = `${viewport.name} ${appearance} ${target.name}`;
          const narrow = viewport.width < 900;
          const phone = viewport.width < 600;
          c.check(`${where}: toggle at the window's top-left`, m.toggle && m.toggle.x <= 20 && m.toggle.y <= 20 && m.toggleOnTop, { toggle: round(m.toggle) });
          c.check(`${where}: toggle reports the sidebar's state`, m.expanded === (narrow ? 'false' : 'true') && m.label === (narrow ? 'Show sidebar' : 'Hide sidebar'), { expanded: m.expanded, label: m.label });
          c.check(`${where}: name ${phone ? 'left to the drawer' : 'beside the toggle'}`, phone ? m.brand === null : m.brand !== null, { brand: round(m.brand) });
          if (m.brand) {
            const centreGap = Math.abs(m.brand.y + m.brand.height / 2 - (m.toggle.y + m.toggle.height / 2));
            c.check(`${where}: name right of the toggle, same row, inside the window`, m.brand.x >= m.toggle.right && m.brand.right <= viewport.width && centreGap <= 2, { brand: round(m.brand), centreGap });
            c.check(`${where}: "nessa" bold, "Docs" regular and muted, 20px, joined`,
              m.nameType.weight >= 650 && m.productType.weight <= 450 && m.nameType.size === 20 && m.productType.size === 20 &&
                m.nameType.color !== m.productType.color && Math.abs(m.product.x - m.name.right) <= 1.5,
              { nameType: m.nameType, productType: m.productType, join: m.product.x - m.name.right });
          }
          const barRight = Math.max(m.toggle.right, m.brand?.right ?? 0);
          if (narrow) {
            c.check(`${where}: titlebar controls start after the app bar`, m.back.x >= barRight + 8, { barRight, back: m.back.x });
          } else {
            c.check(`${where}: app bar inside the docked sidebar's top row, above Search`, barRight <= m.sidebar.right - 8 && m.toggle.y >= m.sidebar.y && m.search && m.search.y >= m.toggle.bottom + 4, { barRight, sidebar: round(m.sidebar), search: round(m.search) });
            c.check(`${where}: app bar row = titlebar row`, Math.abs(m.toggle.y + m.toggle.height / 2 - (m.titlebar.y + m.titlebar.height / 2)) <= 1, { toggle: round(m.toggle), titlebar: round(m.titlebar) });
          }
          c.check(`${where}: no horizontal overflow`, g.horizontalOverflow === 0 && g.overflowingElements.length === 0, { horizontalOverflow: g.horizontalOverflow, overflowingElements: g.overflowingElements });
          c.check(`${where}: chart spans the column, actions inside the window`, m.chart && m.chart.width >= m.column.width - 2 && m.actions && m.actions.right <= viewport.width && m.actions.x >= barRight, { chart: round(m.chart), column: round(m.column), actions: round(m.actions) });
          const record = { viewport: viewport.name, appearance, page: target.name, ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v)])) };
          if (BASELINE_URL) {
            const before = await open(browser, viewport, appearance, `${BASELINE_URL}${target.path}`, null);
            await waitForDocument(before.page, target.id);
            await waitForDiagrams(before.page);
            const b = await corner(before.page);
            record.baseline = { chart: round(b.chart), actions: round(b.actions), titlebar: round(b.titlebar), toggle: round(b.toggle) };
            const same = (x, y) => x && y && Math.abs(x.y - y.y) <= 1 && Math.abs(x.x - y.x) <= 1 && Math.abs(x.width - y.width) <= 1;
            // The actions group ends where it did; it is one control narrower since the Markdown source button was removed.
            const sameEnd = (x, y) => x && y && Math.abs(x.y - y.y) <= 1 && Math.abs(x.right - y.right) <= 1 && x.width <= y.width + 1;
            c.check(`${where}: chart top/width and titlebar actions' right edge unchanged from the baseline build`, same(m.chart, b.chart) && sameEnd(m.actions, b.actions) && Math.abs(m.titlebar.height - b.titlebar.height) <= 0.5, record.baseline);
            await before.context.close();
          }
          measurements.push(record);
          if (target.name === 'root') await page.screenshot({ path: join(SCREENSHOTS, `${engine}-${tag}-${viewport.name}-${appearance}.png`) });
          keep(errors);
          await context.close();
        }
      }
    }

    // 2. Desktop: hide and show by keyboard; the toggle and the name stay put and keep focus.
    for (const viewport of [WIDTHS[2], WIDTHS[3]]) {
      const { page, errors, context } = await open(browser, viewport, 'dark', `${BASE_URL}/docs/${deepId}`, mutant);
      await waitForDocument(page, deepId);
      await waitForDiagrams(page);
      const where = `${viewport.name} desktop`;
      // WebKit on macOS moves between links and buttons with Option-Tab.
      const tab = engine === 'webkit' ? 'Alt+Tab' : 'Tab';
      let tabs = 0;
      while (tabs < 4 && !(await activeElement(page))?.sidebarToggle) {
        await page.keyboard.press(tab);
        tabs += 1;
      }
      c.check(`${where}: toggle is the first stop after the skip link`, tabs === 2, { tabs });
      const shown = await corner(page);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#sidebar')).visibility === 'hidden');
      await page.waitForTimeout(300);
      const hidden = await corner(page);
      const focusHidden = await activeElement(page);
      c.check(`${where}: hide keeps the toggle and its focus in place`, focusHidden?.sidebarToggle && hidden.expanded === 'false' && hidden.label === 'Show sidebar' && Math.abs(hidden.toggle.x - shown.toggle.x) <= 0.5 && Math.abs(hidden.toggle.y - shown.toggle.y) <= 0.5, { focusHidden, before: round(shown.toggle), after: round(hidden.toggle) });
      c.check(`${where}: hidden: name stays beside the toggle, Back after it, pane and chart wider`, hidden.brand && Math.abs(hidden.brand.x - shown.brand.x) <= 0.5 && hidden.back.x >= hidden.brand.right + 8 && hidden.titlebar.width > shown.titlebar.width + 200 && hidden.chart.width > shown.chart.width, { brand: round(hidden.brand), back: round(hidden.back), pane: [shown.titlebar.width, hidden.titlebar.width], chart: [shown.chart.width, hidden.chart.width] });
      if (viewport === WIDTHS[2]) await page.screenshot({ path: join(SCREENSHOTS, `${engine}-${tag}-laptop-hidden.png`) });
      await page.reload();
      await waitForDocument(page, deepId);
      const remembered = await corner(page);
      c.check(`${where}: hidden is remembered across a reload`, remembered.expanded === 'false' && !remembered.sidebarVisible, { expanded: remembered.expanded });
      await page.locator(S.menuButton).focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#sidebar')).visibility === 'visible');
      await page.waitForTimeout(300);
      const back = await corner(page);
      c.check(`${where}: show restores the sidebar, focus on the toggle`, (await activeElement(page))?.sidebarToggle && back.expanded === 'true' && Math.abs(back.chart.width - shown.chart.width) <= 1, { chart: back.chart.width });
      await page.locator(S.expandButton).first().click();
      await page.waitForSelector('figure.diagram[data-expanded]');
      const expanded = await corner(page);
      c.check(`${where}: an expanded chart covers the app bar`, !expanded.toggleOnTop);
      await page.keyboard.press('Escape');
      await page.waitForSelector('figure.diagram[data-expanded]', { state: 'detached' });
      const path = new URL(page.url()).pathname;
      c.check(`${where}: toggling never navigates`, path === `/docs/${deepId}`, { path });
      await page.locator(S.brand).click();
      await waitForDocument(page, 'nessa');
      c.check(`${where}: the name opens the system overview, sidebar unchanged`, new URL(page.url()).pathname === '/' && (await page.locator(S.menuButton).getAttribute('aria-expanded')) === 'true');
      keep(errors);
      await context.close();
    }

    // 2b. Resizing the docked sidebar (keyboard and drag) moves neither the toggle nor the name;
    // the reading pane takes the rest of the window and the chart still spans its column.
    for (const viewport of [WIDTHS[2], WIDTHS[3]]) {
      for (const appearance of ['dark', 'light']) {
        const { page, errors, context } = await open(browser, viewport, appearance, `${BASE_URL}/docs/${deepId}`, mutant);
        await waitForDocument(page, deepId);
        await waitForDiagrams(page);
        const where = `${viewport.name} ${appearance} resize`;
        const base = await corner(page);
        const frame = async () => ({ m: await corner(page), g: await geometry(page) });
        const steady = ({ m, g }, width) =>
          Math.abs(m.sidebar.width - width) <= 0.5 &&
          Math.abs(m.toggle.x - base.toggle.x) <= 0.5 && Math.abs(m.toggle.y - base.toggle.y) <= 0.5 &&
          Math.abs(m.brand.x - base.brand.x) <= 0.5 && Math.abs(m.brand.y - base.brand.y) <= 0.5 && Math.abs(m.brand.width - base.brand.width) <= 0.5 &&
          m.brand.right <= m.sidebar.right - 8 && m.search.y >= m.toggle.bottom + 4 &&
          Math.abs(g.main.x - (m.sidebar.right + 8)) <= 1 && Math.abs(g.main.x + g.main.width - (viewport.width - 8)) <= 1 &&
          Math.abs(m.titlebar.height - base.titlebar.height) <= 0.5 &&
          m.chart.width >= m.column.width - 2 && m.actions.right <= viewport.width &&
          g.horizontalOverflow === 0 && g.overflowingElements.length === 0;
        const record = (f) => ({ sidebar: f.m.sidebar.width, toggle: round(f.m.toggle), brand: round(f.m.brand), main: f.g.main, chart: round(f.m.chart) });
        await page.locator(S.resizer).focus();
        await page.keyboard.press('Home');
        const narrowest = await frame();
        c.check(`${where}: 220px: app bar unmoved, pane fills the rest, chart spans the column, no overflow`, steady(narrowest, 220), record(narrowest));
        await page.keyboard.press('End');
        const widest = await frame();
        c.check(`${where}: 350px: app bar unmoved, pane fills the rest, chart spans the column, no overflow`, steady(widest, 350), record(widest));
        const handle = await page.locator(S.resizer).boundingBox();
        await page.mouse.move(handle.x + 6, handle.y + handle.height / 2);
        await page.mouse.down();
        await page.mouse.move(handle.x + 6 - 50, handle.y + handle.height / 2, { steps: 4 });
        const dragging = await frame();
        await page.mouse.up();
        const dropped = await frame();
        c.check(`${where}: mid-drag and after (300px): app bar unmoved, frame intact`, steady(dragging, 300) && steady(dropped, 300), { dragging: record(dragging), dropped: record(dropped) });
        await page.locator(S.menuButton).click();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#sidebar')).visibility === 'hidden');
        const hidden = await corner(page);
        await page.locator(S.menuButton).click();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#sidebar')).visibility === 'visible');
        const reshown = await frame();
        c.check(`${where}: hide keeps the app bar and Back clear of it; show returns at 300`, Math.abs(hidden.toggle.x - base.toggle.x) <= 0.5 && Math.abs(hidden.brand.x - base.brand.x) <= 0.5 && hidden.back.x >= hidden.brand.right + 8 && steady(reshown, 300), { hidden: round(hidden.brand), back: hidden.back?.x, reshown: record(reshown) });
        if (appearance === 'dark') await page.screenshot({ path: join(SCREENSHOTS, `${engine}-${tag}-${viewport.name}-resized-300.png`) });
        keep(errors);
        await context.close();
      }
    }

    // 3. Narrow: the drawer's top row is the app bar; Escape, the scrim and the name close it.
    for (const viewport of [WIDTHS[0], WIDTHS[1]]) {
      for (const appearance of ['dark', 'light']) {
        const { page, errors, context } = await open(browser, viewport, appearance, `${BASE_URL}/docs/${deepId}`, mutant);
        await waitForDocument(page, deepId);
        const where = `${viewport.name} ${appearance} drawer`;
        const menu = page.locator(S.menuButton);
        c.check(`${where}: toggle ≥ 40px`, ((await menu.boundingBox())?.height ?? 0) >= 40);
        const closedCorner = await corner(page);
        await menu.click();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#sidebar')).visibility === 'visible');
        await page.waitForTimeout(300);
        const m = await corner(page);
        const focus = await activeElement(page);
        c.check(`${where}: open: focus in the drawer, main inert, toggle on top and unmoved`, focus?.insideSidebar && m.expanded === 'true' && m.toggleOnTop && Math.abs(m.toggle.x - closedCorner.toggle.x) <= 0.5 && (await page.locator(S.main).evaluate((main) => main.inert)), { focus, toggle: round(m.toggle) });
        c.check(`${where}: open: name inside the drawer's top row, above Search`, m.brand && m.brand.x >= m.sidebar.x && m.brand.right <= m.sidebar.right - 8 && m.search.y >= m.brand.bottom + 4 && m.brand.y >= 0, { brand: round(m.brand), sidebar: round(m.sidebar), search: round(m.search) });
        await page.screenshot({ path: join(SCREENSHOTS, `${engine}-${tag}-${viewport.name}-${appearance}-drawer.png`) });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#sidebar')).visibility === 'hidden');
        c.check(`${where}: Escape closes, focus back on the toggle`, (await activeElement(page))?.sidebarToggle && (await menu.getAttribute('aria-expanded')) === 'false');
        await menu.click();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#sidebar')).visibility === 'visible');
        await page.locator(S.scrim).click({ position: { x: viewport.width - 10, y: viewport.height / 2 } });
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#sidebar')).visibility === 'hidden');
        c.check(`${where}: scrim closes, focus back on the toggle`, (await activeElement(page))?.sidebarToggle === true);
        await menu.click();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#sidebar')).visibility === 'visible');
        await page.locator(S.brand).click();
        await waitForDocument(page, 'nessa');
        c.check(`${where}: the name opens the overview and closes the drawer`, new URL(page.url()).pathname === '/' && (await menu.getAttribute('aria-expanded')) === 'false');
        keep(errors);
        await context.close();
      }
    }
    c.check('brand: no console errors', allErrors.console.length === 0, { console: allErrors.console });
    c.check('brand: no page errors', allErrors.page.length === 0, { page: allErrors.page });
  } catch (error) {
    c.check('brand completed without exception', false, { error: String(error) });
  } finally {
    await browser.close();
  }
  const result = { engine, script: tag, baseUrl: BASE_URL, baselineUrl: BASELINE_URL, ok: c.ok, passed: c.list.filter((x) => x.pass).length, total: c.list.length, checks: c.list, measurements };
  writeResult(`${tag}-${engine}`, result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runBrand(process.argv[2] || 'chromium', process.argv[3] || undefined);
  console.log(JSON.stringify({ engine: result.engine, script: result.script, ok: result.ok, passed: result.passed, total: result.total, failed: result.checks.filter((x) => !x.pass).map((x) => x.name) }));
  process.exit(result.ok ? 0 : 1);
}
