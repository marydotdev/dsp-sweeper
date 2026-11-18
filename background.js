/**
 * DSP Sweeper — Toolbar icon handler (service worker)
 *
 * Clicking the extension icon:
 *   - on the Cortex routes page → shows/hides the sweeper toolbar
 *   - elsewhere in Cortex       → goes to the routes page
 *   - anywhere else             → opens the routes page in a new tab
 */
const ORIGIN = 'https://logistics.amazon.com';
const ROUTES_URL = ORIGIN + '/operations/execution/dv/routes';

chrome.action.onClicked.addListener(async tab => {
  const url = tab.url || '';

  if (!url.startsWith(ORIGIN + '/')) {
    chrome.tabs.create({ url: ROUTES_URL });
    return;
  }
  if (!url.startsWith(ROUTES_URL)) {
    chrome.tabs.update(tab.id, { url: ROUTES_URL });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'bbdr-toggle' });
  } catch (e) {
    // No content script in this tab (e.g. it was open before the extension
    // was installed or reloaded), so reload to inject it.
    chrome.tabs.reload(tab.id);
  }
});

// "History" button in the toolbar (content.js) → open the history page
chrome.runtime.onMessage.addListener(msg => {
  if (msg && msg.type === 'bbdr-open-history') {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  }
});
