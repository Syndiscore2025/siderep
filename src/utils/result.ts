/**
 * Lightweight `Result` type for explicit, exception-free error handling at
 * service boundaries. Services return `Result` so callers must consciously
 * handle failure rather than relying on thrown errors.
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Normalizes an unknown thrown value into an `Error`. */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : 'Unknown error');
}
