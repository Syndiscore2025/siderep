import { defineManifest } from '@crxjs/vite-plugin';

import pkg from './package.json' with { type: 'json' };

/**
 * Salesforce surfaces the extension is allowed to read. We keep the match
 * patterns intentionally scoped to Salesforce domains — the extension only
 * ever reads the page the user is already viewing and never touches anything
 * else.
 */
const SALESFORCE_MATCHES = [
  'https://*.salesforce.com/*',
  'https://*.force.com/*',
  'https://*.visualforce.com/*',
  'https://*.salesforce-setup.com/*',
];

export default defineManifest({
  manifest_version: 3,
  name: 'SideRep — AI Sales Assistant',
  version: pkg.version,
  description:
    'AI sales assistant that reads the Salesforce page you are viewing and helps you draft emails — no Salesforce admin, APIs, or data storage required.',
  // Side Panel + setPanelBehavior(openPanelOnActionClick) requires Chrome 116+.
  minimum_chrome_version: '116',

  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },

  action: {
    default_title: 'Open SideRep',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  side_panel: {
    default_path: 'index.html',
  },

  content_scripts: [
    {
      matches: SALESFORCE_MATCHES,
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],

  // `scripting` is used to read the visible DOM on demand (Phase 2).
  // `storage` persists configuration only — never customer data.
  // `identity` powers Google Workspace OAuth for Gmail (Phase 3).
  permissions: ['sidePanel', 'scripting', 'activeTab', 'storage', 'identity'],

  // Lock down what the extension's own pages (the side panel) may load and
  // connect to. Scripts/objects are restricted to bundled code (`self`), and
  // outbound network access is limited to the two integrations we actually use:
  //   - Azure OpenAI (chat completions) on `*.openai.azure.com`
  //   - Google APIs (Gmail send, Phase 3) on `*.googleapis.com`
  // Everything else is denied by default, so extracted customer data can never
  // be exfiltrated to an unexpected host.
  content_security_policy: {
    extension_pages: [
      "default-src 'self'",
      "script-src 'self'",
      "object-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://*.openai.azure.com https://*.googleapis.com",
    ].join('; '),
  },

  host_permissions: SALESFORCE_MATCHES,
});
