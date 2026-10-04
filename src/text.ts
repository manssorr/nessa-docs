// Heading anchors. Plain text and entities are shared with the server
// (shared/markdown.ts).

/** GitHub-style heading anchors, de-duplicated per document by the caller's `seen` map. */
export function slugify(text: string, seen: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-') || 'section';
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}
