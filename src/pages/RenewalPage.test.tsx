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

function enterMinimumInput(): void {
  fireEvent.change(screen.getByRole('textbox', { name: 'Business name' }), {
    target: { value: 'Acme' },
  });
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Business Website / Google Maps / Address' }),
    {
      target: { value: '42 Market Street, Denver, CO 80202' },
    },
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Merchant first name' }), {
    target: { value: 'Avery' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Current lender' }), {
    target: { value: 'Example Capital' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Paid in' }), { target: { value: '50%' } });
}

describe('RenewalPage', () => {
  it('is the default five-tab view and retains state across tab switches', () => {
    render(<App />, { wrapper: QueryWrapper });
    const navigation = screen.getByRole('navigation', { name: 'Main' });
    expect(within(navigation).getAllByRole('button')).toHaveLength(5);
    expect(within(navigation).getByRole('button', { name: 'Renewal' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('heading', { name: 'Renewal outreach' })).toBeInTheDocument();
    const locator = screen.getByRole('textbox', {
      name: 'Business Website / Google Maps / Address',
    });
    expect(locator.closest('label')?.parentElement).toHaveClass('sm:col-span-2');

    fireEvent.change(screen.getByRole('textbox', { name: 'Merchant first name' }), {
      target: { value: 'Persistent Merchant' },
    });
    fireEvent.click(within(navigation).getByRole('button', { name: 'Assistant' }));
    fireEvent.click(within(navigation).getByRole('button', { name: 'Renewal' }));

    expect(screen.getByRole('textbox', { name: 'Merchant first name' })).toHaveValue(
      'Persistent Merchant',
    );
  });

  it('offers configured lender profiles while allowing an unknown lender entry', async () => {
    renderPage();
    const lender = await screen.findByRole('combobox', { name: 'Current lender' });
    expect(lender).toHaveAttribute('list', 'siderep-lender-profiles');
    expect(document.querySelector('#siderep-lender-profiles')).toBeInTheDocument();
  });

  it('keeps optional special instructions prominent and in the active outreach input', () => {
    renderPage();
    const instructions = screen.getByRole('textbox', {
      name: 'Special Instructions / What should I mention?',
    });

    fireEvent.change(instructions, {
      target: { value: 'Ask Avery to call me, not send statements.' },
    });

    expect(instructions).toHaveValue('Ask Avery to call me, not send statements.');
    expect(screen.queryByLabelText('Rep notes / special instruction')).not.toBeInTheDocument();
  });

  it('keeps funding details optional while retaining eligibility and manual fallback guidance', async () => {
    renderPage();
    const fundingDetails = screen.getByText('+ Add Funding Details').closest('details');
    expect(fundingDetails).not.toHaveAttribute('open');
    expect(screen.getByRole('textbox', { name: 'Additional same-day lender' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eligible' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not eligible' }));
    expect(screen.getByRole('button', { name: 'Not eligible' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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

  it('generates only readonly subject, email, and text outputs with separate copy actions', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderPage();
    enterMinimumInput();
    fireEvent.click(screen.getByRole('button', { name: 'Go—Research & Generate' }));

    await screen.findByRole('textbox', { name: 'Subject' });
    const businessDetails = screen.getByRole('region', { name: 'Business details' });
    const generatedOutreach = screen.getByRole('region', { name: 'Generated outreach' });
    expect(within(businessDetails).getByRole('textbox', { name: 'Business name' })).toHaveValue(
      'Acme',
    );
    expect(within(generatedOutreach).getByRole('textbox', { name: 'Email' })).toHaveValue(
      DRAFT.emailBody,
    );
    expect(within(generatedOutreach).getByRole('textbox', { name: 'Text Message' })).toHaveValue(
      DRAFT.smsBody,
    );
    expect(
      screen.queryByRole('heading', { name: /Business summary|Sources/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: 'Text Message' })).toHaveAttribute('readonly');

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

  it('keeps source-free drafts copy-ready without showing internal research fields', async () => {
    const sourceFreeDraft = { ...DRAFT, businessSummary: '', sources: [] };
    const sourceFreeResearch: RenewalResearchService = {
      isConfigured: () => true,
      research: vi.fn(async () => ok(sourceFreeDraft)),
    };
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderPage(sourceFreeResearch);

    enterMinimumInput();
    fireEvent.click(screen.getByRole('button', { name: 'Go—Research & Generate' }));

    expect(await screen.findByRole('textbox', { name: 'Email' })).toHaveValue(DRAFT.emailBody);
    expect(screen.queryByRole('heading', { name: 'Sources' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Text Message' })).toHaveValue(DRAFT.smsBody);

    fireEvent.click(screen.getByRole('button', { name: 'Copy Text' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(DRAFT.smsBody));
  });

  it('announces clipboard failure while leaving generated text selectable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    renderPage();
    enterMinimumInput();
    fireEvent.click(screen.getByRole('button', { name: 'Go—Research & Generate' }));
    await screen.findByRole('textbox', { name: 'Subject' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy Subject' }));

    expect(await screen.findByText(/could not copy subject/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue(DRAFT.emailSubject);
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

    expect(screen.getByRole('textbox', { name: 'Merchant first name' })).toHaveValue(
      'Saved Merchant',
    );
    expect(
      screen.getByRole('textbox', { name: 'Business Website / Google Maps / Address' }),
    ).toHaveValue('https://saved.example/');
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
