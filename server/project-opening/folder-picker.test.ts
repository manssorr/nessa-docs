import { expect, it, vi } from 'vitest';
import { createFolderPicker } from './folder-picker.js';
import { dialogOutput, macFolderDialog, type DialogProcess } from './macos-dialog.js';

function processFixture() {
  let finish!: (value: { code: number | null; output: string }) => void;
  const terminate = vi.fn();
  const child: DialogProcess = { completed: new Promise((resolve) => { finish = resolve; }), terminate };
  const start = vi.fn(() => child);
  return { child, start, terminate, finish };
}
it('unsupported chooser advertises capability and stays explicit without a dialog', async () => {
  const picker = createFolderPicker(null);
  expect(picker.status.kind).toBe('unsupported');
  expect(await picker.choose(new AbortController().signal)).toMatchObject({ kind: 'unsupported' });
});
it('one process-wide owner refuses another caller while the first dialog is pending', async () => {
  const f = processFixture(); const picker = createFolderPicker(macFolderDialog(f)); const signal = new AbortController().signal;
  const first = picker.choose(signal);
  expect(await picker.choose(signal)).toMatchObject({ kind: 'busy' }); expect(f.start).toHaveBeenCalledTimes(1);
  f.finish({ code: 0, output: 'selected\n/tmp/Project space café/\n' });
  expect(await first).toEqual({ kind: 'selected', path: '/tmp/Project space café/' });
  expect(await picker.choose(signal)).toEqual({ kind: 'selected', path: '/tmp/Project space café/' }); expect(f.start).toHaveBeenCalledTimes(2);
});
it('cancellation preserves no selected path and releases the chooser for retry', async () => {
  const choose = vi.fn().mockResolvedValue({ kind: 'cancelled' }); const picker = createFolderPicker({ choose });
  expect(await picker.choose(new AbortController().signal)).toEqual({ kind: 'cancelled' });
  expect(await picker.choose(new AbortController().signal)).toEqual({ kind: 'cancelled' }); expect(choose).toHaveBeenCalledTimes(2);
});
it('already aborted admission starts no OS process', async () => {
  const f = processFixture(); const picker = createFolderPicker(macFolderDialog(f)); const controller = new AbortController(); controller.abort();
  expect(await picker.choose(controller.signal)).toEqual({ kind: 'cancelled' }); expect(f.start).not.toHaveBeenCalled();
});
it('disconnect kills the owned child once and retains ownership until process completion', async () => {
  const f = processFixture(); const picker = createFolderPicker(macFolderDialog(f)); const controller = new AbortController();
  const first = picker.choose(controller.signal); controller.abort(); controller.abort(); expect(f.terminate).toHaveBeenCalledTimes(1);
  expect(await picker.choose(new AbortController().signal)).toMatchObject({ kind: 'busy' });
  f.finish({ code: 0, output: 'selected\n/tmp/late-selection/\n' });
  expect(await first).toEqual({ kind: 'cancelled' });
  expect(await picker.choose(new AbortController().signal)).toMatchObject({ kind: 'selected' });
});
it('two-minute timeout kills the child and settles only after cleanup, with retry available', async () => {
  vi.useFakeTimers();
  try {
    const f = processFixture(); const picker = createFolderPicker(macFolderDialog(f)); const first = picker.choose(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(119_999); expect(f.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(f.terminate).toHaveBeenCalledTimes(1);
    expect(await picker.choose(new AbortController().signal)).toMatchObject({ kind: 'busy' });
    f.finish({ code: null, output: '' }); expect(await first).toMatchObject({ kind: 'timed-out' });
    expect(await picker.choose(new AbortController().signal)).toMatchObject({ kind: 'failed' });
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
it('spawn and protocol faults are typed and release ownership for the next attempt', async () => {
  const start = vi.fn().mockImplementationOnce(() => { throw new Error('spawn unavailable'); }).mockReturnValue({ completed: Promise.resolve({ code: 1, output: '' }), terminate: vi.fn() });
  const picker = createFolderPicker(macFolderDialog({ start }));
  expect(await picker.choose(new AbortController().signal)).toMatchObject({ kind: 'failed' });
  expect(await picker.choose(new AbortController().signal)).toMatchObject({ kind: 'failed' }); expect(start).toHaveBeenCalledTimes(2);
});
it('the machine protocol preserves filename whitespace, Unicode, backslash and newline', () => {
  for (const path of ['/tmp/space café /', '/tmp/ ends in space ', '/tmp/backslash\\', '/tmp/newline\n']) expect(dialogOutput(0, `selected\n${path}\n`)).toEqual({ kind: 'selected', path });
  expect(dialogOutput(0, 'cancelled\n')).toEqual({ kind: 'cancelled' });
  for (const output of ['selected\nrelative\n', '', 'garbage', 'cancelled \n']) expect(dialogOutput(0, output)).toMatchObject({ kind: 'failed' });
  expect(dialogOutput(1, 'cancelled\n')).toMatchObject({ kind: 'failed' });
});

it('server shutdown aborts the child and refuses later chooser admission', async () => {
  const f = processFixture(); const shutdown = new AbortController(); const picker = createFolderPicker(macFolderDialog(f), shutdown.signal);
  const first = picker.choose(new AbortController().signal); shutdown.abort(); expect(f.terminate).toHaveBeenCalledTimes(1);
  f.finish({ code: null, output: '' }); expect(await first).toEqual({ kind: 'cancelled' });
  expect(await picker.choose(new AbortController().signal)).toEqual({ kind: 'cancelled' }); expect(f.start).toHaveBeenCalledTimes(1);
});
