// How a document body is structured: its Mermaid blocks in order and its
// sections. The server validates `diagramDetails` against this and the browser
// renders from it, so "diagram 0" and "the section under this heading" mean
// the same thing on both sides. One lexer configuration (marked, GFM).

import { Lexer, type Token, type Tokens } from 'marked';

export function lexMarkdown(body: string): Token[] {
  return new Lexer({ gfm: true }).lex(body);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    const key = name.toLowerCase();
    return Object.hasOwn(ENTITIES, key) ? (ENTITIES[key] as string) : whole;
  });
}

/** The words of inline tokens, without formatting: a heading's text as a reader sees it. */
export function plainText(tokens: readonly Token[] | undefined): string {
  if (!tokens) return '';
  return tokens
    .map((token) => {
      if ('tokens' in token && Array.isArray(token.tokens) && token.tokens.length > 0) return plainText(token.tokens);
      if (token.type === 'escape') return token.raw.slice(1);
      return 'text' in token && typeof token.text === 'string' ? decodeEntities(token.text) : '';
    })
    .join('');
}

export interface MarkdownDiagram {
  readonly source: string;
  /** The nearest heading above the block, if any. */
  readonly heading: Tokens.Heading | null;
}

function isMermaid(token: Token): token is Tokens.Code {
  return token.type === 'code' && (token as Tokens.Code).lang?.trim().toLowerCase() === 'mermaid';
}

/** Every Mermaid block in document order (inside block quotes and list items too): diagram N is the Nth. */
export function markdownDiagrams(tokens: readonly Token[]): MarkdownDiagram[] {
  const diagrams: MarkdownDiagram[] = [];
  let heading: Tokens.Heading | null = null;
  const visit = (list: readonly Token[]) => {
    for (const token of list) {
      if (token.type === 'heading') heading = token as Tokens.Heading;
      else if (isMermaid(token)) diagrams.push({ source: token.text, heading });
      else if (token.type === 'blockquote') visit((token as Tokens.Blockquote).tokens);
      else if (token.type === 'list') for (const item of (token as Tokens.List).items) visit(item.tokens);
    }
  };
  visit(tokens);
  return diagrams;
}

export interface MarkdownSection {
  readonly heading: Tokens.Heading;
  /** The heading's text (plainText), which `diagramDetails` names exactly. */
  readonly title: string;
  /** Its blocks: tokens[start] is the heading; the section ends before tokens[end]. */
  readonly start: number;
  readonly end: number;
}

/**
 * The body's sections: each top-level heading with its nested headings, up to
 * the next heading of the same or a higher level (or the end). Headings inside
 * block quotes or lists do not start a section.
 */
export function markdownSections(tokens: readonly Token[]): MarkdownSection[] {
  const starts = tokens.flatMap((token, index) => (token.type === 'heading' ? [index] : []));
  return starts.map((start) => {
    const heading = tokens[start] as Tokens.Heading;
    const next = starts.find((index) => index > start && (tokens[index] as Tokens.Heading).depth <= heading.depth);
    return { heading, title: plainText(heading.tokens), start, end: next ?? tokens.length };
  });
}

/** The longest Mermaid block the site draws (UTF-16 code units of the block as written). */
export const MERMAID_MAX_TEXT_SIZE = 100_000;

/**
 * Whether a Mermaid block is short enough to be drawn. The browser does not
 * draw a longer one (src/diagram.tsx) and the server binds no details to it
 * (server/diagram-details.ts); both ask here. Mermaid's own limit (maxTextSize,
 * set to the same number in the renderer) measures its cleaned text, which
 * cleaning only shortens (front matter, directives and comments removed, quotes
 * swapped in place), so a block that fits is never replaced by Mermaid's
 * "Maximum text size" chart. verification/details.mjs D17 draws a block of
 * exactly this length and refuses one a character longer.
 */
export function diagramFits(source: string): boolean {
  return source.length <= MERMAID_MAX_TEXT_SIZE;
}
