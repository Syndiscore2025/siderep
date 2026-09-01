import type { AIVerbosity, ReasoningEffort, Settings } from '@/types';

/**
 * The single runtime configuration for SideRep's merchant research and
 * outreach pipeline. It uses the selected Renewal model exactly and never
 * substitutes a fallback model.
 */
export interface SideRepAIConfig {
  model: string;
  reasoningEffort: ReasoningEffort;
  verbosity: AIVerbosity;
  maxOutputTokens: number;
  webSearchEnabled: boolean;
}

export function createSideRepAIConfig(settings: Settings): SideRepAIConfig {
  return {
    model: settings.renewalAI.model.trim(),
    reasoningEffort: settings.ai.reasoningEffort,
    verbosity: settings.ai.verbosity,
    maxOutputTokens: settings.ai.maxOutputTokens,
    webSearchEnabled: settings.ai.webSearchEnabled,
  };
}
