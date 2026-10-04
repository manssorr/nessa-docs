// Startup interpretation is pure; composition passes process.env.
import { projectPath } from '../shared/projects.js';
export const DEFAULT_PORT = 4311;
export const HOST = '127.0.0.1';
export interface ServerConfig { readonly project: string | null; readonly port: number; }
export type ConfigOutcome = { readonly kind: 'ok'; readonly config: ServerConfig } | { readonly kind: 'invalid'; readonly message: string };
export function readConfig(env: Readonly<Record<string, string | undefined>>): ConfigOutcome {
  const raw = env.NESSA_DOCS_PROJECT;
  const project = raw ? projectPath(raw) : null;
  if (raw && project === null) return { kind: 'invalid', message: 'NESSA_DOCS_PROJECT must be an absolute local project path.' };
  const rawPort = env.PORT?.trim() || String(DEFAULT_PORT);
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) return { kind: 'invalid', message: `PORT must be an integer between 1 and 65535, got "${rawPort}"` };
  return { kind: 'ok', config: { project, port } };
}
