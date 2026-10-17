import { createContext, useContext } from 'react';

export function projectDocsName(title?: string | null): string {
  const name = title?.trim();
  return name ? `${name} Docs` : 'Nessa Docs';
}
export const DocsNameContext = createContext('Nessa Docs');
export const useDocsName = () => useContext(DocsNameContext);
