import { describe, expect, it } from 'vitest';
import { lexMarkdown } from '../shared/markdown';
import { sectionOverview } from './detail-inspector';

const blocks = (md: string) => sectionOverview(lexMarkdown(md)).filter((t) => t.type !== 'space').map((t) => t.type);

describe('sectionOverview (what Standard opens on)', () => {
  it('is the opening blocks, at most two, and stops at a nested heading', () => {
    expect(blocks('One.\n\nTwo.\n\nThree.')).toEqual(['paragraph', 'paragraph']);
    expect(blocks('One.\n\n- rule a\n- rule b\n\nEvidence.')).toEqual(['paragraph', 'list']);
    expect(blocks('Only.\n\n### Nested\n\nMore.')).toEqual(['paragraph']);
    expect(blocks('### Nested first\n\nMore.')).toEqual([]);
  });
});
