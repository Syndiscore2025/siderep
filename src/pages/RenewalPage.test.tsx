import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RenewalProvider } from '@/hooks/useRenewal';
import type { RenewalExtractionService } from '@/hooks/useRenewal';
import type { RenewalResearchService } from '@/services';
import { loadRenewalHistory, recordCopiedRenewalEmail } from '@/services';
import type { RenewalDraft } from '@/types';
import { ok } from '@/utils';

import { App } from '@/sidepanel/App';
import { RenewalPage } from './RenewalPage';

afterEach(cleanup);

const DRAFT: RenewalDraft = {
  businessSummary: 'Acme is an established local business.',
  sources: [
    { title: 'Acme profile', url: 'https://example.com/acme' },
    { title: 'Unsafe', url: 'javascript:alert(1)' },
  ],
  emailSubject: 'Acme renewal',
  emailBody: 'Hello Acme, renewal options are available.',
  smsBody: 'Acme, let us discuss renewal options.',
};

const extractionService: RenewalExtractionService = {
  extractActiveCustomer: vi.fn(async () => ok({ displayName: '', extractedAt: '', fields: [] })),
};
const researchService: RenewalResearchService = {
  isConfigured: () => true,
  research: vi.fn(async () => ok(DRAFT)),
};

function QueryWrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderPage(research: RenewalResearchService = researchService) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RenewalProvider extractionService={extractionService} researchService={research}>
        <RenewalPage />
      </RenewalProvider>
    </QueryClientProvider>,
  );
}

describe('RenewalPage', () => {
  it('is reachable from five-tab navigation and retains state across tab switches', () => {
    render(<App />, { wrapper: QueryWrapper });
    const navigation = screen.getByRole('navigation', { name: 'Main' });
    expect(within(navigation).getAllByRole('button')).toHaveLength(5);

    fireEvent.click(within(navigation).getByRole('button', { name: 'Renewal' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Merchant name' }), {
      target: { value: 'Persistent Merchant' },
    });
    fireEvent.click(within(navigation).getByRole('button', { name: 'Assistant' }));
    fireEvent.click(within(navigation).getByRole('button', { name: 'Renewal' }));

    expect(screen.getByRole('textbox', { name: 'Merchant name' })).toHaveValue(
      'Persistent Merchant',
    );
  });

  it('provides accessible eligibility and optional lender controls with manual fallback guidance', async () => {
    renderPage();
    expect(
      screen.queryByRole('textbox', { name: 'Additional same-day lender' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eligible' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not eligible' }));
    expect(screen.getByRole('button', { name: 'Not eligible' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add same-day lender' }));
    expect(screen.getByRole('textbox', { name: 'Additional same-day lender' })).toBeInTheDocument();

    const failingExtraction: RenewalExtractionService = {
      extractActiveCustomer: vi.fn(async () => ({
        ok: false,
        error: new Error('Open a record first.'),
      })),
    };
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <RenewalProvider extractionService={failingExtraction} researchService={researchService}>
          <RenewalPage />
        </RenewalProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Read Salesforce' })[1]);
    expect(await screen.findByText(/still enter the details manually/i)).toBeInTheDocument();
  });

  it('generates readonly drafts, filters unsafe sources, and copies email and text separately', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'Business name' }), {
      target: { value: 'Acme' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Go—Research & Generate' }));

    expect(await screen.findByText(DRAFT.businessSummary)).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://example.com/acme');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByRole('textbox', { name: 'Email subject' })).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: 'Email body' })).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: 'SMS text' })).toHaveAttribute('readonly');

    fireEvent.click(screen.getByRole('button', { name: 'Copy Email' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `Subject: ${DRAFT.emailSubject}\n\n${DRAFT.emailBody}`,
      ),
    );
    expect(await screen.findByText('Email copied and saved locally.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current cycle' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Text' }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(DRAFT.smsBody));
  });

  it('keeps source-free drafts copy-ready and warns that no verified source was returned', async () => {
    const sourceFreeDraft = { ...DRAFT, businessSummary: '', sources: [] };
    const sourceFreeResearch: RenewalResearchService = {
      isConfigured: () => true,
      research: vi.fn(async () => ok(sourceFreeDraft)),
    };
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderPage(sourceFreeResearch);

    fireEvent.change(screen.getByRole('textbox', { name: 'Business address' }), {
      target: { value: '42 Market Street, Denver, CO 80202' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Go—Research & Generate' }));

    expect(await screen.findByText(/no verified web source was returned/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sources' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email body' })).toHaveValue(DRAFT.emailBody);
    expect(screen.getByRole('textbox', { name: 'SMS text' })).toHaveValue(DRAFT.smsBody);

    fireEvent.click(screen.getByRole('button', { name: 'Copy Text' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(DRAFT.smsBody));
  });

  it('announces clipboard failure while leaving generated text selectable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'DBA' }), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go—Research & Generate' }));
    await screen.findByText(DRAFT.businessSummary);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Subject' }));

    expect(await screen.findByText(/could not copy subject/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('textbox', { name: 'Email subject' })).toHaveValue(DRAFT.emailSubject);
    expect(
      screen.queryByRole('button', { name: /send email|recipient|provider/i }),
    ).not.toBeInTheDocument();
  });

  it('supports keyboard account selection and clears volatile manual fields', async () => {
    const saved = await recordCopiedRenewalEmail({
      identity: {
        merchantName: 'Saved Merchant',
        businessName: 'Saved Business',
        accountName: 'Saved Account',
        dba: 'Saved DBA',
        website: 'https://saved.example',
      },
      outreachType: 'add_on',
      draftId: 'saved-draft',
      subject: 'Prior subject',
      body: 'Prior body',
    });
    renderPage();
    const combobox = screen.getByRole('combobox', { name: 'Find an account' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Current balance' }), {
      target: { value: '$40,000' },
    });
    fireEvent.focus(combobox);
    fireEvent.change(combobox, { target: { value: 'saved account' } });
    await screen.findByRole('option', { name: /Saved Merchant/i });
    fireEvent.keyDown(combobox, { key: 'Enter' });

    expect(screen.getByRole('textbox', { name: 'Merchant name' })).toHaveValue('Saved Merchant');
    expect(screen.getByRole('textbox', { name: 'Account name' })).toHaveValue('Saved Account');
    expect(screen.getByRole('textbox', { name: 'Current balance' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Outreach type' })).toHaveValue('add_on');
    expect(screen.getByRole('combobox', { name: 'Outreach type' })).toBeDisabled();
    expect(screen.getByText('Prior subject')).toBeInTheDocument();
    expect(saved.accountId).toBeTruthy();
  });

  it('confirms Renewed, delete, and clear actions without creating an empty cycle', async () => {
    const saved = await recordCopiedRenewalEmail({
      identity: { merchantName: 'Lifecycle Merchant' },
      outreachType: 'renewal',
      draftId: 'lifecycle-draft',
      subject: 'Prior subject',
      body: 'Prior body',
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    const combobox = screen.getByRole('combobox', { name: 'Find an account' });
    fireEvent.focus(combobox);
    await screen.findByRole('option', { name: /Lifecycle Merchant/i });
    fireEvent.keyDown(combobox, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Renewed' }));
    expect(await screen.findByText('Renewal cycle archived.')).toBeInTheDocument();
    const archived = (await loadRenewalHistory()).accounts[0];
    expect(archived.activeCycleId).toBeUndefined();
    expect(archived.cycles).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Delete saved account' }));
    expect(await screen.findByText('Saved Renewal account deleted.')).toBeInTheDocument();
    expect((await loadRenewalHistory()).accounts).toEqual([]);
    await recordCopiedRenewalEmail({
      identity: { merchantName: 'Clear Merchant' },
      outreachType: 'renewal',
      draftId: 'clear-draft',
      subject: 'Clear me',
      body: 'Clear me',
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear all Renewal data' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear all Renewal data' }));
    expect(await screen.findByText('All local Renewal data cleared.')).toBeInTheDocument();
    expect((await loadRenewalHistory()).accounts).toEqual([]);
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(saved.accountId).toBeTruthy();
  });
});
