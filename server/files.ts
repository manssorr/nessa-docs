// The filesystem seam. The loader and the link resolver see the repository
// only through this port; composition injects the Node implementation and
// tests inject `server/testing/memory-files.ts`. There is no write method.

import { constants, type Stats } from 'node:fs';
import { isInside } from './path-containment.js';
import { open, readdir, realpath, stat } from 'node:fs/promises';

export type EntryKind = 'file' | 'directory' | 'symlink' | 'other';

export interface DirectoryEntry {
  readonly name: string;
  /** The entry itself, not what a symlink points at. */
  readonly kind: EntryKind;
}

export type PathInspection =
  | { readonly kind: 'missing' }
  | { readonly kind: 'file' | 'directory' | 'other'; readonly realPath: string };

export type ReadOutcome =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'too-large'; readonly size: number }
  | { readonly kind: 'unreadable'; readonly reason: string };

export interface RepositoryFiles {
  list(directory: string): Promise<readonly DirectoryEntry[]>;
  /** Follows symlinks and reports the canonical path, or `missing`. */
  inspect(path: string): Promise<PathInspection>;
  /** Refuses observed path/identity changes outside the accepted canonical boundary; not an atomic snapshot. */
  readText(path: string, maxBytes: number, boundary: string): Promise<ReadOutcome>;
}

export interface ReadFileHandle {
  stat(): Promise<Stats>;
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ readonly bytesRead: number }>;
  close(): Promise<void>;
}
export interface NodeReadOperations {
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<Stats>;
  open(path: string, flags: number): Promise<ReadFileHandle>;
}
export const nodeReadOperations: NodeReadOperations = { realpath, stat, open };
const sameFile = (left: Stats, right: Stats) => left.dev === right.dev && left.ino === right.ino;

export function nodeRepositoryFiles(reads: NodeReadOperations = nodeReadOperations): RepositoryFiles {
  return {
    async list(directory) {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        kind: entry.isSymbolicLink()
          ? 'symlink'
          : entry.isDirectory()
            ? 'directory'
            : entry.isFile()
              ? 'file'
              : 'other',
      }));
    },
    async inspect(path) {
      try {
        const real = await realpath(path);
        const info = await stat(real);
        return {
          kind: info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'other',
          realPath: real,
        };
      } catch {
        return { kind: 'missing' };
      }
    },
    async readText(path, maxBytes, boundary) {
      let handle: ReadFileHandle | undefined;
      try {
        const before = await reads.realpath(path);
        if (!isInside(before, boundary)) return { kind: 'unreadable', reason: 'outside docs/state' };
        const expected = await reads.stat(before);
        if (!expected.isFile()) return { kind: 'unreadable', reason: 'not a regular file' };
        if (expected.size > maxBytes) return { kind: 'too-large', size: expected.size };
        // Open the original name: canonicalizing it would lose final-symlink refusal.
        handle = await reads.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        const opened = await handle.stat();
        if (!sameFile(expected, opened)) return { kind: 'unreadable', reason: 'file identity changed before reading' };
        if (!opened.isFile()) return { kind: 'unreadable', reason: 'not a regular file' };
        if (opened.size > maxBytes) return { kind: 'too-large', size: opened.size };
        const buffer = Buffer.alloc(opened.size);
        const { bytesRead } = await handle.read(buffer, 0, opened.size, 0);
        const after = await reads.realpath(path);
        if (after !== before || !isInside(after, boundary)) return { kind: 'unreadable', reason: 'path changed or escaped docs/state' };
        const current = await reads.stat(after);
        if (!sameFile(current, opened)) return { kind: 'unreadable', reason: 'file identity changed after reading' };
        if (current.size > maxBytes) return { kind: 'too-large', size: current.size };
        return { kind: 'text', text: buffer.subarray(0, bytesRead).toString('utf8') };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? 'unknown error';
        return { kind: 'unreadable', reason: code === 'ELOOP' ? 'is a symlink' : code };
      } finally {
        await handle?.close();
      }
    },
  };
}
