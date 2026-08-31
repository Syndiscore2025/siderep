import { useState } from 'react';

import { Button, Field, Textarea } from '@/components/ui';
import {
  MAX_MANUAL_CUSTOMER_INPUT_LENGTH,
  parseManualCustomer,
} from '@/services/extraction/manualCustomerParser';
import type { ExtractedCustomer } from '@/types';

export interface ManualCustomerInputProps {
  onLoad: (customer: ExtractedCustomer) => void;
}

/** Web-safe customer entry. Parsed data is handed directly to the in-memory session. */
export function ManualCustomerInput({ onLoad }: ManualCustomerInputProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    const result = parseManualCustomer(input);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    onLoad(result.value);
  };

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-content-muted">
        Paste customer details as one <span className="font-medium">Label: Value</span> per line.
        They remain in memory only.
      </p>
      <Field label="Customer details">
        <Textarea
          rows={6}
          maxLength={MAX_MANUAL_CUSTOMER_INPUT_LENGTH}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setError(null);
          }}
          placeholder={'Account Name: Acme Inc.\nContact Email: rep@example.com'}
        />
      </Field>
      <Button variant="primary" size="sm" disabled={!input.trim()} onClick={load}>
        Load customer
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
