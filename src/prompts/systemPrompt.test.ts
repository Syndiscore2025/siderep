import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/types';
import type { ExtractedCustomer } from '@/types';

import { buildSystemPrompt } from './systemPrompt';

const customer: ExtractedCustomer = {
  displayName: 'Acme Robotics',
  recordType: 'Account',
  extractedAt: new Date().toISOString(),
  fields: [
    { key: 'name', label: 'Account Name', value: 'Acme Robotics', approved: true },
    { key: 'secret', label: 'Outstanding Balance', value: '$18,500', approved: false },
  ],
};

describe('buildSystemPrompt', () => {
  it('includes only user-approved fields', () => {
    const prompt = buildSystemPrompt(DEFAULT_SETTINGS, customer);
    expect(prompt).toContain('Account Name: Acme Robotics');
    expect(prompt).not.toContain('Outstanding Balance');
    expect(prompt).not.toContain('$18,500');
  });

  it('omits the customer block entirely when no fields are approved', () => {
    const none: ExtractedCustomer = {
      ...customer,
      fields: customer.fields.map((f) => ({ ...f, approved: false })),
    };
    const prompt = buildSystemPrompt(DEFAULT_SETTINGS, none);
    expect(prompt).not.toContain('Customer context');
    expect(prompt).not.toContain('Acme Robotics');
  });

  it('works without a customer session', () => {
    const prompt = buildSystemPrompt(DEFAULT_SETTINGS, null);
    expect(prompt).toContain('SideRep');
    expect(prompt).not.toContain('Customer context');
  });

  it('honors tone, custom instructions, and signature settings', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      prompts: {
        defaultTone: 'casual',
        signature: 'Alex Rivera',
        customInstructions: 'Keep replies under 100 words.',
      },
    };
    const prompt = buildSystemPrompt(settings, null);
    expect(prompt).toContain('casual');
    expect(prompt).toContain('Alex Rivera');
    expect(prompt).toContain('Keep replies under 100 words.');
  });
});
