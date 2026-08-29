import { describe, expect, it } from 'vitest';

import { SAMPLE_CUSTOMER, createExtractionService } from './customerExtractionService';

describe('createExtractionService sample fallback', () => {
  it('retains sample fallback for existing no-argument callers', async () => {
    const result = await createExtractionService().extractActiveCustomer();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.displayName).toBe(SAMPLE_CUSTOMER.displayName);
  });

  it('can disable sample data for Renewal extraction', async () => {
    const result = await createExtractionService({
      allowSampleFallback: false,
    }).extractActiveCustomer();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/not a Salesforce page/i);
  });
});
