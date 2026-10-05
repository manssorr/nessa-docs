import { expect, it, vi } from 'vitest';
import { loadProjectSelection } from './selection';
import type { ProjectOutcome } from '../../shared/projects';

it('P14 rejects an adapter contradiction but permits correlated selection and startup discovery', async () => {
  const opened: ProjectOutcome = { kind: 'opened', project: { id: 'B', title: 'Other folder' } };
  const source = { current: vi.fn(async () => opened) }; const signal = new AbortController().signal;
  expect(await loadProjectSelection(source, 'A', signal)).toMatchObject({ kind: 'refused', error: 'project-unavailable' });
  expect(source.current).toHaveBeenCalledWith('A', signal);
  expect(await loadProjectSelection(source, 'B', signal)).toEqual(opened);
  expect(await loadProjectSelection(source, null, signal)).toEqual(opened);
});
it('P14 discards a late adapter reply even when the custom adapter ignores cancellation', async () => {
  let finish!: (outcome: ProjectOutcome) => void;
  const source = { current: () => new Promise<ProjectOutcome>((resolve) => { finish = resolve; }) };
  const controller = new AbortController(); const pending = loadProjectSelection(source, 'A', controller.signal);
  controller.abort(); finish({ kind: 'opened', project: { id: 'A', title: 'Abandoned folder' } });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
