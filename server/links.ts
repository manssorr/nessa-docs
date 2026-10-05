// Decides where a Markdown link or a `sources` entry points. Links into
// docs/state become document routes; other repository paths become evidence
// (only their existence is checked, never their content); paths that leave
// the repository are outside-repo references and are never touched on disk.

import { posix } from 'node:path';
import type { LinkTarget } from '../shared/api.js';
import { type Catalog, STATE_DIRECTORY } from './catalog.js';
import { isInside } from './path-containment.js';
import type { RepositoryFiles } from './files.js';

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/** Where a reference is read from: a Markdown file, or the repository root for `sources`. */
export type ReferenceBase = { readonly kind: 'file'; readonly file: string } | { readonly kind: 'repository' };

type Classified = LinkTarget | { readonly kind: 'check-repo-file'; readonly path: string; readonly fragment: string | null };

export function classifyReference(raw: string, base: ReferenceBase, catalog: Catalog): Classified {
  const href = raw.trim();
  if (href === '') return { kind: 'unresolved', reason: 'empty link' };
  if (href.startsWith('#')) {
    const fragment = decode(href.slice(1));
    return fragment === null ? { kind: 'unresolved', reason: 'malformed anchor' } : { kind: 'anchor', fragment };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return { kind: 'unresolved', reason: 'malformed URL' };
    }
    if (!ALLOWED_SCHEMES.has(url.protocol)) {
      return { kind: 'unresolved', reason: `${url.protocol} links are not followed` };
    }
    return { kind: 'external', url: url.href };
  }
  if (href.startsWith('/') || href.startsWith('\\')) {
    return { kind: 'unresolved', reason: 'absolute paths are not resolved; link relative to the file' };
  }

  const hashAt = href.indexOf('#');
  const pathPart = (hashAt === -1 ? href : href.slice(0, hashAt)).split('?')[0] ?? '';
  const fragment = hashAt === -1 ? null : decode(href.slice(hashAt + 1));
  const decodedPath = decode(pathPart);
  if (decodedPath === null || (hashAt !== -1 && fragment === null)) {
    return { kind: 'unresolved', reason: 'malformed percent-encoding' };
  }
  if (/[\\\0]/.test(decodedPath)) return { kind: 'unresolved', reason: 'backslashes and NUL are not allowed in paths' };

  const from = base.kind === 'file' ? posix.dirname(base.file) : '.';
  const joined = posix.normalize(posix.join(from, decodedPath === '' ? '.' : decodedPath));
  const path = joined.endsWith('/') && joined !== '/' ? joined.slice(0, -1) : joined;
  if (path === '..' || path.startsWith('../')) return { kind: 'outside-repo', path, fragment };

  if (path === STATE_DIRECTORY || path.startsWith(`${STATE_DIRECTORY}/`)) {
    const isMarkdown = path.toLowerCase().endsWith('.md');
    const candidates = isMarkdown ? [path] : [`${path}/README.md`];
    for (const file of candidates) {
      const id = catalog.documentByFile.get(file);
      if (id !== undefined) return { kind: 'document', id, fragment };
      const rejected = catalog.rejectedFiles.get(file);
      if (rejected !== undefined) {
        return { kind: 'unresolved', reason: `${file} was rejected: ${rejected[0]?.message ?? 'see Problems'}` };
      }
    }
    if (isMarkdown) return { kind: 'unresolved', reason: `no document at ${path}` };
  }
  if (path === '.' && base.kind === 'file' && decodedPath === '') {
    // "?query" or "#" on its own: the current document.
    const id = catalog.documentByFile.get(base.file);
    if (id !== undefined) return { kind: 'document', id, fragment };
  }
  return { kind: 'check-repo-file', path, fragment };
}

/** Resolves a reference, checking repository evidence for existence inside the canonical root. */
export async function resolveReference(
  raw: string,
  base: ReferenceBase,
  catalog: Catalog,
  files: RepositoryFiles,
): Promise<LinkTarget> {
  const classified = classifyReference(raw, base, catalog);
  if (classified.kind !== 'check-repo-file') return classified;
  const root = catalog.repoRoot;
  if (root === null) return { kind: 'repo-file', path: classified.path, fragment: classified.fragment, exists: false };
  const inspection = await files.inspect(posix.join(root, classified.path));
  if (inspection.kind !== 'missing' && !isInside(inspection.realPath, root)) {
    return { kind: 'unresolved', reason: `${classified.path} resolves outside the repository through a symlink` };
  }
  return {
    kind: 'repo-file',
    path: classified.path,
    fragment: classified.fragment,
    exists: inspection.kind !== 'missing',
  };
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
