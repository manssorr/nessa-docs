import { createContext, useContext } from 'react';
import type { ProjectReads } from './read-port';

export const ProjectContext = createContext<ProjectReads | null>(null);
export function useProjectReads(): ProjectReads {
  const reads = useContext(ProjectContext);
  if (reads === null) throw new Error('Project reads must be supplied by composition.');
  return reads;
}
