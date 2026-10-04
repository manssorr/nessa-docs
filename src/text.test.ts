import { describe, expect, it } from 'vitest';
import { decodeEntities } from '../shared/markdown';
import { slugify } from './text';

describe('slugify', () => {
  it('matches GitHub anchors and de-duplicates', () => {
    const seen = new Map<string, number>();
    expect(slugify('User flow: compose and send the first message', seen)).toBe('user-flow-compose-and-send-the-first-message');
    expect(slugify('Trace', seen)).toBe('trace');
    expect(slugify('Trace', seen)).toBe('trace-1');
    expect(slugify('`code` & <b>', seen)).toBe('code--b');
  });
});

describe('decodeEntities', () => {
  it('decodes known entities and leaves unknown ones', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &#65; &#x42; &bogus; &constructor;')).toBe('a & b <c> A B &bogus; &constructor;');
  });
});
