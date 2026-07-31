/**
 * One-click prompt templates surfaced as chips above the composer. These are
 * plain templates — customer data is only merged in via the (user-approved)
 * system prompt at request time.
 */
export interface QuickAction {
  id: string;
  label: string;
  prompt: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'renewal-email',
    label: 'Draft renewal email',
    prompt: 'Draft a renewal email for this customer. Keep it concise and action-oriented.',
  },
  {
    id: 'follow-up',
    label: 'Generate follow-up',
    prompt: 'Write a short, friendly follow-up email referencing our last touchpoint.',
  },
  {
    id: 'summarize',
    label: 'Summarize account',
    prompt: 'Summarize this account in a few bullet points I can skim before a call.',
  },
  {
    id: 'next-action',
    label: 'Suggest next action',
    prompt: 'Based on the approved context, suggest the single best next action and why.',
  },
  {
    id: 'talking-points',
    label: 'Talking points',
    prompt: 'Generate talking points for my next call with this customer.',
  },
  {
    id: 'objections',
    label: 'Likely objections',
    prompt: 'List the objections this customer is most likely to raise and how to answer them.',
  },
];
