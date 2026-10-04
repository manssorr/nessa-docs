import type { FolderPickOutcome, FolderPickerStatus } from '../../shared/projects.js';

/** The outside dialog port. Its implementation owns its process and abort/timeout cleanup. */
export interface FolderDialog {
  choose(signal: AbortSignal): Promise<FolderPickOutcome>;
}

/** One chooser per server; F2, F5–F7 in verification/CHECKLIST.md. */
export function createFolderPicker(dialog: FolderDialog | null, shutdown?: AbortSignal) {
  let pending = false;
  const status: FolderPickerStatus = dialog === null
    ? { kind: 'unsupported', message: 'Folder browsing is available on macOS. Paste the folder path here on this computer.' }
    : { kind: 'available' };
  return {
    status,
    async choose(signal: AbortSignal): Promise<FolderPickOutcome> {
      const activeSignal = shutdown ? AbortSignal.any([signal, shutdown]) : signal;
      if (dialog === null) return { kind: 'unsupported', message: status.kind === 'unsupported' ? status.message : '' };
      if (activeSignal.aborted) return { kind: 'cancelled' };
      if (pending) return { kind: 'busy', message: 'A folder chooser is already open. Finish or cancel it, then try again.' };
      pending = true;
      try { return await dialog.choose(activeSignal); }
      catch { return { kind: 'failed', message: 'The folder chooser could not open. Try again or paste the path.' }; }
      finally { pending = false; }
    },
  };
}
export type FolderPicker = ReturnType<typeof createFolderPicker>;
