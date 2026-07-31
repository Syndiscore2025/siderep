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
} from '@/components/ui';
import { useResetSettings, useSaveSettings, useSettings } from '@/hooks/useSettings';
import { SUGGESTED_MODELS, THEMES, isAzureConfigured } from '@/types';
import type { Settings, Theme } from '@/types';

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

  // Re-sync the local form whenever persisted settings change (load/reset).
  useEffect(() => setForm(settings), [settings]);

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
            <Field label="Endpoint" hint="e.g. https://my-resource.openai.azure.com">
              <Input
                value={form.azure.endpoint}
                onChange={(e) => patch('azure', { endpoint: e.target.value })}
                placeholder="https://…openai.azure.com"
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

        <Card title="Google Account">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-content-muted">
              {form.google.connectedEmail ?? 'Not connected. Required for email drafts (Phase 3).'}
            </p>
            <Button size="sm" disabled title="Available in Phase 3">
              Connect Google
            </Button>
          </div>
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
