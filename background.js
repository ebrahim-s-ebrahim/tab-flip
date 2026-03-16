/**
 * Tab Flip — MRU tab switcher
 *
 * Mental model: a two-element stack.
 *   - currentTabId: the tab you're looking at right now
 *   - previousTabId: the tab you were on before this one
 *
 * When the user triggers "flip-tab", we activate previousTabId.
 * The onActivated listener then naturally rotates the stack:
 *   previous = old current, current = the one we just switched to.
 *
 * Edge cases handled:
 *   - Tab closed while it was the "previous" → we clear it (no stale references)
 *   - Window focus changes → we track the active tab in the newly focused window
 *   - Extension starts/reloads → we seed currentTabId from the actually active tab
 */

let currentTabId = null;
let previousTabId = null;

// --- State transitions ---

chrome.tabs.onActivated.addListener((activeInfo) => {
  // Guard: if we're already tracking this tab, ignore.
  // This prevents self-triggered activations from corrupting the stack.
  if (activeInfo.tabId === currentTabId) return;

  previousTabId = currentTabId;
  currentTabId = activeInfo.tabId;
});

// When the user switches windows, update current to that window's active tab.
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;

  chrome.tabs.query({ active: true, windowId }, (tabs) => {
    if (tabs.length > 0 && tabs[0].id !== currentTabId) {
      previousTabId = currentTabId;
      currentTabId = tabs[0].id;
    }
  });
});

// If the "previous" tab gets closed, clear it so we don't flip to a ghost.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === previousTabId) {
    previousTabId = null;
  }
  if (tabId === currentTabId) {
    // Current was closed — the browser will fire onActivated for the new tab,
    // but we should clear currentTabId so the guard doesn't block it.
    currentTabId = null;
  }
});

// --- Command handler ---

chrome.commands.onCommand.addListener((command) => {
  if (command !== "flip-tab") return;

  if (previousTabId == null) return; // nothing to flip to

  // Attempt to switch. If the tab no longer exists (race condition),
  // chrome.runtime.lastError will be set — we just clear and move on.
  chrome.tabs.update(previousTabId, { active: true }, (tab) => {
    if (chrome.runtime.lastError) {
      previousTabId = null;
      return;
    }
    // If the previous tab is in a different window, also focus that window.
    if (tab && tab.windowId) {
      chrome.windows.update(tab.windowId, { focused: true });
    }
  });
});

// --- Bootstrap: seed current tab on extension load/reload ---

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs.length > 0) {
    currentTabId = tabs[0].id;
  }
});
