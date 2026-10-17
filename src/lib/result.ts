export type ErrorCode = 'validation' | 'forbidden' | 'not_found' | 'conflict' | 'unknown';
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };
export const fail = (code: ErrorCode, message: string) => ({ ok: false as const, error: { code, message } });
