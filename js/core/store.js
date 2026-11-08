// In-memory app state shared between views.
const uiState = new Map();

export const store = {
  /** tabId -> { items, errors, fetchedAt, pending } */
  tabData: new Map(),
  /** tabId -> { status, text, error, at } */
  briefings: new Map(),
  /** symbol -> analysis result or { error } */
  markets: new Map(),
  /** Per-tab UI state (filters etc.) that survives tab switches. */
  ui(tabId, defaults) {
    if (!uiState.has(tabId)) uiState.set(tabId, { ...defaults });
    return uiState.get(tabId);
  },
};
