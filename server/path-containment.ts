// Canonical POSIX path containment shared by catalog, references and file reads.
export function isInside(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith('/') ? root : `${root}/`);
}
