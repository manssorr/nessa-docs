// In-memory RepositoryFiles for tests. Paths are absolute POSIX paths.
// Supports directories, files, and symlinks (followed by `inspect`, refused by
// `readText`), and records every read so tests can prove what was never read.

import { posix } from 'node:path';
import { isInside } from '../path-containment.js';
import type { DirectoryEntry, PathInspection, ReadOutcome, RepositoryFiles } from '../files.js';

type Node =
  | { readonly kind: 'file'; readonly text: string }
  | { readonly kind: 'directory' }
  | { readonly kind: 'symlink'; readonly target: string };

export interface MemoryFiles extends RepositoryFiles {
  readonly reads: string[];
  readonly listings: string[];
}

/** `tree` maps absolute paths to file text, `{ symlink: target }`, or `{ dir: true }`. */
export function memoryFiles(
  tree: Record<string, string | { symlink: string } | { dir: true }>,
): MemoryFiles {
  const nodes = new Map<string, Node>();
  const ensureDirs = (path: string) => {
    let current = posix.dirname(path);
    while (current !== '/' && !nodes.has(current)) {
      nodes.set(current, { kind: 'directory' });
      current = posix.dirname(current);
    }
    nodes.set('/', { kind: 'directory' });
  };
  for (const [path, value] of Object.entries(tree)) {
    ensureDirs(path);
    if (typeof value === 'string') nodes.set(path, { kind: 'file', text: value });
    else if ('symlink' in value) nodes.set(path, { kind: 'symlink', target: value.symlink });
    else nodes.set(path, { kind: 'directory' });
  }

  // Resolve every component, following symlinks, like realpath(3).
  const resolve = (path: string, depth = 0): string | null => {
    if (depth > 32) return null;
    const parts = posix.normalize(path).split('/').filter(Boolean);
    let current = '/';
    for (const part of parts) {
      const next = posix.join(current, part);
      const node = nodes.get(next);
      if (!node) return null;
      if (node.kind === 'symlink') {
        const target = posix.resolve(current, node.target);
        const real = resolve(target, depth + 1);
        if (real === null) return null;
        current = real;
      } else {
        current = next;
      }
    }
    return current;
  };

  const reads: string[] = [];
  const listings: string[] = [];
  return {
    reads,
    listings,
    async list(directory) {
      listings.push(directory);
      const node = nodes.get(directory);
      if (!node || node.kind !== 'directory') throw new Error(`ENOTDIR ${directory}`);
      const entries: DirectoryEntry[] = [];
      for (const [path, child] of nodes) {
        if (path !== '/' && posix.dirname(path) === directory) {
          entries.push({ name: posix.basename(path), kind: child.kind });
        }
      }
      return entries;
    },
    async inspect(path): Promise<PathInspection> {
      const real = resolve(path);
      if (real === null) return { kind: 'missing' };
      const node = nodes.get(real);
      if (!node) return { kind: 'missing' };
      return { kind: node.kind === 'file' ? 'file' : 'directory', realPath: real };
    },
    async readText(path, maxBytes, boundary): Promise<ReadOutcome> {
      if (!isInside(path, boundary)) return { kind: 'unreadable', reason: 'outside docs/state' };
      reads.push(path);
      const node = nodes.get(path);
      if (!node) return { kind: 'unreadable', reason: 'ENOENT' };
      if (node.kind === 'symlink') return { kind: 'unreadable', reason: 'is a symlink' };
      if (node.kind !== 'file') return { kind: 'unreadable', reason: 'not a regular file' };
      const size = Buffer.byteLength(node.text, 'utf8');
      if (size > maxBytes) return { kind: 'too-large', size };
      return { kind: 'text', text: node.text };
    },
  };
}
