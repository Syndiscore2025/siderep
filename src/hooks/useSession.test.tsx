import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';

import { SAMPLE_CUSTOMER } from '@/services';

import { SessionProvider, useSession } from './useSession';

const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);

describe('useSession', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.customer).toBeNull();
    expect(result.current.messages).toEqual([]);
  });

  it('setCustomer starts a fresh conversation', () => {
    const { result } = renderHook(() => useSession(), { wrapper });

    act(() => {
      result.current.addMessage({
        id: '1',
        role: 'user',
        content: 'hello',
        createdAt: new Date().toISOString(),
      });
      result.current.setCustomer(SAMPLE_CUSTOMER);
    });

    expect(result.current.customer?.displayName).toBe(SAMPLE_CUSTOMER.displayName);
    expect(result.current.messages).toEqual([]);
  });

  it('toggleFieldApproval flips a single field', () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    act(() => result.current.setCustomer(SAMPLE_CUSTOMER));

    const target = SAMPLE_CUSTOMER.fields[0];
    act(() => result.current.toggleFieldApproval(target.key));

    const field = result.current.customer?.fields.find((f) => f.key === target.key);
    expect(field?.approved).toBe(!target.approved);
    // Others untouched.
    const other = result.current.customer?.fields.find((f) => f.key !== target.key);
    const original = SAMPLE_CUSTOMER.fields.find((f) => f.key === other?.key);
    expect(other?.approved).toBe(original?.approved);
  });

  it('updateMessage patches by id', () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    act(() => {
      result.current.addMessage({
        id: 'a1',
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        pending: true,
      });
      result.current.updateMessage('a1', { content: 'done', pending: false });
    });

    expect(result.current.messages[0]).toMatchObject({ content: 'done', pending: false });
  });

  it('clearSession wipes everything', () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    act(() => {
      result.current.setCustomer(SAMPLE_CUSTOMER);
      result.current.clearSession();
    });
    expect(result.current.customer).toBeNull();
    expect(result.current.messages).toEqual([]);
  });

  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);
  });
});
