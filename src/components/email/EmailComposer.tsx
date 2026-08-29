import { useEffect, useState } from 'react';

import {
  Badge,
  Button,
  Card,
  CheckIcon,
  Field,
  Input,
  SendIcon,
  SparklesIcon,
  Textarea,
} from '@/components/ui';
import { useEmail } from '@/hooks/useEmail';
import type { EmailDeliveryMode } from '@/types';

const PRIMARY_LABEL: Record<EmailDeliveryMode, string> = {
  gmail_api: 'Send via Gmail',
  gmail_compose_url: 'Open in Gmail',
  manual_composer: 'Copy email',
};

const MODE_LABEL: Record<EmailDeliveryMode, string> = {
  gmail_api: 'Gmail API',
  gmail_compose_url: 'Gmail compose',
  manual_composer: 'Manual',
};

/**
 * Template-driven email generation with a mandatory approval gate: the AI fills
 * the draft, but nothing is ever sent until the user reviews it and clicks the
 * primary action here.
 */
export function EmailComposer() {
  const { draft, phase, deliveryMode, generate, approveAndSend, reset, isGenerating, isSending } =
    useEmail();

  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (draft) {
      setTo(draft.to.join(', '));
      setSubject(draft.subject);
      setBody(draft.body);
    }
  }, [draft]);

  const onApprove = async () => {
    const email = {
      to: to
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      subject,
      body,
    };
    if (deliveryMode === 'manual_composer') {
      try {
        await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      } catch {
        // Clipboard may be unavailable; the fields remain copyable manually.
      }
    }
    await approveAndSend(email);
  };

  const showEditor = phase.kind === 'review' || phase.kind === 'sending';

  return (
    <Card
      title="Email"
      icon={<SparklesIcon className="size-3.5" />}
      action={<Badge tone="neutral">{MODE_LABEL[deliveryMode]}</Badge>}
    >
      <div className="space-y-3">
        {!showEditor && phase.kind !== 'sent' && (
          <Button
            variant="primary"
            size="sm"
            icon={<SparklesIcon className="size-3.5" />}
            loading={isGenerating}
            onClick={() => void generate()}
          >
            Generate email from template
          </Button>
        )}

        {showEditor && (
          <>
            <Field label="To">
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="name@company.com"
              />
            </Field>
            <Field label="Subject">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field
              label="Body"
              hint="Review and edit before sending — nothing sends automatically."
            >
              <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={<SendIcon className="size-3.5" />}
                loading={isSending}
                disabled={!body.trim()}
                onClick={() => void onApprove()}
              >
                {PRIMARY_LABEL[deliveryMode]}
              </Button>
              <Button variant="ghost" size="sm" disabled={isSending} onClick={reset}>
                Discard
              </Button>
            </div>
          </>
        )}

        {phase.kind === 'sent' && (
          <div className="space-y-2">
            <span className="flex animate-fade-in items-center gap-1 text-[11px] font-medium text-success">
              <CheckIcon className="size-3.5" />
              {deliveryMode === 'gmail_api'
                ? 'Email sent via Gmail.'
                : deliveryMode === 'gmail_compose_url'
                  ? 'Opened in Gmail — click Send there to finish.'
                  : 'Copied to clipboard — paste it into your email client.'}
            </span>
            <Button variant="secondary" size="sm" onClick={reset}>
              Compose another
            </Button>
          </div>
        )}

        {phase.kind === 'error' && (
          <p className="animate-fade-in text-[11px] text-danger">{phase.message}</p>
        )}
      </div>
    </Card>
  );
}
