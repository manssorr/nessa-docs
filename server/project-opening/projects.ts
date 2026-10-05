import type { Catalog } from '../catalog.js';
import { projectPath, type ProjectOutcome } from '../../shared/projects.js';

export interface ProjectDependencies {
  readonly loadCatalog: (root: string) => Promise<Catalog>;
  readonly mintId: () => string;
}

export type ProjectRead =
  | { readonly kind: 'selected'; readonly root: string }
  | { readonly kind: 'welcome' }
  | { readonly kind: 'unavailable' };

/** Bounded read contexts; rows P2, P3, P7, P9, P10 in verification/CHECKLIST.md. */
export function createProjects(dependencies: ProjectDependencies, capacity = 128) {
  const roots = new Map<string, { readonly root: string; readonly title: string }>();
  let defaultId: string | null = null;
  let startupFailure: ProjectOutcome | null = null;

  const unavailable = (): ProjectOutcome => ({ kind: 'refused', error: 'project-unavailable', message: 'This project is no longer open. The server may have restarted. Open its folder again.', issues: [] });

  const open = async (value: unknown): Promise<ProjectOutcome> => {
    const path = projectPath(value);
    if (path === null) return { kind: 'refused', error: 'invalid-path', message: 'Enter the absolute path to your local project folder.', issues: [] };
    let catalog: Catalog;
    try { catalog = await dependencies.loadCatalog(path); }
    catch { return { kind: 'refused', error: 'project-read-failed', message: 'The project could not be read. Check folder permissions and try again.', issues: [] }; }
    if (catalog.repoRoot === null || catalog.rootId === null) return {
      kind: 'refused', error: 'invalid-project', message: 'No system document was accepted. Generate docs/state with $nessa-docs in this project, then try again.', issues: catalog.issues,
    };
    const title = catalog.documents.get(catalog.rootId)?.summary.title ?? catalog.rootId;
    // Validation awaits above; duplicate/capacity decisions are synchronous after it (P7).
    for (const [id, root] of roots) if (root.root === catalog.repoRoot) return { kind: 'opened', project: { id, title } };
    if (roots.size >= capacity) return { kind: 'refused', error: 'project-capacity', message: 'The server has reached its open-project limit. Restart it to open more folders.', issues: [] };
    const id = dependencies.mintId();
    if (roots.has(id)) return { kind: 'refused', error: 'project-id-conflict', message: 'A new project identity could not be assigned. Try opening the folder again.', issues: [] };
    roots.set(id, { root: catalog.repoRoot, title });
    return { kind: 'opened', project: { id, title } };
  };

  const read = (id: string | null): ProjectRead => {
    const selected = id ?? defaultId;
    if (selected === null) return { kind: 'welcome' };
    const root = roots.get(selected);
    return root === undefined ? { kind: 'unavailable' } : { kind: 'selected', root: root.root };
  };

  return {
    open, read,
    async start(path: string | null) {
      if (path === null) return;
      const result = await open(path);
      if (result.kind === 'opened') defaultId = result.project.id;
      else startupFailure = result;
    },
    async current(id: string | null): Promise<ProjectOutcome> {
      const selected = id ?? defaultId;
      if (selected === null) return startupFailure ?? { kind: 'welcome' };
      const selection = read(selected);
      if (selection.kind !== 'selected') return unavailable();
      const project = roots.get(selected)!;
      return { kind: 'opened', project: { id: selected, title: project.title } };
    },
  };
}

export type Projects = ReturnType<typeof createProjects>;
