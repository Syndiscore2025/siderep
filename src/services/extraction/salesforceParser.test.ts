import { describe, expect, it } from 'vitest';

import { parseSalesforceRecord } from './salesforceParser';

/** Builds a Document from an HTML string using the jsdom-provided DOMParser. */
function doc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const LIGHTNING_FIXTURE = `
  <records-highlights2><lightning-formatted-text>Acme Robotics</lightning-formatted-text></records-highlights2>
  <records-entity-label>Account</records-entity-label>
  <records-record-layout-item>
    <span class="test-id__field-label">Account Name</span>
    <span class="test-id__field-value">Acme Robotics</span>
  </records-record-layout-item>
  <records-record-layout-item>
    <span class="test-id__field-label">Phone</span>
    <span class="test-id__field-value">(555) 123-4567</span>
  </records-record-layout-item>
  <records-record-layout-item>
    <span class="test-id__field-label">Outstanding Balance</span>
    <span class="test-id__field-value">$18,500</span>
  </records-record-layout-item>
`;

describe('parseSalesforceRecord — Lightning layout', () => {
  it('extracts label/value pairs from record-layout items', () => {
    const customer = parseSalesforceRecord(doc(LIGHTNING_FIXTURE), 'https://x.salesforce.com/001');
    expect(customer).not.toBeNull();
    expect(customer?.fields).toHaveLength(3);
    const phone = customer?.fields.find((f) => f.label === 'Phone');
    expect(phone?.value).toBe('(555) 123-4567');
    expect(phone?.source).toBe('lightning');
  });

  it('reads display name, record type, and source url', () => {
    const customer = parseSalesforceRecord(doc(LIGHTNING_FIXTURE), 'https://x.salesforce.com/001');
    expect(customer?.displayName).toBe('Acme Robotics');
    expect(customer?.recordType).toBe('Account');
    expect(customer?.sourceUrl).toBe('https://x.salesforce.com/001');
  });

  it('defaults sensitive fields to NOT approved and safe fields to approved', () => {
    const customer = parseSalesforceRecord(doc(LIGHTNING_FIXTURE));
    const balance = customer?.fields.find((f) => f.label === 'Outstanding Balance');
    const name = customer?.fields.find((f) => f.label === 'Account Name');
    expect(balance?.approved).toBe(false);
    expect(name?.approved).toBe(true);
  });

  it('normalizes whitespace and derives stable slug keys', () => {
    const customer = parseSalesforceRecord(
      doc(`
        <records-record-layout-item>
          <span class="test-id__field-label">  Billing   City  </span>
          <span class="test-id__field-value">  San   Francisco  </span>
        </records-record-layout-item>
      `),
    );
    expect(customer?.fields[0].label).toBe('Billing City');
    expect(customer?.fields[0].value).toBe('San Francisco');
    expect(customer?.fields[0].key).toBe('billing-city');
  });

  it('deduplicates fields that share a key', () => {
    const customer = parseSalesforceRecord(
      doc(`
        <records-record-layout-item>
          <span class="test-id__field-label">Phone</span>
          <span class="test-id__field-value">111</span>
        </records-record-layout-item>
        <records-record-layout-item>
          <span class="test-id__field-label">Phone</span>
          <span class="test-id__field-value">222</span>
        </records-record-layout-item>
      `),
    );
    expect(customer?.fields).toHaveLength(1);
    expect(customer?.fields[0].value).toBe('111');
  });
});

describe('parseSalesforceRecord — fallbacks', () => {
  it('parses generic definition lists when no Lightning items exist', () => {
    const customer = parseSalesforceRecord(
      doc(`<dl><dt>Email</dt><dd>a@b.com</dd><dt>Title</dt><dd>VP Sales</dd></dl>`),
    );
    expect(customer?.fields).toHaveLength(2);
    expect(customer?.fields.find((f) => f.label === 'Email')?.source).toBe('dl');
  });

  it('parses Classic .detailList tables as a last resort', () => {
    const customer = parseSalesforceRecord(
      doc(`
        <table class="detailList">
          <tr><td class="labelCol">Industry</td><td class="dataCol">Manufacturing</td></tr>
        </table>
      `),
    );
    expect(customer?.fields[0].label).toBe('Industry');
    expect(customer?.fields[0].source).toBe('classic');
  });

  it('prefers Lightning over fallbacks when both are present', () => {
    const customer = parseSalesforceRecord(
      doc(`
        ${LIGHTNING_FIXTURE}
        <dl><dt>ShouldNotAppear</dt><dd>x</dd></dl>
      `),
    );
    expect(customer?.fields.some((f) => f.label === 'ShouldNotAppear')).toBe(false);
  });
});

describe('parseSalesforceRecord — empty pages', () => {
  it('returns null when no recognizable fields are present', () => {
    expect(parseSalesforceRecord(doc('<div>nothing here</div>'))).toBeNull();
  });

  it('skips items missing a label or value', () => {
    const customer = parseSalesforceRecord(
      doc(`
        <records-record-layout-item>
          <span class="test-id__field-label">Only Label</span>
        </records-record-layout-item>
      `),
    );
    expect(customer).toBeNull();
  });
});
