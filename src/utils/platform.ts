/** True only when code is running with a fully identified Chrome extension runtime. */
export function isExtensionContext(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.runtime?.id === 'string' &&
    chrome.runtime.id.trim().length > 0
  );
}
