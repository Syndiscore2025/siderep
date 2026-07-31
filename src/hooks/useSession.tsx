import { createContext, useContext, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';

import type { ChatMessage, ExtractedCustomer } from '@/types';

/**
 * In-memory customer session.
 *
 * PRIVACY: this state lives exclusively in React memory inside the side panel
 * document. It is never written to storage of any kind. Closing the side panel
 * unloads the document and destroys everything here; "Clear Session" resets it
 * instantly.
 */

interface SessionState {
  customer: ExtractedCustomer | null;
  messages: ChatMessage[];
}

type SessionAction =
  | { type: 'SET_CUSTOMER'; customer: ExtractedCustomer }
  | { type: 'TOGGLE_FIELD'; key: string }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; id: string; patch: Partial<ChatMessage> }
  | { type: 'CLEAR_SESSION' };

const initialState: SessionState = { customer: null, messages: [] };

function reducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'SET_CUSTOMER':
      // Loading a new customer starts a fresh conversation.
      return { customer: action.customer, messages: [] };
    case 'TOGGLE_FIELD': {
      if (!state.customer) return state;
      return {
        ...state,
        customer: {
          ...state.customer,
          fields: state.customer.fields.map((field) =>
            field.key === action.key ? { ...field, approved: !field.approved } : field,
          ),
        },
      };
    }
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.id ? { ...message, ...action.patch } : message,
        ),
      };
    case 'CLEAR_SESSION':
      return initialState;
  }
}

export interface SessionContextValue extends SessionState {
  setCustomer: (customer: ExtractedCustomer) => void;
  toggleFieldApproval: (key: string) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      setCustomer: (customer) => dispatch({ type: 'SET_CUSTOMER', customer }),
      toggleFieldApproval: (key) => dispatch({ type: 'TOGGLE_FIELD', key }),
      addMessage: (message) => dispatch({ type: 'ADD_MESSAGE', message }),
      updateMessage: (id, patch) => dispatch({ type: 'UPDATE_MESSAGE', id, patch }),
      clearSession: () => dispatch({ type: 'CLEAR_SESSION' }),
    }),
    [state],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- context provider + hook intentionally co-located
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}
