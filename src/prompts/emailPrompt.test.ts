import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/types';
import type { ExtractedCustomer, Settings } from '@/types';

import { buildEmailMessages } from './emailPrompt';

const customer: ExtractedCustomer = {
  displayName: 'Acme Robotics',
  recordType: 'Account',
  extractedAt: new Date().toISOString(),
  fields: [
    { key: 'accountName', label: 'Account Name', value: 'Acme Robotics', approved: true },
    { key: 'balance', label: 'Outstanding Balance', value: '$18,500', approved: false },
  ],
};

const withTemplate = (subject: string, body: string): Settings => ({
  ...DEFAULT_SETTINGS,
  email: { ...DEFAULT_SETTINGS.email, template: { subject, body } },
});

describe('buildEmailMessages', () => {
  it('includes the user template subject and body verbatim', () => {
    const settings = withTemplate('Renewal for {{accountName}}', 'Hi {{primaryContact}},');
    const [, user] = buildEmailMessages(settings, customer);
    expect(user.content).toContain('Renewal for {{accountName}}');
    expect(user.content).toContain('Hi {{primaryContact}},');
  });

  it('lists only approved customer fields', () => {
    const settings = withTemplate('S', 'B');
    const [, user] = buildEmailMessages(settings, customer);
    expect(user.content).toContain('Account Name: Acme Robotics');
    expect(user.content).not.toContain('Outstanding Balance');
    expect(user.content).not.toContain('$18,500');
  });

  it('instructs the model not to invent data when no fields are approved', () => {
    const none: ExtractedCustomer = {
      ...customer,
      fields: customer.fields.map((f) => ({ ...f, approved: false })),
    };
    const [, user] = buildEmailMessages(withTemplate('S', 'B'), none);
    expect(user.content).toContain('do not invent any customer facts');
  });

  it('works without a customer session', () => {
    const [, user] = buildEmailMessages(withTemplate('S', 'B'), null);
    expect(user.content).toContain('do not invent any customer facts');
  });

  it('appends optional additional instructions when provided', () => {
    const [, user] = buildEmailMessages(
      withTemplate('S', 'B'),
      customer,
      'Keep it under 80 words.',
    );
    expect(user.content).toContain('ADDITIONAL INSTRUCTIONS:');
    expect(user.content).toContain('Keep it under 80 words.');
  });

  it('omits the additional-instructions block for empty instructions', () => {
    const [, user] = buildEmailMessages(withTemplate('S', 'B'), customer, '   ');
    expect(user.content).not.toContain('ADDITIONAL INSTRUCTIONS:');
  });

  it('requests a strict JSON response shape', () => {
    const [, user] = buildEmailMessages(withTemplate('S', 'B'), customer);
    expect(user.content).toContain('"to"');
    expect(user.content).toContain('"subject"');
    expect(user.content).toContain('"body"');
  });

  it('opens with a system prompt gated to approved fields', () => {
    const [system] = buildEmailMessages(withTemplate('S', 'B'), customer);
    expect(system.role).toBe('system');
    expect(system.content).toContain('Account Name: Acme Robotics');
    expect(system.content).not.toContain('$18,500');
  });
});
