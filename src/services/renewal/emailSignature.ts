import type { Settings } from '@/types';

/**
 * Resolves the signature block for Renewal emails: the custom signature from
 * Settings → Prompts when present, otherwise the Rep Profile contact lines.
 */
export function buildEmailSignature(settings: Settings): string {
  const custom = settings.prompts.signature.trim();
  if (custom) return custom;
  const { name, company, phone, email } = settings.repProfile;
  const lines = [name, company, phone, email].map((line) => line.trim()).filter(Boolean);
  return lines.length ? ['Best regards,', ...lines].join('\n') : '';
}

/**
 * Appends the signature to a generated email body exactly once. The model is
 * told not to sign off, so this keeps the rep's contact block deterministic.
 */
export function applyEmailSignature(body: string, signature: string): string {
  const cleanBody = body.trimEnd();
  const cleanSignature = signature.trim();
  if (!cleanSignature) return cleanBody;
  if (cleanBody.endsWith(cleanSignature)) return cleanBody;
  return cleanBody ? `${cleanBody}\n\n${cleanSignature}` : cleanSignature;
}
