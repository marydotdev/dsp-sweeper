/**
 * DSP Sweeper — Service worker
 *
 * The toolbar icon opens popup.html (a summary of today), set in manifest.json.
 */

// "History" button in the toolbar (content.js) → open the history page
chrome.runtime.onMessage.addListener(msg => {
  if (msg && msg.type === 'bbdr-open-history') {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  }
});
