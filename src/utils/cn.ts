/**
 * Tiny, dependency-free className combiner (clsx-style).
 *
 * Kept local instead of pulling in `clsx`/`tailwind-merge` to keep the
 * dependency surface minimal. It does not de-duplicate conflicting Tailwind
 * utilities — author classes so the intended one wins by order.
 */
export type ClassValue = string | number | null | false | undefined | ClassValue[];

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      const nested = cn(...value);
      if (nested) out.push(nested);
    } else {
      out.push(String(value));
    }
  }
  return out.join(' ');
}
