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
import { LenderProfilesCard } from '@/components/settings/LenderProfilesCard';
import { useResetSettings, useSaveSettings, useSettings } from '@/hooks/useSettings';
import { createAIService, createEmailService, createRenewalResearchService } from '@/services';
import {
  AI_VERBOSITIES,
  EMAIL_DELIVERY_MODES,
  REASONING_EFFORTS,
  SUGGESTED_MODELS,
  THEMES,
  isAssistantAIConfigured,
} from '@/types';
import type { AIVerbosity, EmailDeliveryMode, ReasoningEffort, Settings, Theme } from '@/types';
import { isExtensionContext } from '@/utils/platform';

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

function settingsForPlatform(settings: Settings, extension: boolean): Settings {
  if (extension || settings.email.deliveryMode !== 'gmail_api') return settings;
  return { ...settings, email: { ...settings.email, deliveryMode: 'gmail_compose_url' } };
}

/**
 * Configuration only — nothing on this page ever touches customer data.
 * Values are persisted by the platform-specific settings storage adapter.
 */
export function SettingsPage() {
  const { settings, isLoading } = useSettings();
  const saveSettings = useSaveSettings();
  const resetSettings = useResetSettings();
  const extension = isExtensionContext();

  const [form, setForm] = useState<Settings>(() => settingsForPlatform(settings, extension));
  const [showAssistantApiKey, setShowAssistantApiKey] = useState(false);
  const [showRenewalApiKey, setShowRenewalApiKey] = useState(false);
  const [lenderProfilesResetToken, setLenderProfilesResetToken] = useState(0);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [renewalTest, setRenewalTest] = useState<TestState>({ status: 'idle' });
  const [google, setGoogle] = useState<TestState>({ status: 'idle' });

  // Re-sync the local form whenever persisted settings change (load/reset).
  useEffect(() => setForm(settingsForPlatform(settings, extension)), [extension, settings]);

  const renewalConfigured =
    form.renewalAI.apiKey.trim().length > 0 && form.renewalAI.model.trim().length > 0;

  const runTest = async () => {
    setTest({ status: 'testing' });
    const result = await createAIService(form).testConnection();
    setTest(result.ok ? { status: 'ok' } : { status: 'error', message: result.error.message });
  };

  const runRenewalTest = async () => {
    setRenewalTest({ status: 'testing' });
    const result = await createRenewalResearchService(form).testConnection();
    setRenewalTest(
      result.ok ? { status: 'ok' } : { status: 'error', message: result.error.message },
    );
  };

  const connectGoogle = async () => {
    if (!extension) return;
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
      <div className="flex-1 overflow-y-auto p-3 md:p-5 lg:p-6">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-4">
            <h1 className="text-lg font-semibold tracking-tight text-content-primary">Settings</h1>
            <p className="mt-0.5 text-xs text-content-muted">
              Configure your profile, AI connections, prompts, and delivery preferences.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
            <Card title="Rep Profile">
              <div className="space-y-3">
                <Field label="Name">
                  <Input
                    value={form.repProfile.name}
                    onChange={(e) => patch('repProfile', { name: e.target.value })}
                    autoComplete="name"
                  />
                </Field>
                <Field label="Company">
                  <Input
                    value={form.repProfile.company}
                    onChange={(e) => patch('repProfile', { company: e.target.value })}
                    autoComplete="organization"
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    type="tel"
                    value={form.repProfile.phone}
                    onChange={(e) => patch('repProfile', { phone: e.target.value })}
                    autoComplete="tel"
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={form.repProfile.email}
                    onChange={(e) => patch('repProfile', { email: e.target.value })}
                    autoComplete="email"
                  />
                </Field>
              </div>
            </Card>

            <LenderProfilesCard
              profiles={form.lenderProfiles}
              onChange={(lenderProfiles) => setForm((current) => ({ ...current, lenderProfiles }))}
              resetToken={lenderProfilesResetToken}
            />

            <Card
              title="OpenAI Renewal"
              icon={<SparklesIcon className="size-3.5" />}
              action={
                renewalConfigured ? (
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
                <Field label="API key">
                  <div className="flex gap-2">
                    <Input
                      type={showRenewalApiKey ? 'text' : 'password'}
                      value={form.renewalAI.apiKey}
                      onChange={(e) => {
                        patch('renewalAI', { apiKey: e.target.value });
                        setRenewalTest({ status: 'idle' });
                      }}
                      autoComplete="off"
                    />
                    <Button
                      size="sm"
                      className="h-9"
                      onClick={() => setShowRenewalApiKey((visible) => !visible)}
                    >
                      {showRenewalApiKey ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                </Field>
                <Field
                  label="Model"
                  hint="Primary model for merchant research, reasoning, and outreach."
                >
                  <Input
                    value={form.renewalAI.model}
                    list="siderep-renewal-models"
                    onChange={(e) => {
                      patch('renewalAI', { model: e.target.value });
                      setRenewalTest({ status: 'idle' });
                    }}
                    placeholder="gpt-5.6-sol"
                  />
                  <datalist id="siderep-renewal-models">
                    {SUGGESTED_MODELS.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </Field>
                <div className="flex items-center gap-2 pt-0.5">
                  <Button
                    size="sm"
                    onClick={() => void runRenewalTest()}
                    loading={renewalTest.status === 'testing'}
                    disabled={!renewalConfigured}
                  >
                    Test primary model
                  </Button>
                  {renewalTest.status === 'ok' && (
                    <span className="flex animate-fade-in items-center gap-1 text-[11px] font-medium text-success">
                      <CheckIcon className="size-3.5" />
                      Connection successful
                    </span>
                  )}
                  {renewalTest.status === 'error' && (
                    <span className="animate-fade-in text-[11px] text-danger">
                      {renewalTest.message}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-content-muted">
                  Stored in {extension ? 'chrome.storage.local' : 'localStorage'} on this device
                  only. Your API key is never logged.
                </p>
              </div>
            </Card>

            <Card
              title="OpenAI Assistant"
              icon={<SparklesIcon className="size-3.5" />}
              action={
                isAssistantAIConfigured(form) ? (
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
                <Field label="API key" hint="Stored locally on this device only.">
                  <div className="flex gap-2">
                    <Input
                      type={showAssistantApiKey ? 'text' : 'password'}
                      value={form.assistantAI.apiKey}
                      onChange={(e) => {
                        patch('assistantAI', { apiKey: e.target.value });
                        setTest({ status: 'idle' });
                      }}
                      autoComplete="off"
                    />
                    <Button
                      size="sm"
                      className="h-9"
                      onClick={() => setShowAssistantApiKey((visible) => !visible)}
                    >
                      {showAssistantApiKey ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                </Field>
                <Field label="Assistant chat model" hint="Separate from the Renewal model above.">
                  <Input
                    list="siderep-assistant-models"
                    value={form.assistantAI.model}
                    onChange={(e) => {
                      patch('assistantAI', { model: e.target.value });
                      setTest({ status: 'idle' });
                    }}
                  />
                  <datalist id="siderep-assistant-models">
                    {SUGGESTED_MODELS.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </Field>

                <div className="flex items-center gap-2 pt-0.5">
                  <Button
                    size="sm"
                    onClick={() => void runTest()}
                    loading={test.status === 'testing'}
                    disabled={!isAssistantAIConfigured(form)}
                  >
                    Test connection
                  </Button>
                  {test.status === 'ok' && (
                    <span className="flex animate-fade-in items-center gap-1 text-[11px] font-medium text-success">
                      <CheckIcon className="size-3.5" />
                      Connection successful
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
                <Field label="Reasoning effort">
                  <Select
                    value={form.ai.reasoningEffort}
                    onChange={(e) =>
                      patch('ai', { reasoningEffort: e.target.value as ReasoningEffort })
                    }
                  >
                    {REASONING_EFFORTS.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Verbosity">
                  <Select
                    value={form.ai.verbosity}
                    onChange={(e) => patch('ai', { verbosity: e.target.value as AIVerbosity })}
                  >
                    {AI_VERBOSITIES.map((verbosity) => (
                      <option key={verbosity} value={verbosity}>
                        {verbosity}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Max output tokens">
                  <Input
                    type="number"
                    min={1}
                    max={32000}
                    value={form.ai.maxOutputTokens}
                    onChange={(e) => patch('ai', { maxOutputTokens: Number(e.target.value) || 1 })}
                  />
                </Field>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-content-primary">Web search</p>
                    <p className="text-[11px] text-content-muted">
                      {form.ai.webSearchEnabled
                        ? 'Enabled for business research only.'
                        : 'Disabled; research uses only supplied information.'}
                    </p>
                  </div>
                  <Toggle
                    checked={form.ai.webSearchEnabled}
                    onChange={(webSearchEnabled) => patch('ai', { webSearchEnabled })}
                    aria-label="Web search"
                  />
                </div>
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
                <Field
                  label="Email subject prefix"
                  hint="Added to the start of every generated Renewal email subject."
                >
                  <Input
                    value={form.prompts.subjectPrefix}
                    onChange={(e) => patch('prompts', { subjectPrefix: e.target.value })}
                    placeholder="1West - "
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
                <Field
                  label="Custom instructions"
                  hint="Extra guidance added to every conversation."
                >
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
                    {EMAIL_DELIVERY_MODES.filter((mode) => extension || mode !== 'gmail_api').map(
                      (mode) => (
                        <option key={mode} value={mode}>
                          {DELIVERY_MODE_LABEL[mode]}
                        </option>
                      ),
                    )}
                  </Select>
                </Field>
                <Field
                  label="Template subject"
                  hint="Use {{placeholders}} — the AI fills them from approved fields."
                >
                  <Input
                    value={form.email.template.subject}
                    onChange={(e) =>
                      patch('email', {
                        template: { ...form.email.template, subject: e.target.value },
                      })
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

            {extension && (
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
            )}

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
        </div>
      </div>

      <div className="shrink-0 border-t border-edge bg-surface-1/85 px-3 py-2.5 backdrop-blur-xl md:px-6 md:py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2">
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
              onClick={() =>
                saveSettings.mutate(form, {
                  onSuccess: () => setLenderProfilesResetToken((current) => current + 1),
                })
              }
            >
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
