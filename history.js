/**
 * DSP Sweeper — History page
 * Reads the per-day snapshots content.js saves (hist:YYYY-MM-DD) and shows
 * them by day, as a "most rescued" leaderboard, and per helper.
 */
(function () {
  'use strict';
  const H = DSPHistory;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let allDays = [];       // newest first
  let overrides = {};     // date → { tid: type }
  let tab = 'days';
  let rangeDays = 30;
  let showPickups = false;

  try { tab = localStorage.getItem('hist-tab') || tab; } catch {}

  function load() {
    chrome.storage.local.get(null, d => {
      if (d.histVersion !== H.HISTORY_VERSION) { H.migrate(chrome.storage.local, load); return; }
      allDays = Object.keys(d)
        .filter(k => k.startsWith(H.KEY_PREFIX))
        .map(k => d[k])
        .filter(day => day.routeCount !== 0)  // days Cortex had no routes for
        .sort((a, b) => b.date.localeCompare(a.date));
      overrides = d[H.OVERRIDES_KEY] || {};
      renderStep(d[H.STEP_KEY]);
      render();
    });
  }

  function cutoffDate() {
    if (!rangeDays) return '';
    const d = new Date();
    d.setDate(d.getDate() - (rangeDays - 1));
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const days = () => allDays.filter(d => d.date >= cutoffDate());

  const fmtDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = ms => ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase() : '';

  /* ── By day ── */
  function renderDays() {
    const list = days();
    if (!list.length) return empty();
    return list.map(day => {
      const helpers = H.summarizeDay(day, overrides[day.date]);
      const real = helpers.filter(h => h.type !== 'pickup');
      const pickups = helpers.filter(h => h.type === 'pickup');
      const count = t => helpers.filter(h => h.type === t).length;
      const rescued = new Set(real.flatMap(h => h.assists.filter(a => !a.tiny).map(a => a.driverId))).size;
      return `
        <section class="day">
          <div class="day-hdr">
            <h2>${fmtDate(day.date)}${day.complete ? '' : ' <span class="muted small">so far</span>'}</h2>
            <div class="day-stats">
              <span>${count('sweeper')} sweeper${count('sweeper') === 1 ? '' : 's'}</span>
              <span>${count('rescue')} rescue${count('rescue') === 1 ? '' : 's'}</span>
              <span>${rescued} driver${rescued === 1 ? '' : 's'} helped</span>
              ${pickups.length ? `<span class="muted">${pickups.length} pickup${pickups.length === 1 ? '' : 's'}</span>` : ''}
            </div>
          </div>
          ${real.map(h => helperCard(day.date, h)).join('') || '<p class="muted pad">No sweepers or rescues.</p>'}
          ${pickups.length ? `
            <details class="pickups" ${showPickups ? 'open' : ''}>
              <summary>${pickups.length} pickup${pickups.length === 1 ? '' : 's'} (false positives)</summary>
              ${pickups.map(h => helperCard(day.date, h)).join('')}
            </details>` : ''}
        </section>`;
    }).join('');
  }

  function helperCard(date, h) {
    const opts = H.TYPES.map(t => `<option value="${t}"${t === h.type ? ' selected' : ''}>${t}${t === h.autoType ? ' (auto)' : ''}</option>`).join('');
    const own = h.ownRoute && h.ownRoute.totalStops >= H.OWN_ROUTE_MIN_STOPS ? `<span class="muted">own route ${esc(h.ownRoute.routeCode)}</span>` : '';
    return `
      <div class="helper helper-${h.type}">
        <div class="helper-hdr">
          <span class="name">${esc(h.name)}</span>
          <select class="type-sel" data-date="${date}" data-id="${esc(h.id)}" aria-label="Type for ${esc(h.name)}">${opts}</select>
          ${h.overridden ? '<span class="muted small">edited</span>' : ''}
          ${own}
          <span class="total">${h.totalStops} stop${h.totalStops === 1 ? '' : 's'} · ${h.assists.length} route${h.assists.length === 1 ? '' : 's'}</span>
        </div>
        <table class="assists">
          <tbody>
          ${h.assists.map(a => `
            <tr class="${a.tiny ? 'tiny' : ''}">
              <td class="rc">${esc(a.routeCode)}</td>
              <td>${esc(a.driverName)}</td>
              <td class="num">${a.completedStops}/${a.totalStops} stops</td>
              <td class="muted">${fmtTime(a.firstSeen)}</td>
              <td class="muted small">${a.tiny ? 'pickup' : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Most rescued ── */
  function renderRescued() {
    const rows = H.rescuedTally(days(), overrides);
    if (!rows.length) return empty('No rescues recorded in this range.');
    return `
      <p class="muted pad">Drivers who needed help, most often first. Pickups (1–2 stops) are left out.</p>
      <table class="board">
        <thead><tr><th>Driver</th><th class="num">Days rescued</th><th class="num">Times</th><th class="num">Stops taken</th><th>Helped by</th><th>Last</th></tr></thead>
        <tbody>
        ${rows.map(r => `
          <tr>
            <td class="name">${esc(r.name)}</td>
            <td class="num strong">${r.dayCount}</td>
            <td class="num">${r.rescues}</td>
            <td class="num">${r.stops}</td>
            <td class="muted">${Object.entries(r.by).sort((a, b) => b[1] - a[1]).map(([n, c]) => esc(n) + (c > 1 ? ` ×${c}` : '')).join(', ')}</td>
            <td class="muted">${fmtDate(r.lastDate)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  /* ── Helpers ── */
  function renderHelpers() {
    const rows = H.helperTally(days(), overrides);
    if (!rows.length) return empty();
    return `
      <p class="muted pad">Days each person worked as a sweeper or rescue. Stops and routes leave out pickups.</p>
      <table class="board">
        <thead><tr><th>Name</th><th class="num">Sweeper days</th><th class="num">Rescue days</th><th class="num">Pickup days</th><th class="num">Routes helped</th><th class="num">Stops</th><th>Last</th></tr></thead>
        <tbody>
        ${rows.map(r => `
          <tr>
            <td class="name">${esc(r.name)}</td>
            <td class="num">${r.sweeper || ''}</td>
            <td class="num">${r.rescue || ''}</td>
            <td class="num muted">${r.pickup || ''}</td>
            <td class="num">${r.routes}</td>
            <td class="num strong">${r.stops}</td>
            <td class="muted">${fmtDate(r.lastDate)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function empty(msg) {
    return `<div class="empty">${msg || 'No history yet in this range.'}<br><span class="muted">History is saved while the Cortex routes page is open. Leave it open during the day to build it up.</span></div>`;
  }

  function render() {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $('#view').innerHTML = tab === 'rescued' ? renderRescued() : tab === 'helpers' ? renderHelpers() : renderDays();
  }

  /* ── Load past days (steps the Cortex tab through dates) ── */
  let stepRequestedAt = 0;
  function renderStep(st) {
    const el = $('#bf-status'), go = $('#bf-go'), stop = $('#bf-stop');
    const live = st && st.running && Date.now() - (st.updatedAt || 0) < 90000;
    go.disabled = live || !$('#bf-confirm').hidden;
    stop.hidden = !live;
    if (live) {
      el.textContent = `Automation running in your Cortex tab… ${st.done} of ${st.total} days done${st.failed ? `, ${st.failed} failed` : ''}. Now on ${fmtDate(st.current)}.`;
    } else if (stepRequestedAt && (!st || (st.updatedAt || 0) < stepRequestedAt)) {
      el.textContent = 'Waiting for a Cortex tab…';
    } else if (st && st.finishedAt && (st.updatedAt || 0) >= stepRequestedAt) {
      const ok = st.done - (st.failed || 0);
      el.textContent = st.total === 0
        ? 'All of those days are already saved. Tick “Reload days already saved” to load them again.'
        : `Loaded ${ok} of ${st.total} day${st.total === 1 ? '' : 's'}${st.failed ? ` (${st.failed} failed)` : ''}${st.error ? '. ' + st.error : ''}${st.cancel ? '. Stopped early' : ''}.`;
    }
  }

  // Count the days in range that automation would actually open
  function daysToLoad(days, force) {
    const saved = new Set(allDays.filter(d => d.complete).map(d => d.date));
    let n = 0;
    for (let i = 1; i <= days; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const pad = x => String(x).padStart(2, '0');
      if (force || !saved.has(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)) n++;
    }
    return n;
  }

  // Step 1: explain exactly what will happen and ask before automating
  $('#bf-go').addEventListener('click', () => {
    const n = daysToLoad(+$('#bf-days').value, $('#bf-force').checked);
    if (!n) {
      $('#bf-confirm').hidden = true;
      $('#bf-status').textContent = 'All of those days are already saved. Tick “Reload days already saved” to load them again.';
      return;
    }
    const mins = Math.max(1, Math.round(n * 10 / 60));
    $('#bf-confirm-text').textContent =
      `This will take over your open Cortex routes tab and change its date ${n} time${n === 1 ? '' : 's'}, one day after another ` +
      `(about ${mins} minute${mins === 1 ? '' : 's'}). Don't use that tab until it goes back to today. You can stop at any time ` +
      `from this page or from the banner in the Cortex tab.`;
    $('#bf-confirm').hidden = false;
    $('#bf-go').disabled = true;
  });

  $('#bf-cancel').addEventListener('click', () => {
    $('#bf-confirm').hidden = true;
    $('#bf-go').disabled = false;
  });

  // Step 2: only now ask a Cortex tab to start
  $('#bf-start').addEventListener('click', () => {
    $('#bf-confirm').hidden = true;
    stepRequestedAt = Date.now();
    chrome.storage.local.set({ [H.STEP_REQUEST_KEY]: { days: +$('#bf-days').value, force: $('#bf-force').checked, at: stepRequestedAt } });
    renderStep(null);
    setTimeout(() => {
      chrome.storage.local.get(H.STEP_KEY, d => {
        const st = d[H.STEP_KEY];
        if (!st || (st.updatedAt || 0) < stepRequestedAt) {
          stepRequestedAt = 0;
          $('#bf-go').disabled = false;
          $('#bf-status').innerHTML = 'No Cortex tab picked this up. Open <a href="https://logistics.amazon.com/operations/execution/dv/routes" target="_blank" rel="noopener">the Cortex routes page</a>, let it load, then try again.';
        }
      });
    }, 5000);
  });

  $('#bf-stop').addEventListener('click', () => {
    chrome.storage.local.get(H.STEP_KEY, d => {
      const st = d[H.STEP_KEY];
      if (st && st.running) chrome.storage.local.set({ [H.STEP_KEY]: Object.assign(st, { cancel: true, updatedAt: Date.now() }) });
    });
  });

  /* ── CSV ── */
  function exportCsv() {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['date', 'helper', 'type', 'route', 'driver_rescued', 'stops_completed', 'stops_total', 'first_seen'].join(',')];
    for (const day of days().slice().reverse()) {
      for (const h of H.summarizeDay(day, overrides[day.date])) {
        for (const a of h.assists) {
          lines.push([day.date, h.name, a.tiny ? 'pickup' : h.type, a.routeCode, a.driverName, a.completedStops, a.totalStops,
            a.firstSeen ? new Date(a.firstSeen).toISOString() : ''].map(q).join(','));
        }
      }
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `sweeper-history-${new Date().toISOString().slice(0, 10)}.csv` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ── Events ── */
  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    try { localStorage.setItem('hist-tab', tab); } catch {}
    render();
  });
  $('#range').addEventListener('change', e => { rangeDays = +e.target.value; render(); });
  $('#export').addEventListener('click', exportCsv);
  $('#view').addEventListener('toggle', e => { if (e.target.matches('details.pickups')) showPickups = e.target.open; }, true);
  $('#view').addEventListener('change', e => {
    const sel = e.target.closest('.type-sel');
    if (!sel) return;
    const { date, id } = sel.dataset;
    const day = allDays.find(d => d.date === date);
    const auto = H.summarizeDay(day, {}).find(h => h.id === id)?.autoType;
    const forDay = (overrides[date] ||= {});
    if (sel.value === auto) delete forDay[id]; else forDay[id] = sel.value;
    chrome.storage.local.set({ [H.OVERRIDES_KEY]: overrides });
    render();
  });

  // Live-update while a Cortex tab is recording
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some(k => k.startsWith(H.KEY_PREFIX) || k === H.OVERRIDES_KEY || k === H.STEP_KEY)) load();
  });

  load();
})();
