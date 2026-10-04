// Builders for frontmatter documents used across server tests.

export interface Fields {
  id?: unknown;
  title?: unknown;
  kind?: unknown;
  status?: unknown;
  summary?: unknown;
  parent?: unknown;
  sources?: unknown;
  diagramLinks?: unknown;
  [extra: string]: unknown;
}

export function markdown(fields: Fields, body = ''): string {
  const yaml = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
  return `---\n${yaml}\n---\n${body}`;
}

export function doc(id: string, parent: string | null, extra: Fields = {}, body = `# ${id}\n`): string {
  return markdown(
    {
      id,
      title: `Title ${id}`,
      kind: parent === null ? 'system' : 'service',
      status: 'implemented',
      summary: `Summary of ${id}`,
      parent,
      sources: [],
      diagramLinks: {},
      ...extra,
    },
    body,
  );
}

export const REPO = '/repo';
export const STATE = '/repo/docs/state';

/** A valid tree: system → chat service → send feature → submit flow. */
export function validTree(): Record<string, string | { symlink: string } | { dir: true }> {
  return {
    [`${STATE}/README.md`]: doc(
      'nessa',
      null,
      { diagramLinks: { Chat: 'chat' } },
      '# Nessa\n\n```mermaid\nflowchart LR\n  Chat --> Gateway\n```\n',
    ),
    [`${STATE}/services/chat/README.md`]: doc(
      'chat',
      'nessa',
      { sources: ['src/chat.ts', '../nessa-ui/src/x.ts'], diagramLinks: { Send: 'chat-send' } },
      '# Chat\n\n```mermaid\nstateDiagram-v2\n  [*] --> Send\n```\n\nSee [send](send/README.md), [flow](send/submit.md#steps), [code](../../../../src/chat.ts), [ui](../../../../../nessa-ui/README.md), [web](https://example.com/x) and [bad](javascript:alert(1)).\n',
    ),
    [`${STATE}/services/chat/send/README.md`]: doc('chat-send', 'chat', { kind: 'feature' }),
    [`${STATE}/services/chat/send/submit.md`]: doc('chat-send-submit', 'chat-send', { kind: 'flow' }),
    [`${STATE}/services/chat/send/diagram.mmd`]: 'flowchart LR\n A-->B',
    [`${REPO}/src/chat.ts`]: 'export {}',
  };
}
