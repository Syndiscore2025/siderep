import { describe, expect, it } from 'vitest';

import { parseGeneratedEmail } from './emailGenerationService';

describe('parseGeneratedEmail', () => {
  it('parses a clean JSON object', () => {
    const result = parseGeneratedEmail(
      '{"to":["dana@acme.com"],"subject":"Hello","body":"Hi Dana."}',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.to).toEqual(['dana@acme.com']);
      expect(result.value.subject).toBe('Hello');
      expect(result.value.body).toBe('Hi Dana.');
    }
  });

  it('tolerates code fences and surrounding prose', () => {
    const raw =
      'Sure! Here is your email:\n```json\n{"to":[],"subject":"S","body":"B"}\n```\nEnjoy.';
    const result = parseGeneratedEmail(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.body).toBe('B');
  });

  it('defaults missing subject/to but keeps a valid body', () => {
    const result = parseGeneratedEmail('{"body":"Just a body."}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.subject).toBe('');
      expect(result.value.to).toEqual([]);
      expect(result.value.body).toBe('Just a body.');
    }
  });

  it('filters non-string entries out of the recipient list', () => {
    const result = parseGeneratedEmail('{"to":["a@x.com",5,null,"b@x.com"],"body":"B"}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.to).toEqual(['a@x.com', 'b@x.com']);
  });

  it('errors when no JSON object is present', () => {
    expect(parseGeneratedEmail('no json here').ok).toBe(false);
  });

  it('errors on malformed JSON', () => {
    expect(parseGeneratedEmail('{"body": "B",}').ok).toBe(false);
  });

  it('errors when the body is empty or whitespace', () => {
    expect(parseGeneratedEmail('{"subject":"S","body":"   "}').ok).toBe(false);
  });
});
