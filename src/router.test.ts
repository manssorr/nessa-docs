import { describe, expect, it, vi } from 'vitest';
import { parseRoute, parseSettingsTab, settingsPath, projectHref } from './router';

describe('settings routes', () => {
  it('/settings is Settings; /problems is no longer a page', () => {
    expect(parseRoute('/settings')).toEqual({ kind: 'settings' });
    expect(parseRoute('/problems')).toEqual({ kind: 'not-found', path: '/problems' });
    expect(parseRoute('/settings/health')).toEqual({ kind: 'not-found', path: '/settings/health' });
  });
  it('?tab=health opens Health; anything else opens General', () => {
    expect(parseSettingsTab('?tab=health')).toBe('health');
    expect(parseSettingsTab('')).toBe('general');
    expect(parseSettingsTab('?tab=general')).toBe('general');
    expect(parseSettingsTab('?tab=HEALTH')).toBe('general');
    expect(parseSettingsTab('?tab=problems')).toBe('general');
  });
  it('builds the URL each tab parses back from', () => {
    for (const tab of ['general', 'health'] as const) {
      const url = new URL(settingsPath(tab), 'http://x');
      expect(parseRoute(url.pathname)).toEqual({ kind: 'settings' });
      expect(parseSettingsTab(url.search)).toBe(tab);
    }
    expect(settingsPath('general')).toBe('/settings');
  });
});

it('qualifies every internal destination with the project without replacing explicit identities', () => {
  vi.stubGlobal('window', { location: { href: 'http://localhost/docs/same?project=one', search: '?project=one' } });
  expect(projectHref('/docs/same?view=details#section')).toBe('/docs/same?view=details&project=one#section');
  expect(projectHref('/settings?tab=health')).toBe('/settings?tab=health&project=one');
  expect(projectHref('/?project=two')).toBe('/?project=two');
  expect(projectHref('/open')).toBe('/open?project=one');
  vi.unstubAllGlobals();
});
