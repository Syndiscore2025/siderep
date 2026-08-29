import { describe, expect, it } from 'vitest';

import { parseSalesforceReport } from './salesforceReportParser';

/** Builds a Document from an HTML string using the jsdom-provided DOMParser. */
function doc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const TABLE_FIXTURE = `
  <h1 class="slds-page-header__title">Active Accounts</h1>
  <table role="grid">
    <thead>
      <tr><th>Account Name</th><th>Email</th><th>Status</th></tr>
    </thead>
    <tbody>
      <tr><td>Acme Robotics</td><td>ap@acme.example.com</td><td>Active</td></tr>
      <tr><td>Vega Foods</td><td>billing@vega.example.com</td><td>Charge Off</td></tr>
    </tbody>
  </table>
`;

describe('parseSalesforceReport — table grid', () => {
  it('reads headers, rows, and the report title', () => {
    const report = parseSalesforceReport(
      doc(TABLE_FIXTURE),
      'https://x.lightning.force.com/report',
    );
    expect(report).not.toBeNull();
    expect(report?.title).toBe('Active Accounts');
    expect(report?.columns).toEqual(['Account Name', 'Email', 'Status']);
    expect(report?.rows).toHaveLength(2);
    expect(report?.sourceUrl).toBe('https://x.lightning.force.com/report');
  });

  it('maps the Status, Email, and Name columns onto each row', () => {
    const report = parseSalesforceReport(doc(TABLE_FIXTURE));
    const [first, second] = report!.rows;
    expect(first.name).toBe('Acme Robotics');
    expect(first.email).toBe('ap@acme.example.com');
    expect(first.status).toBe('Active');
    expect(second.status).toBe('Charge Off');
  });

  it('prefers a mailto link address over its display text', () => {
    const report = parseSalesforceReport(
      doc(`
        <table role="grid">
          <thead><tr><th>Name</th><th>Email</th></tr></thead>
          <tbody>
            <tr><td>Acme</td><td><a href="mailto:real@acme.com">Email Acme</a></td></tr>
          </tbody>
        </table>
      `),
    );
    expect(report?.rows[0].email).toBe('real@acme.com');
  });

  it('scans all cells for an email when there is no Email column', () => {
    const report = parseSalesforceReport(
      doc(`
        <table role="grid">
          <thead><tr><th>Name</th><th>Contact</th></tr></thead>
          <tbody><tr><td>Acme</td><td>reach me at hi@acme.com</td></tr></tbody>
        </table>
      `),
    );
    expect(report?.rows[0].email).toBe('hi@acme.com');
  });

  it('returns null when no grid is present', () => {
    expect(parseSalesforceReport(doc('<div>no report here</div>'))).toBeNull();
  });
});
