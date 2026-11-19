/**
 * DSP Sweeper — Toolbar icon popup: a summary of today.
 *
 * Reads what content.js saves to chrome.storage.local:
 *   sweepers / activeDate / toolbarHidden  — confirmed sweepers for activeDate
 *   hist:YYYY-MM-DD / histOverrides        — today's helpers, for the stat tiles (history-core.js)
 */
(function () {
  'use strict';

  const ORIGIN = 'https://logistics.amazon.com';
  const ROUTES_URL = ORIGIN + '/operations/execution/dv/routes';

  // TODO: set this to the instructions / more-info page once it exists.
  // While it's empty, the popup shows the link greyed out with "coming soon".
  const HELP_URL = 'https://dsp-sweeper.vercel.app';

  // Keep in sync with SWEEPER_COLORS in content.js
  const SWEEPER_COLORS = [
    '#9B59B6', '#3498DB', '#E91E90', '#2ECC71', '#B0B8C4',
    '#A3CB38', '#4834D4', '#FDA7DF', '#E74C3C', '#F39C12',
  ];

  // Local calendar date, same as content.js
  function todayStr() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function shortName(name) {
    if (!name || name === 'Unknown') return null;
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  }

  function timeAgo(ms) {
    const min = Math.round((Date.now() - ms) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const h = Math.floor(min / 60);
    return `${h} hr ${min % 60} min ago`;
  }

  const $ = id => document.getElementById(id);

  function renderStats(sweepers, helpers) {
    const real = helpers.filter(h => h.type !== 'pickup');
    const realAssists = real.flatMap(h => h.assists.filter(a => !a.tiny));
    const stats = [
      [sweepers.length, 'Sweepers'],
      [realAssists.length, 'Routes helped'],
      [realAssists.reduce((s, a) => s + a.completedStops, 0), 'Stops done'],
    ];
    $('stats').innerHTML = stats.map(([n, label]) =>
      `<div class="stat"><b>${n}</b><span>${label}</span></div>`).join('');
  }

  function renderSweepers(sweepers) {
    if (!sweepers.length) {
      $('sweepers').innerHTML = '<div class="empty">No sweepers added yet. Use the + button on the routes page.</div>';
      return;
    }
    $('sweepers').innerHTML = sweepers.map(sw => {
      const color = SWEEPER_COLORS[sw.colorIndex ?? 0];
      const cw = sw.currentWith;
      let where = 'Not on a route right now';
      if (cw?.routeCode) {
        const driver = shortName(cw.driverName);
        where = `On ${esc(cw.routeCode)}${driver ? ' with ' + esc(driver) : ''}`;
      }
      return `<div class="row">
        <span class="dot" style="background:${color}"></span>
        <div class="main"><div class="name">${esc(sw.name)}</div><div class="meta">${where}</div></div>
      </div>`;
    }).join('');
  }

  async function setupActions(toolbarHidden) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';

    $('history').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
      window.close();
    });

    if (tab && url.startsWith(ROUTES_URL)) {
      const btn = $('toggle');
      btn.hidden = false;
      btn.textContent = toolbarHidden ? 'Show overlay' : 'Hide overlay';
      btn.addEventListener('click', async () => {
        try {
          const res = await chrome.tabs.sendMessage(tab.id, { type: 'bbdr-toggle' });
          btn.textContent = res?.visible ? 'Hide overlay' : 'Show overlay';
        } catch (e) {
          // No content script in this tab (opened before the extension loaded)
          chrome.tabs.reload(tab.id);
          window.close();
        }
      });
    } else {
      const btn = $('go-routes');
      btn.hidden = false;
      btn.addEventListener('click', () => {
        if (tab && url.startsWith(ORIGIN + '/')) chrome.tabs.update(tab.id, { url: ROUTES_URL });
        else chrome.tabs.create({ url: ROUTES_URL });
        window.close();
      });
    }
  }

  const today = todayStr();
  const histKey = DSPHistory.KEY_PREFIX + today;

  $('date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  chrome.storage.local.get(['sweepers', 'activeDate', 'toolbarHidden', histKey, DSPHistory.OVERRIDES_KEY], d => {
    // Sweepers saved for an earlier day are stale until content.js resets them
    const sweepers = d.activeDate === today ? (d.sweepers || []) : [];
    const day = d[histKey] || DSPHistory.emptyDay(today);
    const helpers = DSPHistory.summarizeDay(day, (d[DSPHistory.OVERRIDES_KEY] || {})[today]);

    if (day.updatedAt) $('date').textContent += ` · updated ${timeAgo(day.updatedAt)}`;

    renderStats(sweepers, helpers);
    renderSweepers(sweepers);
    setupActions(!!d.toolbarHidden);
  });

  if (HELP_URL) {
    $('help').href = HELP_URL;
  } else {
    $('help').classList.add('disabled');
    $('help').removeAttribute('href');
    $('help-soon').hidden = false;
  }
})();
