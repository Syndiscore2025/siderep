import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BulkRecipient } from '@/types';

import { BulkOutputPanel } from './BulkOutputPanel';

const recipients: BulkRecipient[] = [
  {
    row: { index: 0, cells: {}, email: 'first@example.com' },
    email: 'first@example.com',
    selected: true,
  },
  {
    row: { index: 1, cells: {}, email: 'second@example.com' },
    email: 'second@example.com',
    selected: false,
  },
];

afterEach(cleanup);

describe('BulkOutputPanel', () => {
  it('keeps manual output visible and prepared when clipboard copying fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    render(
      <BulkOutputPanel
        recipients={recipients}
        subject="Quarterly hello"
        body="Prepared body"
        deliveryMode="manual_composer"
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy prepared email for first@example.com' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/remains visible and selectable/i);
    expect(screen.getByRole('textbox', { name: 'Prepared subject' })).toHaveValue(
      'Quarterly hello',
    );
    expect(screen.getByRole('textbox', { name: 'Prepared body' })).toHaveValue('Prepared body');
    expect(screen.getByText('prepared')).toBeInTheDocument();
  });

  it('copies one recipient output and labels it copied', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(
      <BulkOutputPanel
        recipients={recipients}
        subject="Subject"
        body="Body"
        deliveryMode="manual_composer"
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy prepared email for first@example.com' }),
    );
    await waitFor(() => expect(screen.getByText('copied')).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith('To: first@example.com\nSubject: Subject\n\nBody');
  });

  it('renders one explicit safe Gmail link per selected recipient without opening a popup', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <BulkOutputPanel
        recipients={recipients}
        subject="Subject"
        body="Body"
        deliveryMode="gmail_compose_url"
      />,
    );
    const link = screen.getByRole('link', { name: 'Open Gmail for first@example.com' });
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link.getAttribute('href')).toContain('mail.google.com');
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(screen.getByText('opened')).toBeInTheDocument();
  });
});
