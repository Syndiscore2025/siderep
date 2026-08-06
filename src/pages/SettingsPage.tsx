import { useEffect, useState } from 'react';

import {
  Badge,
  Button,
  Card,
  CheckIcon,
  Field,
  Input,
  Select,
  SparklesIcon,
  Textarea,
  Toggle,
} from '@/components/ui';
import { Diagnostics } from '@/components/settings/Diagnostics';
import { useResetSettings, useSaveSettings, useSettings } from '@/hooks/useSettings';
import { createAIService, createEmailService } from '@/services';
import {
  EMAIL_DELIVERY_MODES,
  SUGGESTED_MODELS,
  THEMES,
  isAzureConfigured,
  isValidAzureEndpoint,
} from '@/types';
import type { EmailDeliveryMode, Settings, Theme } from '@/types';

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok' }
  | { status: 'error'; message: string };

const DELIVERY_MODE_LABEL: Record<EmailDeliveryMode, string> = {
  gmail_api: 'Send directly via Gmail API',
  gmail_compose_url: 'Open pre-filled Gmail compose window',
  manual_composer: 'Copy to clipboard (manual)',
};

/**
 * Configuration only — nothing on this page ever touches customer data.
 * Values are persisted via the settings service (`chrome.storage.local`).
 */
export function SettingsPage() {
  const { settings, isLoading } = useSettings();
  const saveSettings = useSaveSettings();
  const resetSettings = useResetSettings();

  const [form, setForm] = useState<Settings>(settings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [google, setGoogle] = useState<TestState>({ status: 'idle' });

  // Re-sync the local form whenever persisted settings change (load/reset).
  useEffect(() => setForm(settings), [settings]);

  const endpointValid = isValidAzureEndpoint(form.azure.endpoint);

  const runTest = async () => {
    setTest({ status: 'testing' });
    const result = await createAIService(form).testConnection();
    setTest(result.ok ? { status: 'ok' } : { status: 'error', message: result.error.message });
  };

  const connectGoogle = async () => {
    setGoogle({ status: 'testing' });
    const auth = await createEmailService(form).authorize(true);
    if (!auth.ok) {
      setGoogle({ status: 'error', message: auth.error.message });
      return;
    }
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${auth.value}` },
      });
      const info = (await res.json()) as { email?: string };
      patch('google', { connectedEmail: info.email ?? 'Connected' });
    } catch {
      patch('google', { connectedEmail: 'Connected' });
    }
    setGoogle({ status: 'ok' });
  };

  const patch = <K extends keyof Settings>(section: K, value: Partial<Settings[K]>) =>
    setForm((prev) => ({
      ...prev,
      [section]: typeof prev[section] === 'object' ? { ...prev[section], ...value } : value,
    }));

  if (isLoading) {
    return <p className="p-4 text-sm text-content-muted">Loading settings…</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <Card
          title="Azure OpenAI"
          icon={<SparklesIcon className="size-3.5" />}
          action={
            isAzureConfigured(form) ? (
              <Badge tone="success">
                <CheckIcon className="mr-0.5 size-3" />
                Configured
              </Badge>
            ) : (
              <Badge tone="warning">Not configured</Badge>
            )
          }
        >
          <div className="space-y-3">
            <Field
              label="Endpoint"
              hint={
                endpointValid
                  ? 'e.g. https://my-resource.openai.azure.com'
                  : 'Enter a valid https:// URL.'
              }
            >
              <Input
                value={form.azure.endpoint}
                onChange={(e) => {
                  patch('azure', { endpoint: e.target.value });
                  setTest({ status: 'idle' });
                }}
                placeholder="https://…openai.azure.com"
                aria-invalid={!endpointValid}
                className={endpointValid ? undefined : 'border-danger focus:border-danger'}
              />
            </Field>
            <Field label="Deployment name">
              <Input
                value={form.azure.deployment}
                onChange={(e) => patch('azure', { deployment: e.target.value })}
                placeholder="my-gpt4o-deployment"
              />
            </Field>
            <Field label="API key" hint="Stored locally on this device only.">
              <div className="flex gap-2">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={form.azure.apiKey}
                  onChange={(e) => patch('azure', { apiKey: e.target.value })}
                  autoComplete="off"
                />
                <Button size="sm" className="h-9" onClick={() => setShowApiKey((v) => !v)}>
                  {showApiKey ? 'Hide' : 'Show'}
                </Button>
              </div>
            </Field>
            <Field label="API version">
              <Input
                value={form.azure.apiVersion}
                onChange={(e) => patch('azure', { apiVersion: e.target.value })}
              />
            </Field>

            <div className="flex items-center gap-2 pt-0.5">
              <Button
                size="sm"
                onClick={() => void runTest()}
                loading={test.status === 'testing'}
                disabled={!isAzureConfigured(form) || !endpointValid}
              >
                Test connection
              </Button>
              {test.status === 'ok' && (
                <span className="flex animate-fade-in items-center gap-1 text-[11px] font-medium text-success">
                  <CheckIcon className="size-3.5" />
                  Connection succeeded
                </span>
              )}
              {test.status === 'error' && (
                <span className="animate-fade-in text-[11px] text-danger">{test.message}</span>
              )}
            </div>
          </div>
        </Card>

        <Card title="AI Behavior">
          <div className="space-y-3">
            <Field label="Model">
              <Input
                list="siderep-models"
                value={form.ai.model}
                onChange={(e) => patch('ai', { model: e.target.value })}
              />
              <datalist id="siderep-models">
                {SUGGESTED_MODELS.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </Field>
            <Field label={`Temperature — ${form.ai.temperature.toFixed(1)}`}>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={form.ai.temperature}
                onChange={(e) => patch('ai', { temperature: Number(e.target.value) })}
                className="w-full accent-(--color-accent)"
              />
            </Field>
            <Field label="Max response tokens">
              <Input
                type="number"
                min={1}
                max={32000}
                value={form.ai.maxTokens}
                onChange={(e) => patch('ai', { maxTokens: Number(e.target.value) || 1 })}
              />
            </Field>
          </div>
        </Card>

        <Card title="Prompts">
          <div className="space-y-3">
            <Field label="Default tone">
              <Input
                value={form.prompts.defaultTone}
                onChange={(e) => patch('prompts', { defaultTone: e.target.value })}
                placeholder="professional"
              />
            </Field>
            <Field label="Email signature" hint="Appended to generated emails.">
              <Textarea
                rows={3}
                value={form.prompts.signature}
                onChange={(e) => patch('prompts', { signature: e.target.value })}
                placeholder={'Best regards,\nAlex Rivera\nAcme Inc.'}
              />
            </Field>
            <Field label="Custom instructions" hint="Extra guidance added to every conversation.">
              <Textarea
                rows={3}
                value={form.prompts.customInstructions}
                onChange={(e) => patch('prompts', { customInstructions: e.target.value })}
                placeholder="Always keep emails under 150 words…"
              />
            </Field>
          </div>
        </Card>

        <Card title="Email">
          <div className="space-y-3">
            <Field
              label="Delivery mode"
              hint="How approved emails are sent. Switch if your org blocks one method."
            >
              <Select
                value={form.email.deliveryMode}
                onChange={(e) =>
                  patch('email', { deliveryMode: e.target.value as EmailDeliveryMode })
                }
              >
                {EMAIL_DELIVERY_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {DELIVERY_MODE_LABEL[mode]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Template subject"
              hint="Use {{placeholders}} — the AI fills them from approved fields."
            >
              <Input
                value={form.email.template.subject}
                onChange={(e) =>
                  patch('email', { template: { ...form.email.template, subject: e.target.value } })
                }
                placeholder="Renewal for {{accountName}}"
              />
            </Field>
            <Field label="Template body">
              <Textarea
                rows={5}
                value={form.email.template.body}
                onChange={(e) =>
                  patch('email', { template: { ...form.email.template, body: e.target.value } })
                }
                placeholder={'Hi {{primaryContact}},\n\nI wanted to reach out about…'}
              />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-content-primary">Remember sent emails</p>
                <p className="text-[11px] text-content-muted">
                  Stores the emails you send (your artifact) — never customer data.
                </p>
              </div>
              <Toggle
                checked={form.email.rememberSent}
                onChange={(checked) => patch('email', { rememberSent: checked })}
                aria-label="Remember sent emails"
              />
            </div>
          </div>
        </Card>

        <Card title="Google Account">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-content-muted">
              {form.google.connectedEmail ??
                'Not connected. Required only for the Gmail API delivery mode.'}
            </p>
            <Button
              size="sm"
              onClick={() => void connectGoogle()}
              loading={google.status === 'testing'}
            >
              {form.google.connectedEmail ? 'Reconnect' : 'Connect Google'}
            </Button>
          </div>
          {google.status === 'error' && (
            <p className="mt-2 animate-fade-in text-[11px] text-danger">{google.message}</p>
          )}
        </Card>

        <Card title="Appearance">
          <Field label="Theme">
            <Select
              value={form.theme}
              onChange={(e) => setForm((prev) => ({ ...prev, theme: e.target.value as Theme }))}
            >
              {THEMES.map((theme) => (
                <option key={theme} value={theme}>
                  {theme[0].toUpperCase() + theme.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <Diagnostics />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-edge bg-surface-1/80 px-3 py-2.5 backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          loading={resetSettings.isPending}
          onClick={() => resetSettings.mutate()}
        >
          Reset to defaults
        </Button>
        <div className="flex items-center gap-2">
          {saveSettings.isSuccess && !saveSettings.isPending && (
            <span className="flex animate-fade-in items-center gap-1 text-[11px] font-medium text-success">
              <CheckIcon className="size-3.5" />
              Saved
            </span>
          )}
          <Button
            variant="primary"
            loading={saveSettings.isPending}
            onClick={() => saveSettings.mutate(form)}
          >
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
