import type { ProjectOutcome } from '../../shared/projects';
import type { ProjectSource } from './read-port';

/** P14: correlate an explicit URL selection before projecting a reader/title. */
export async function loadProjectSelection(source: Pick<ProjectSource, 'current'>, id: string | null, signal?: AbortSignal): Promise<ProjectOutcome> {
  const outcome = await source.current(id, signal);
  signal?.throwIfAborted();
  if (id !== null && outcome.kind === 'opened' && outcome.project.id !== id) return { kind: 'refused', error: 'project-unavailable', message: 'The server answered for a different project. Open the folder again.', issues: [] };
  return outcome;
}
