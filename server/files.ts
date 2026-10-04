// The filesystem seam. The loader and the link resolver see the repository
// only through this port; composition injects the Node implementation and
// tests inject `server/testing/memory-files.ts`. There is no write method.

import { constants } from 'node:fs';
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
  /** Reads a regular file that is not a symlink, refusing anything over `maxBytes`. */
  readText(path: string, maxBytes: number): Promise<ReadOutcome>;
}

export function nodeRepositoryFiles(): RepositoryFiles {
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
    async readText(path, maxBytes) {
      let handle;
      try {
        // O_NOFOLLOW: a file swapped for a symlink after listing is refused here.
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        const info = await handle.stat();
        if (!info.isFile()) return { kind: 'unreadable', reason: 'not a regular file' };
        if (info.size > maxBytes) return { kind: 'too-large', size: info.size };
        const buffer = Buffer.alloc(info.size);
        const { bytesRead } = await handle.read(buffer, 0, info.size, 0);
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
