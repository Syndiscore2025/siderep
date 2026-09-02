/**
 * Prepends the configured subject prefix (e.g. "1West - ") to a generated
 * subject exactly once, so every Renewal email subject follows the rep's rule
 * regardless of what the model returned.
 */
export function applySubjectPrefix(prefix: string, subject: string): string {
  const cleanSubject = subject.trim().replace(/^subject\s*:\s*/i, '');
  const cleanPrefix = prefix.trim();
  if (!cleanPrefix) return cleanSubject;
  if (cleanSubject.toLowerCase().startsWith(cleanPrefix.toLowerCase())) {
    const remainder = cleanSubject.slice(cleanPrefix.length).trimStart();
    return remainder ? `${cleanPrefix} ${remainder}` : cleanPrefix;
  }
  return cleanSubject ? `${cleanPrefix} ${cleanSubject}` : cleanPrefix;
}
