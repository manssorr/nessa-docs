// Small production experiment: API/module overlap; this records timings, not a frame budget.
import { loadPlaywright, writeResult } from './lib.mjs';
const base = process.env.BASE_URL || 'http://127.0.0.1:4324';
const target = process.env.PROFILE_DOCUMENT || 'host-startup-authenticate-reconnect-expire-or-revoke-a-surface-session';
const samples = Number(process.env.PROFILE_RUNS || 5);
const results = [];
for (const engine of ['chromium', 'webkit']) {
  const browser = await loadPlaywright()[engine].launch();
  const readings = [];
  for (let run = 0; run < samples; run++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    if (engine === 'chromium') { const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
    await page.goto(`${base}/docs/${target}`);
    await page.waitForSelector(`.document-layout[data-doc-id="${target}"] figure[data-state="rendered"] .diagram-svg svg`, { timeout: 30000 });
    const facts = await page.evaluate(() => ({
      renderedAt: performance.now(),
      requests: performance.getEntriesByType('resource').filter((entry) => /api\/(?:projects|catalog|documents)|mermaid\.core/.test(entry.name)).map((entry) => ({ path: new URL(entry.name).pathname, start: entry.startTime, end: entry.responseEnd })),
      figures: document.querySelectorAll('figure[data-state="rendered"] .diagram-svg svg').length,
      failed: document.querySelectorAll('figure[data-state="failed"]').length,
    }));
    const project = new URL(page.url()).searchParams.get('project');
    const navigate = async (id) => {
      await page.evaluate(({ id, project }) => { history.pushState({}, '', `/docs/${id}?project=${project}`); dispatchEvent(new PopStateEvent('popstate')); }, { id, project });
      await page.waitForSelector(`.document-layout[data-doc-id="${id}"] figure[data-state="rendered"] .diagram-svg svg`, { timeout: 30000 });
    };
    await navigate('host');
    const start = await page.evaluate(() => performance.now());
    await navigate(target);
    const warm = await page.evaluate((start) => performance.now() - start, start);
    readings.push({ run, ...facts, warm }); await context.close();
  }
  const summarize = (key) => { const times = readings.map((r) => r[key]).sort((a,b) => a-b); return { median: times[Math.floor(times.length/2)], max: times.at(-1) }; };
  results.push({ engine, cpuThrottle: engine === 'chromium' ? 4 : null, cold: summarize('renderedAt'), warm: summarize('warm'), readings }); await browser.close();
}
const result = { script: 'startup-profile', label: process.env.PROFILE_LABEL || 'baseline', base, document: target, samples, results };
writeResult(`startup-profile-${result.label}`, result); console.log(JSON.stringify(result, null, 2));
