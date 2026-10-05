import type { CatalogIssue } from './api.js';

export interface Project {
  readonly id: string;
  readonly title: string;
}

export type ProjectOutcome =
  | { readonly kind: 'opened'; readonly project: Project }
  | { readonly kind: 'welcome' }
  | { readonly kind: 'refused'; readonly error: 'invalid-path' | 'invalid-project' | 'project-unavailable' | 'project-capacity' | 'project-read-failed' | 'project-id-conflict'; readonly message: string; readonly issues: readonly CatalogIssue[] };

/** The path syntax owner, shared by startup configuration and project opening. */
export function projectPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value;
  // Local POSIX paths (macOS/Linux); backslashes are filename characters.
  if (!path || path.includes('\0') || !path.startsWith('/')) return null;
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path;
}

export type FolderPickerStatus =
  | { readonly kind: 'available' }
  | { readonly kind: 'unsupported'; readonly message: string };

export type FolderPickOutcome =
  | { readonly kind: 'selected'; readonly path: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'busy' | 'failed' | 'timed-out' | 'unsupported'; readonly message: string };
