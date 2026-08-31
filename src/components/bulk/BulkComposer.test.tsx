import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extension: false,
  review: false,
  extract: vi.fn(),
  loadManualRecipients: vi.fn(),
  approveAndSend: vi.fn(),
}));

vi.mock('@/hooks/useBulkReport', () => ({
  useBulkReport: () => ({
    phase: mocks.review ? { kind: 'review' as const } : { kind: 'idle' as const },
    report: mocks.review
      ? { title: 'Manual', columns: [], rows: [], extractedAt: '2026-08-31T00:00:00.000Z' }
      : null,
    recipients: mocks.review
      ? [{ row: { index: 0, cells: {} }, email: 'person@example.com', selected: true }]
      : [],
    skipped: [],
    draft: mocks.review ? { to: [], subject: 'Subject', body: 'Body' } : null,
    excludedInput: '',
    selectedCount: mocks.review ? 1 : 0,
    extensionContext: mocks.extension,
    deliveryMode: mocks.extension ? 'gmail_api' : 'manual_composer',
    setExcludedInput: vi.fn(),
    extract: mocks.extract,
    loadManualRecipients: mocks.loadManualRecipients,
    refilter: vi.fn(),
    toggle: vi.fn(),
    selectAll: vi.fn(),
    generate: vi.fn(),
    approveAndSend: mocks.approveAndSend,
    reset: vi.fn(),
  }),
}));

import { BulkComposer } from './BulkComposer';

afterEach(() => {
  cleanup();
  mocks.extension = false;
  mocks.review = false;
  mocks.extract.mockReset();
  mocks.loadManualRecipients.mockReset();
  mocks.approveAndSend.mockReset();
});

describe('BulkComposer platform language', () => {
  it('offers pasted recipients on web without exposing extraction or send language', () => {
    const { container } = render(<BulkComposer />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Paste recipients' }), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load recipients' }));

    expect(mocks.loadManualRecipients).toHaveBeenCalledWith('person@example.com');
    expect(screen.queryByRole('button', { name: /extract report/i })).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/\b(send|sent|sending)\b/i);
  });

  it('uses prepare language for a reviewed web draft', () => {
    mocks.review = true;
    const { container } = render(<BulkComposer />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare output for 1' }));
    expect(mocks.approveAndSend).toHaveBeenCalledWith({ to: [], subject: 'Subject', body: 'Body' });
    expect(container).not.toHaveTextContent(/\b(send|sent|sending)\b/i);
  });

  it('preserves the extension report extraction entry point', () => {
    mocks.extension = true;
    render(<BulkComposer />);
    fireEvent.click(screen.getByRole('button', { name: 'Extract report from page' }));
    expect(mocks.extract).toHaveBeenCalledOnce();
  });
});
