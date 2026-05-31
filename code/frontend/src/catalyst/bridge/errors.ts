// ── Catalyst Bridge: Scoped Error Types ─────────────────────────────────────

export type ErrorScope =
  | 'startup'
  | 'graph'
  | 'material'
  | 'edge'
  | 'search'
  | 'screen'
  | 'compare'
  | 'export'
  | 'agent'
  | 'research'
  | 'settings'
  | 'sessions'
  | 'candidates';

export type CatalystError = {
  name: 'CatalystError';
  scope: ErrorScope;
  message: string;
  status?: number;
  raw?: unknown;
};

export function makeCatalystError(
  scope: ErrorScope,
  message: string,
  status?: number,
  raw?: unknown,
): CatalystError {
  return { name: 'CatalystError', scope, message, status, raw };
}

export function toCatalystError(scope: ErrorScope, err: unknown): CatalystError {
  if (err && typeof err === 'object' && (err as any).name === 'CatalystError') return err as CatalystError;
  if (err instanceof Error) {
    const status = (err as any).status as number | undefined;
    return makeCatalystError(scope, err.message, status, err);
  }
  return makeCatalystError(scope, String(err), undefined, err);
}

export function isNotFound(err: CatalystError): boolean {
  return err.status === 404;
}
