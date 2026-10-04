import { describe, expect, it } from 'vitest';
import type { IssueCode } from '../shared/api.js';
import { lexMarkdown, MERMAID_MAX_TEXT_SIZE, markdownDiagrams, markdownSections } from '../shared/markdown.js';
import { loadCatalog } from './catalog.js';
import { resolveDiagramDetails } from './diagram-details.js';
import { type AuthoredDiagramDetail, DETAIL_LIMITS, parseDocumentFile } from './document.js';
import { documentResponse } from './responses.js';
import { readDiagram } from './diagram-reader.js';
import { doc, REPO, STATE, validTree } from './testing/documents.js';
import { memoryFiles } from './testing/memory-files.js';

const CHART = [
  'stateDiagram-v2',
  '    [*] --> Admission',
  '    Admission --> Refused: Origin, scope, visibility or bounds rejected',
  '    Admission --> Refused: Admission audit unavailable',
  '    Admission --> Review: Destructive tool / audit approval request',
  '    Review --> Refused: Denied [time >= deadline]',
  '    state Review {',
  '        [*] --> Asking',
  '        Asking --> Answered: person decides',
  '    }',
  '    Refused --> [*]',
  '    note right of Review',
  '        a note, not a state',
  '    end note',
].join('\n');

const BODY = [
  '# App call',
  '',
  '```mermaid',
  CHART,
  '```',
  '',
  '## Call admission',
  '',
  'Admission means the gateway decides.',
  '',
  '## Admission refusal rules',
  '',
  'Refused describes a call that did not reach the server.',
  '',
  '### Origin',
  '',
  'Nested heading stays in the section.',
  '',
  '## Direct dispatch admission',
  '',
  'Audit must commit first.',
  '',
  '> ```mermaid',
  '> flowchart LR',
  '>   A --> B',
  '> ```',
  '',
].join('\n');

const node = (diagram: number, name: string, section: string): AuthoredDiagramDetail => ({
  diagram,
  selector: { kind: 'node', node: name },
  section,
});
const edge = (diagram: number, from: string, to: string, label: string, section: string): AuthoredDiagramDetail => ({
  diagram,
  selector: { kind: 'edge', from, to, label },
  section,
});

describe('shared Markdown structure', () => {
  it('numbers Mermaid blocks in document order, block quotes included, and bounds sections by heading level', () => {
    const tokens = lexMarkdown(BODY);
    expect(markdownDiagrams(tokens).map((d) => d.source.split('\n')[0])).toEqual(['stateDiagram-v2', 'flowchart LR']);
    const sections = markdownSections(tokens);
    expect(sections.map((s) => s.title)).toEqual(['App call', 'Call admission', 'Admission refusal rules', 'Origin', 'Direct dispatch admission']);
    const refusal = sections[2]!;
    const text = tokens.slice(refusal.start, refusal.end).map((t) => t.raw).join('');
    expect(text).toContain('Nested heading stays in the section.');
    expect(text).not.toContain('Audit must commit first.');
    // The title section runs to the end: nothing after it is at its level or higher.
    expect(sections[0]!.end).toBe(tokens.length);
  });
});

describe('resolveDiagramDetails (Mermaid reads the chart)', () => {
  // The first read starts the Mermaid worker (jsdom and Mermaid load cold): allowed the reader's own 15 s deadline and more.
  it('binds same-pair transitions to their own Mermaid element by exact label', { timeout: 20_000 }, async () => {
    const { details, problems } = await resolveDiagramDetails(
      [
        edge(0, 'Admission', 'Refused', 'Origin, scope, visibility or bounds rejected', 'Admission refusal rules'),
        edge(0, 'Admission', 'Refused', 'Admission audit unavailable', 'Direct dispatch admission'),
        edge(0, 'Review', 'Refused', 'Denied [time >= deadline]', 'Admission refusal rules'),
        edge(0, 'Asking', 'Answered', 'person decides', 'Call admission'),
        node(0, 'Refused', 'Admission refusal rules'),
        node(0, 'Asking', 'Call admission'),
      ],
      BODY,
      readDiagram,
    );
    expect(problems).toEqual([]);
    const elements = details.flatMap((d) => (d.target.kind === 'edge' ? [d.target.element] : []));
    expect(new Set(elements).size).toBe(4);
    expect(details[0]).toEqual({
      diagram: 0,
      family: 'state',
      target: { kind: 'edge', from: 'Admission', to: 'Refused', label: 'Origin, scope, visibility or bounds rejected', element: 'edge1' },
      section: { title: 'Admission refusal rules', index: 2 },
    });
    expect(details[1]?.target).toMatchObject({ label: 'Admission audit unavailable', element: 'edge2' });
    expect(details[1]?.section).toEqual({ title: 'Direct dispatch admission', index: 4 });
    expect(details[4]).toEqual({ diagram: 0, family: 'state', target: { kind: 'node', node: 'Refused' }, section: { title: 'Admission refusal rules', index: 2 } });
  });

  it('reports every entry it cannot bind, with a typed code, and publishes none of them', async () => {
    const cases: [AuthoredDiagramDetail, IssueCode][] = [
      [node(2, 'Refused', 'Call admission'), 'unknown-detail-diagram'],
      [node(1, 'Missing', 'Call admission'), 'unknown-detail-node'],
      [node(0, 'Missing', 'Call admission'), 'unknown-detail-node'],
      // A note (and the group Mermaid draws around a note and its state) is not a state.
      [node(0, 'Review----note-8', 'Call admission'), 'unknown-detail-node'],
      [node(0, 'Review----parent', 'Call admission'), 'unknown-detail-node'],
      [edge(0, 'Admission', 'Refused', 'origin, scope, visibility or bounds rejected', 'Call admission'), 'unknown-detail-edge'],
      [edge(0, 'Admission', 'Refused', 'Origin, scope, visibility or bounds rejected ', 'Call admission'), 'unknown-detail-edge'],
      [edge(0, 'Refused', 'Admission', 'Admission audit unavailable', 'Call admission'), 'unknown-detail-edge'],
      [node(0, 'Refused', 'call admission'), 'unknown-detail-section'],
      [node(0, 'Refused', '## Call admission'), 'unknown-detail-section'],
    ];
    for (const [entry, code] of cases) {
      const { details, problems } = await resolveDiagramDetails([entry], BODY, readDiagram);
      expect(details, JSON.stringify(entry)).toEqual([]);
      expect(problems.map((p) => p.code), JSON.stringify(entry)).toEqual([code]);
    }
    const near = await resolveDiagramDetails([edge(0, 'Admission', 'Refused', 'rejected', 'Call admission')], BODY, readDiagram);
    expect(near.problems[0]?.message).toContain('"Origin, scope, visibility or bounds rejected", "Admission audit unavailable"');
  });

  it('refuses an ambiguous transition, an ambiguous heading and a selector named twice', async () => {
    const twice = `## Same\n\n## Same\n\n\`\`\`mermaid\nstateDiagram-v2\n  A --> B: go\n  A --> B: go\n  A --> B: stop\n\`\`\`\n`;
    const ambiguousEdge = await resolveDiagramDetails([edge(0, 'A', 'B', 'go', '## not used')], twice.replace('## Same\n\n## Same', '## One'), readDiagram);
    expect(ambiguousEdge.problems.map((p) => p.code)).toEqual(['unknown-detail-section']);
    const body = twice.replace('## Same\n\n## Same', '## One\n\n## Same\n\n## Same');
    const result = await resolveDiagramDetails(
      [
        edge(0, 'A', 'B', 'go', 'One'),
        node(0, 'A', 'Same'),
        node(0, 'B', 'One'),
        node(0, 'B', 'One'),
        edge(0, 'A', 'B', 'stop', 'One'),
      ],
      body,
      readDiagram,
    );
    expect(result.problems.map((p) => p.code)).toEqual([
      'ambiguous-detail-edge',
      'ambiguous-detail-section',
      'duplicate-detail-selector',
      'duplicate-detail-selector',
    ]);
    expect(result.details.map((d) => d.target)).toEqual([{ kind: 'edge', from: 'A', to: 'B', label: 'stop', element: expect.stringMatching(/^edge\d+$/) }]);
  });

  it('keeps a reader failure an unsupported diagram, not a crash', async () => {
    const result = await resolveDiagramDetails([node(0, 'Refused', 'Call admission')], BODY, async () => ({ kind: 'unsupported', reason: 'no Mermaid' }));
    expect(result.problems).toEqual([{ code: 'unsupported-detail-diagram', message: expect.stringContaining('no Mermaid') }]);
    const broken = await resolveDiagramDetails([node(0, 'A', 'Call admission')], BODY.replace('[*] --> Admission', 'A -->'), readDiagram);
    expect(broken.problems.map((p) => p.code)).toEqual(['unsupported-detail-diagram']);
  });
});

describe('transition labels: the words a reader sees, written as is', () => {
  const LABELS = [
    '## S',
    '',
    '```mermaid',
    'stateDiagram-v2',
    '    A --> B: say #quot;hi#quot; #35;1',
    '    A --> C: <b>bold</b> <script>x</script>ok',
    '    A --> D: line<br>two',
    '    A --> E: a < b & c',
    '    A --> F: explicit revoke [time >= issuance] / keep',
    '    A --> F: plain twin',
    '```',
    '',
  ].join('\n');
  const one = async (to: string, label: string) => resolveDiagramDetails([edge(0, 'A', to, label, 'S')], LABELS, readDiagram);

  it('binds plain labels, including <, & and >= written as is', async () => {
    for (const [to, label] of [['E', 'a < b & c'], ['F', 'explicit revoke [time >= issuance] / keep']] as const) {
      const result = await one(to, label);
      expect(result.problems, label).toEqual([]);
      expect(result.details[0]?.target).toMatchObject({ kind: 'edge', label, element: expect.stringMatching(/^edge\d+$/) });
    }
  });

  it('refuses labels written with entity codes or HTML, in either spelling, without quoting internal or markup text', async () => {
    const cases: [string, string][] = [
      ['B', 'say #quot;hi#quot; #35;1'],
      ['B', 'say "hi" #1'],
      ['C', '<b>bold</b> <script>x</script>ok'],
      ['C', 'bold ok'],
      ['D', 'line<br>two'],
      ['D', 'line two'],
    ];
    for (const [to, label] of cases) {
      const result = await one(to, label);
      expect(result.details, label).toEqual([]);
      expect(result.problems.map((p) => p.code), label).toEqual(['unsupported-detail-label']);
      // After the authored selector (quoted as written): the reason, which quotes no chart label.
      const reason = (result.problems[0]?.message ?? '').split('): ').slice(1).join('): ');
      expect(reason).toContain('entity codes (#…;) or HTML');
      expect(reason).not.toMatch(/[\uFB02\u00B6]|<b>|<br>|bold ok|found/);
    }
    const twin = await one('F', 'not either');
    expect(twin.problems.map((p) => p.code)).toEqual(['unknown-detail-edge']);
    expect(twin.problems[0]?.message).toContain('(found "explicit revoke [time >= issuance] / keep", "plain twin")');
  });

  it('leaves the main thread without a DOM and DOMPurify unmodified', async () => {
    await one('E', 'a < b & c');
    expect('window' in globalThis).toBe(false);
    const purify = (await import('dompurify')).default as unknown as Record<string, unknown>;
    expect(purify.isSupported).toBe(false);
    expect(purify.sanitize).toBeUndefined();
  });
});

describe('flowchart component maps: plain nodes and labelled edges', () => {
  const chart = (lines: string[]) => ['## S', '', '```mermaid', ...lines, '```', '', '## T', ''].join('\n');
  const MAP = chart([
    'flowchart TB',
    '    Startup[Required host composition]',
    '    Gateway[Managed gateway lifecycle]',
    '    Surface[Startup refusal or initial surface]',
    '    Credentials[Scoped provider-key save]',
    '    Endpoint[Endpoint discovery]',
    '    Windows[Native window policy]',
    '    Startup -->|ready| Gateway',
    '    Startup -->|ready or refusal| Surface',
    '    Gateway -->|validated identity| Endpoint',
    '    Startup -->|scoped namespace| Credentials',
    '    Surface -->|show and dismiss| Windows',
  ]);
  const bind = (entries: AuthoredDiagramDetail[], body = MAP) => resolveDiagramDetails(entries, body, readDiagram);
  const codes = (result: { problems: readonly { code: IssueCode }[] }) => result.problems.map((p) => p.code);

  it('binds each labelled edge of a component map to the identity Mermaid draws, and its nodes', async () => {
    const { details, problems } = await bind([
      edge(0, 'Startup', 'Gateway', 'ready', 'S'),
      edge(0, 'Startup', 'Surface', 'ready or refusal', 'T'),
      edge(0, 'Gateway', 'Endpoint', 'validated identity', 'S'),
      edge(0, 'Startup', 'Credentials', 'scoped namespace', 'T'),
      edge(0, 'Surface', 'Windows', 'show and dismiss', 'S'),
      node(0, 'Startup', 'T'),
    ]);
    expect(problems).toEqual([]);
    expect(details.map((d) => [d.family, d.target.kind === 'edge' ? d.target.element : d.target.node, d.section.title])).toEqual([
      ['flowchart', 'L_Startup_Gateway_0', 'S'],
      ['flowchart', 'L_Startup_Surface_0', 'T'],
      ['flowchart', 'L_Gateway_Endpoint_0', 'S'],
      ['flowchart', 'L_Startup_Credentials_0', 'T'],
      ['flowchart', 'L_Surface_Windows_0', 'S'],
      ['flowchart', 'Startup', 'T'],
    ]);
  });

  it('tells sibling edges of one pair apart by label, and refuses a reversed pair, a near label and a repeated label', async () => {
    const body = chart(['graph LR', '    A -->|ready| B', '    A -->|refused| B', '    C -->|go| D', '    C -->|go| D']);
    const siblings = await bind([edge(0, 'A', 'B', 'ready', 'S'), edge(0, 'A', 'B', 'refused', 'T')], body);
    expect(siblings.problems).toEqual([]);
    const elements = siblings.details.map((d) => (d.target.kind === 'edge' ? d.target.element : null));
    expect(new Set(elements).size).toBe(2);
    expect(siblings.details.map((d) => d.section.title)).toEqual(['S', 'T']);
    expect(codes(await bind([edge(0, 'B', 'A', 'ready', 'S')], body))).toEqual(['unknown-detail-edge']);
    const near = await bind([edge(0, 'A', 'B', 'Ready', 'S')], body);
    expect(codes(near)).toEqual(['unknown-detail-edge']);
    expect(near.problems[0]?.message).toContain('no edge from A to B has exactly this label (found "ready", "refused")');
    const repeated = await bind([edge(0, 'C', 'D', 'go', 'S')], body);
    expect(codes(repeated)).toEqual(['ambiguous-detail-edge']);
    expect(repeated.problems[0]?.message).toContain('2 edges from C to D have this label');
  });

  it('refuses an edge whose Mermaid identity names another element, and binds an edge by the ID its author gave it', async () => {
    const body = chart([
      'flowchart LR',
      '    A_B -->|left| C',
      '    A -->|right| B_C',
      '    P e1@-->|named| Q',
      '    M Q@-->|clash| N',
      '    subgraph G_H[Group]',
      '      Inner',
      '    end',
      '    F -->|to group| G_H',
      '    F_G -->|beside| H',
    ]);
    const shared = await bind(
      [edge(0, 'A_B', 'C', 'left', 'S'), edge(0, 'A', 'B_C', 'right', 'S'), edge(0, 'M', 'N', 'clash', 'S'), edge(0, 'F_G', 'H', 'beside', 'S')],
      body,
    );
    expect(shared.details).toEqual([]);
    // The last shares its identity with an edge to a subgraph, which no entry can select but the page still draws.
    expect(codes(shared)).toEqual(['ambiguous-detail-edge', 'ambiguous-detail-edge', 'ambiguous-detail-edge', 'ambiguous-detail-edge']);
    expect(shared.problems[0]?.message).toContain('the same identity as 1 other element of the chart');
    const named = await bind([edge(0, 'P', 'Q', 'named', 'S')], body);
    expect(named.problems).toEqual([]);
    expect(named.details[0]?.target).toMatchObject({ kind: 'edge', element: 'e1' });
  });

  it('binds labels drawn as written (quoted or not) and refuses entity codes, HTML and Markdown strings without quoting them', async () => {
    const body = chart([
      'flowchart LR',
      '    A -->|a < b & c| B',
      '    A -->|"quoted words"| C',
      '    A -->|say #quot;hi#quot;| D',
      '    A -->|<b>bold</b> ok| E',
      '    A -->|"`**strong**`"| F',
    ]);
    for (const [to, label] of [['B', 'a < b & c'], ['C', 'quoted words']] as const) {
      const result = await bind([edge(0, 'A', to, label, 'S')], body);
      expect(result.problems, label).toEqual([]);
      expect(result.details[0]?.target).toMatchObject({ kind: 'edge', label, element: `L_A_${to}_0` });
    }
    for (const [to, label] of [['D', 'say "hi"'], ['D', 'say #quot;hi#quot;'], ['E', 'bold ok'], ['E', '<b>bold</b> ok'], ['F', 'strong'], ['F', '**strong**']] as const) {
      const result = await bind([edge(0, 'A', to, label, 'S')], body);
      expect(result.details, label).toEqual([]);
      expect(codes(result), label).toEqual(['unsupported-detail-label']);
      const reason = (result.problems[0]?.message ?? '').split('): ').slice(1).join('): ');
      expect(reason).toContain('Mermaid entity codes (#…;), HTML or a Markdown string');
      expect(reason).not.toMatch(/[ﬂ¶]|<b>|bold ok|strong|found/);
    }
  });

  it('binds plain nodes only: a subgraph and an edge to it are not selectable; other chart types are unsupported', async () => {
    const body = chart(['flowchart LR', '    subgraph Group[Grouped]', '      Inner', '    end', '    Outer -->|enters| Group', '    Outer -->|reaches| Inner']);
    expect(codes(await bind([node(0, 'Group', 'S')], body))).toEqual(['unknown-detail-node']);
    expect((await bind([node(0, 'Group', 'S')], body)).problems[0]?.message).toContain('the chart has no node "Group"');
    expect(codes(await bind([edge(0, 'Outer', 'Group', 'enters', 'S')], body))).toEqual(['unknown-detail-edge']);
    expect((await bind([node(0, 'Inner', 'S'), edge(0, 'Outer', 'Inner', 'reaches', 'S')], body)).problems).toEqual([]);
    const sequence = await bind([node(0, 'A', 'S')], chart(['sequenceDiagram', '    A->>B: hi']));
    expect(codes(sequence)).toEqual(['unsupported-detail-diagram']);
    expect(sequence.problems[0]?.message).toContain('details bind to state diagrams and flowcharts only');
  });
});

describe('the drawable-size limit (shared/markdown.ts diagramFits)', () => {
  const chartOf = (length: number, head = '') => {
    const base = `${head}stateDiagram-v2\n    A --> B: go\n`;
    const padding = length - base.length - 4;
    return `${base}%% ${'x'.repeat(padding)}\n`.slice(0, length);
  };
  const bodyOf = (source: string) => `## S\n\n\`\`\`mermaid\n${source}\n\`\`\`\n`;

  it('binds a chart of exactly the limit and refuses one a character longer, as the browser draws them', async () => {
    const exact = bodyOf(chartOf(MERMAID_MAX_TEXT_SIZE));
    expect(markdownDiagrams(lexMarkdown(exact))[0]?.source.length).toBe(MERMAID_MAX_TEXT_SIZE);
    const atLimit = await resolveDiagramDetails([edge(0, 'A', 'B', 'go', 'S')], exact, readDiagram);
    expect(atLimit.problems).toEqual([]);
    expect(atLimit.details).toHaveLength(1);
    const over = bodyOf(chartOf(MERMAID_MAX_TEXT_SIZE + 1));
    expect(markdownDiagrams(lexMarkdown(over))[0]?.source.length).toBe(MERMAID_MAX_TEXT_SIZE + 1);
    const refused = await resolveDiagramDetails([edge(0, 'A', 'B', 'go', 'S'), node(0, 'A', 'S')], over, readDiagram);
    expect(refused.details).toEqual([]);
    expect(refused.problems.map((p) => p.code)).toEqual(['unsupported-detail-diagram', 'unsupported-detail-diagram']);
    expect(refused.problems[0]?.message).toContain('100,001 characters long, and charts over 100,000 are not drawn');
  });

  it('measures the block as written, front matter and directives included', async () => {
    const head = `---\ntitle: ${'t'.repeat(40)}\n---\n%%{init: {"theme": "base"}}%%\n`;
    const over = bodyOf(chartOf(MERMAID_MAX_TEXT_SIZE + 1, head));
    const refused = await resolveDiagramDetails([node(0, 'A', 'S')], over, readDiagram);
    expect(refused.problems.map((p) => p.code)).toEqual(['unsupported-detail-diagram']);
    const fits = bodyOf(chartOf(MERMAID_MAX_TEXT_SIZE, head));
    expect((await resolveDiagramDetails([node(0, 'A', 'S')], fits, readDiagram)).details).toHaveLength(1);
  });
});

describe('diagramDetails frontmatter shape', () => {
  const parse = (details: unknown) => parseDocumentFile(doc('x', 'nessa', { diagramDetails: details }));
  const rejected = (details: unknown) => {
    const outcome = parse(details);
    return outcome.kind === 'rejected' ? outcome.problems.map((p) => p.code) : [];
  };

  it('is optional, defaults to none, and is not an unknown field', () => {
    const absent = parseDocumentFile(doc('x', 'nessa'));
    expect(absent.kind === 'parsed' && absent.document.diagramDetails).toEqual([]);
    expect(absent.kind === 'parsed' && absent.warnings).toEqual([]);
    const listed = parse([
      { diagram: 0, node: 'Refused', section: 'Refused admission' },
      { diagram: 1, edge: { from: 'A', to: 'B', label: 'a / b [x >= y]' }, section: 'S' },
    ]);
    expect(listed.kind === 'parsed' && listed.document.diagramDetails).toEqual([
      { diagram: 0, selector: { kind: 'node', node: 'Refused' }, section: 'Refused admission' },
      { diagram: 1, selector: { kind: 'edge', from: 'A', to: 'B', label: 'a / b [x >= y]' }, section: 'S' },
    ]);
  });

  it('rejects the document for a malformed list or entry, like diagramLinks', () => {
    const bad: unknown[] = [
      {},
      'Refused',
      [null],
      [{ diagram: 0, section: 'S' }],
      [{ diagram: 0, node: 'A', edge: { from: 'A', to: 'B', label: 'x' }, section: 'S' }],
      [{ diagram: 0, node: 'A', section: 'S', note: 'x' }],
      [JSON.parse('{"diagram":0,"node":"A","section":"S","__proto__":{"polluted":true}}')],
      [{ diagram: -1, node: 'A', section: 'S' }],
      [{ diagram: 0.5, node: 'A', section: 'S' }],
      [{ diagram: '0', node: 'A', section: 'S' }],
      [{ diagram: DETAIL_LIMITS.diagram + 1, node: 'A', section: 'S' }],
      [{ diagram: 0, node: '[*]', section: 'S' }],
      [{ diagram: 0, node: 'A B', section: 'S' }],
      [{ diagram: 0, node: 'A', section: '' }],
      [{ diagram: 0, node: 'A', section: 'two\nlines' }],
      [{ diagram: 0, node: 'A', section: 'x'.repeat(DETAIL_LIMITS.text + 1) }],
      [{ diagram: 0, edge: 'A --> B', section: 'S' }],
      [{ diagram: 0, edge: { from: 'A', to: 'B' }, section: 'S' }],
      [{ diagram: 0, edge: { from: 'A', to: 'B', label: 'x', weight: 1 }, section: 'S' }],
      [{ diagram: 0, edge: { from: 'A', to: '[*]', label: 'x' }, section: 'S' }],
      Array.from({ length: DETAIL_LIMITS.entries + 1 }, () => ({ diagram: 0, node: 'A', section: 'S' })),
    ];
    for (const value of bad) expect(rejected(value), JSON.stringify(value)?.slice(0, 120)).toContain('invalid-field');
  });

  it('keeps prototype-named selectors as data', () => {
    const outcome = parse([{ diagram: 0, node: '__proto__', section: 'constructor' }]);
    expect(outcome.kind === 'parsed' && outcome.document.diagramDetails).toEqual([
      { diagram: 0, selector: { kind: 'node', node: '__proto__' }, section: 'constructor' },
    ]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('loadCatalog and documentResponse publish bound details only', () => {
  it('keeps the document, lists unbound entries as warnings, and serves the bound ones', async () => {
    const tree = validTree();
    tree[`${STATE}/services/chat/send/submit.md`] = doc(
      'chat-send-submit',
      'chat-send',
      {
        kind: 'flow',
        diagramDetails: [
          { diagram: 0, edge: { from: 'Admission', to: 'Refused', label: 'Origin, scope, visibility or bounds rejected' }, section: 'Admission refusal rules' },
          { diagram: 0, node: 'Nowhere', section: 'Call admission' },
          { diagram: 0, node: 'Refused', section: 'Missing heading' },
        ],
      },
      BODY,
    );
    const files = memoryFiles(tree);
    const catalog = await loadCatalog(files, REPO);
    const file = 'docs/state/services/chat/send/submit.md';
    expect(catalog.documents.has('chat-send-submit')).toBe(true);
    expect(catalog.issues.filter((i) => i.file === file).map((i) => [i.code, i.severity])).toEqual([
      ['unknown-detail-node', 'warning'],
      ['unknown-detail-section', 'warning'],
    ]);
    const response = await documentResponse(catalog, 'chat-send-submit', files);
    if ('error' in response) throw new Error('expected a document');
    expect(response.diagramDetails).toEqual([
      {
        diagram: 0,
        family: 'state',
        target: { kind: 'edge', from: 'Admission', to: 'Refused', label: 'Origin, scope, visibility or bounds rejected', element: 'edge1' },
        section: { title: 'Admission refusal rules', index: 2 },
      },
    ]);
    expect(response.issues.map((i) => i.code)).toEqual(['unknown-detail-node', 'unknown-detail-section']);
    const other = await documentResponse(catalog, 'chat', files);
    expect('error' in other ? null : other.diagramDetails).toEqual([]);
  });
});
