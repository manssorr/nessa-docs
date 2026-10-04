import { spawn } from 'node:child_process';
import type { FolderPickOutcome } from '../../shared/projects.js';
import type { FolderDialog } from './folder-picker.js';

export const FOLDER_DIALOG_TIMEOUT = 120_000;
export interface DialogProcess {
  readonly completed: Promise<{ readonly code: number | null; readonly output: string }>;
  terminate(): void;
}
export interface DialogProcesses { start(): DialogProcess; }

/** Machine output protocol; the AppleScript catches cancellation by its typed number. */
export function dialogOutput(code: number | null, output: string): FolderPickOutcome {
  if (code !== 0) return { kind: 'failed', message: 'The folder chooser could not open. Try again or paste the path.' };
  const value = output.endsWith('\n') ? output.slice(0, -1) : output;
  if (value === 'cancelled') return { kind: 'cancelled' };
  if (value.startsWith('selected\n/')) return { kind: 'selected', path: value.slice('selected\n'.length) };
  return { kind: 'failed', message: 'The folder chooser returned no folder. Try again or paste the path.' };
}

/** Owns the child across cancellation and timeout; completion is awaited before releasing the single-flight owner. */
export function macFolderDialog(processes: DialogProcesses): FolderDialog {
  return {
    async choose(signal) {
      if (signal.aborted) return { kind: 'cancelled' };
      const child = processes.start();
      let interrupted: 'cancelled' | 'timed-out' | null = null;
      const abort = () => { if (interrupted === null) { interrupted = 'cancelled'; child.terminate(); } };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      const timeout = setTimeout(() => { if (interrupted === null) { interrupted = 'timed-out'; child.terminate(); } }, FOLDER_DIALOG_TIMEOUT);
      try {
        const answer = await child.completed;
        if (interrupted === 'cancelled') return { kind: 'cancelled' };
        if (interrupted === 'timed-out') return { kind: 'timed-out', message: 'The folder chooser timed out. Try again or paste the path.' };
        return dialogOutput(answer.code, answer.output);
      } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
    },
  };
}

const SCRIPT = 'try\nset chosenFolder to choose folder with prompt "Choose a project folder for Nessa Docs"\nreturn "selected" & linefeed & POSIX path of chosenFolder\non error number -128\nreturn "cancelled"\nend try';

export function nodeMacDialogProcesses(): DialogProcesses {
  return {
    start() {
      const child = spawn('/usr/bin/osascript', ['-e', SCRIPT], { shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
      const chunks: Buffer[] = []; let size = 0;
      child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 64 * 1024) child.kill('SIGKILL'); else chunks.push(chunk); });
      const completed = new Promise<{ code: number | null; output: string }>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code) => resolve({ code, output: Buffer.concat(chunks).toString('utf8') }));
      });
      return { completed, terminate: () => { child.kill('SIGKILL'); } };
    },
  };
}
