/**
 * DSP Sweeper — Content Script
 *
 * Colored map dots + sweeper tracking.
 * Data from XHR interception of Cortex API responses.
 * Compact toolbar at bottom-right with detail panel.
 */

(function () {
  'use strict';

  /* ═══════ STATE ═══════ */
  let state = {
    // API-sourced
    routeSummaries: [],          // raw rmsRouteSummaries array
    transporterMap: {},          // transporterId → { name, initials, phone }
    locationMap: {},             // transporterId → { lat, lng, timestamp }

    // Extension-managed
    sweepers: [],                // confirmed sweepers with history
    dismissedHelpers: [],        // rejected transporter IDs
    activePopover: null,         // null | 'add'
    activeDetailPanel: null,     // transporterId of sweeper whose detail panel is open

    // Derived (recomputed on each API update)
    detectedHelpers: [],         // auto-detected from multi-transporter routes
    sweeperRouteData: {},        // transporterId → current route + stop data

    // DOM-sourced (kept from scrapeMapMarkers)
    markerPositions: {},
    personMarkers: {},

    // Internal
    lastUpdate: null,
    _mt: null,
    _apiReady: false,
  };

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  chrome.storage.local.get(['sweepers', 'dismissedHelpers', 'activeDate'], d => {
    const today = todayStr();
    if (d.activeDate && d.activeDate !== today) {
      console.log('[DSP Sweeper] New day detected, clearing data');
      state.sweepers = [];
      state.dismissedHelpers = [];
      persist();
    } else {
      if (d.sweepers) {
        state.sweepers = d.sweepers;
        state.sweepers.forEach(sw => {
          if (sw.colorIndex == null) assignSweeperColor(sw);
          if (!sw.history) sw.history = [];
        });
      }
      if (d.dismissedHelpers) state.dismissedHelpers = d.dismissedHelpers;
    }
    installAPIInterceptor();
    waitForCortex();
  });

  function persist() {
    chrome.storage.local.set({
      sweepers: state.sweepers,
      dismissedHelpers: state.dismissedHelpers,
      activeDate: todayStr(),
    });
  }

  /* ═══════ API INTERCEPTION ═══════ */
  // intercept.js runs in the page's MAIN world and forwards API responses
  // to us via CustomEvent. We just listen here in the content script.
  function installAPIInterceptor() {
    document.addEventListener('__bbdr_route_summaries', e => {
      try {
        const data = JSON.parse(e.detail);
        processRouteSummaries(data);
      } catch (err) {
        console.warn('[DSP Sweeper] route-summaries parse error:', err);
      }
    });
    document.addEventListener('__bbdr_location_update', e => {
      try {
        const data = JSON.parse(e.detail);
        processLocationUpdate(data);
      } catch (err) {
        console.warn('[DSP Sweeper] locationUpdate parse error:', err);
      }
    });
    console.log('[DSP Sweeper] API event listeners installed');
  }

  /* ═══════ API DATA PROCESSING ═══════ */
  function processRouteSummaries(data) {
    // Build transporter name map
    const transporterMap = {};
    if (data.transporters) {
      data.transporters.forEach(t => {
        transporterMap[t.transporterId] = {
          name: (t.firstName + ' ' + t.lastName).trim(),
          initials: t.initials || '',
          phone: t.workPhoneNumber || '',
        };
      });
    }
    state.transporterMap = transporterMap;

    // Store raw route summaries
    state.routeSummaries = data.rmsRouteSummaries || [];

    // Upgrade DOM-detected sweepers with real transporterIds
    for (const sw of state.sweepers) {
      if (sw.transporterId && sw.transporterId.startsWith('dom_')) {
        const oldId = sw.transporterId;
        for (const [tid, info] of Object.entries(transporterMap)) {
          if (info.name === sw.name) {
            sw.transporterId = tid;
            if (state.activeDetailPanel === oldId) {
              state.activeDetailPanel = tid;
            }
            break;
          }
        }
      }
    }

    // Detect helpers from multi-transporter routes
    detectHelpers();

    // Update sweeper tracking
    updateSweeperTracking();

    state.lastUpdate = new Date();
    state._apiReady = true;

    // Re-highlight and render
    scrapeMapMarkers();
    highlightSweeperMarkers();
    render();

    console.log(`[DSP Sweeper] API update — ${state.routeSummaries.length} routes, ${Object.keys(transporterMap).length} transporters`);
  }

  function processLocationUpdate(data) {
    if (!data.transportersLocation) return;
    const locationMap = {};
    data.transportersLocation.forEach(loc => {
      locationMap[loc.transporterId] = {
        lat: loc.geocode?.latitude,
        lng: loc.geocode?.longitude,
        timestamp: loc.epochTimestamp,
      };
    });
    state.locationMap = locationMap;
  }

  /* ═══════ HELPER DETECTION ═══════ */
  function detectHelpers() {
    // If API data is available, use it
    if (state.routeSummaries.length > 0) {
      return detectHelpersFromAPI();
    }
    // Otherwise fall back to DOM scraping
    detectHelpersFromDOM();
  }

  function detectHelpersFromAPI() {
    const dismissed = new Set(state.dismissedHelpers);
    const confirmedIds = new Set(state.sweepers.map(s => s.transporterId).filter(Boolean));
    const detected = [];

    for (const route of state.routeSummaries) {
      if (!route.transporters || route.transporters.length <= 1) continue;

      // Sort by totalStops descending — highest is the primary driver
      const sorted = [...route.transporters].sort(
        (a, b) => (b.routeDeliveryProgress?.totalStops || 0) - (a.routeDeliveryProgress?.totalStops || 0)
      );

      const helpers = sorted.slice(1);
      for (const helper of helpers) {
        const tid = helper.transporterId;
        if (!tid || dismissed.has(tid) || confirmedIds.has(tid)) continue;

        const info = state.transporterMap[tid];
        if (!info) continue;

        // Check if already in detected list
        const existing = detected.find(d => d.transporterId === tid);
        if (existing) {
          if (!existing.onRoutes.includes(route.routeCode)) {
            existing.onRoutes.push(route.routeCode);
          }
        } else {
          detected.push({
            transporterId: tid,
            name: info.name,
            onRoutes: [route.routeCode],
          });
        }
      }
    }

    detected.sort((a, b) => b.onRoutes.length - a.onRoutes.length);
    state.detectedHelpers = detected;
  }

  // Fallback: detect helpers from DOM when API data hasn't arrived yet
  function detectHelpersFromDOM() {
    const helperMap = {};
    const cards = document.querySelectorAll('div[class*="route-"]');

    for (const card of cards) {
      try {
        const codeEl = card.querySelector('p[title^="CX"]');
        if (!codeEl) continue;
        const routeCode = codeEl.title.trim();

        const nameEls = card.querySelectorAll('p[class*="cizv6o"]');
        const names = [];
        nameEls.forEach(el => {
          const t = (el.title || el.textContent || '').trim();
          if (t && t.length > 1) names.push(t);
        });

        const avgMatches = (card.textContent || '').match(/Avg:\s*\d+\s*stops\/hour/gi);
        const avgCount = avgMatches ? avgMatches.length : 0;
        const maxHelpers = Math.max(0, avgCount - 1);
        const helpers = names.slice(1, 1 + maxHelpers);

        for (const h of helpers) {
          if (!helperMap[h]) helperMap[h] = new Set();
          helperMap[h].add(routeCode);
        }
      } catch (err) {
        console.warn('[DSP Sweeper] DOM parse error:', err);
      }
    }

    const dismissedSet = new Set(state.dismissedHelpers);
    const confirmedNames = new Set(state.sweepers.map(s => s.name));
    const detected = [];

    for (const [name, routeSet] of Object.entries(helperMap)) {
      if (confirmedNames.has(name)) continue;
      // Check dismissed by name or dom_ id
      if (dismissedSet.has(name) || dismissedSet.has('dom_' + name.replace(/\s+/g, '_'))) continue;
      // Try to find transporterId from map markers
      const initials = nameToInitials(name);
      let transporterId = null;
      for (const [key, marker] of Object.entries(state.personMarkers)) {
        if (key.startsWith(initials + '_')) {
          transporterId = marker.transporterId;
          break;
        }
      }
      detected.push({
        transporterId: transporterId || 'dom_' + name.replace(/\s+/g, '_'),
        name,
        onRoutes: [...routeSet],
      });
    }

    detected.sort((a, b) => b.onRoutes.length - a.onRoutes.length);
    state.detectedHelpers = detected;
  }

  /* ═══════ SCRAPE MAP MARKERS ═══════ */
  function scrapeMapMarkers() {
    const markerPositions = {};
    const personMarkers = {};

    const markers = document.querySelectorAll('.mapboxgl-marker');
    for (const m of markers) {
      const svg = m.querySelector('svg');
      if (!svg) continue;
      const svgClass = svg.getAttribute('class') || '';
      const text = m.querySelector('text')?.textContent?.trim() || '';

      const routeMatch = svgClass.match(/route-\d+-(\d+)/);
      if (!routeMatch) continue;
      const routeCode = 'CX' + routeMatch[1];

      const style = m.getAttribute('style') || '';
      const posMatch = style.match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/);
      if (!posMatch) continue;
      const x = parseFloat(posMatch[1]);
      const y = parseFloat(posMatch[2]);

      const circle = svg.querySelector('circle, rect, path');
      const fill = circle?.getAttribute('fill') || '';

      const transMatch = svgClass.match(/transporter-(\S+)/);
      const transporterId = transMatch ? transMatch[1] : '';

      if (!markerPositions[routeCode]) {
        markerPositions[routeCode] = { x, y, color: fill, markers: [] };
      }
      markerPositions[routeCode].markers.push({ x, y, initials: text, transporterId });

      if (text) {
        personMarkers[text + '_' + routeCode] = { x, y, routeCode, initials: text, transporterId };
      }
    }

    for (const rc in markerPositions) {
      const mp = markerPositions[rc];
      if (mp.markers.length > 1) {
        mp.x = mp.markers[0].x;
        mp.y = mp.markers[0].y;
      }
    }

    state.markerPositions = markerPositions;
    state.personMarkers = personMarkers;
  }

  /* ═══════ SWEEPER COLORS ═══════ */
  const SWEEPER_COLORS = [
    '#9B59B6',  // amethyst
    '#3498DB',  // sapphire
    '#E91E90',  // ruby pink
    '#2ECC71',  // emerald
    '#B0B8C4',  // silver
    '#A3CB38',  // peridot
    '#4834D4',  // tanzanite
    '#FDA7DF',  // orchid
  ];

  function assignSweeperColor(sweeper) {
    const used = new Set(state.sweepers.map(s => s.colorIndex).filter(i => i != null));
    for (let i = 0; i < SWEEPER_COLORS.length; i++) {
      if (!used.has(i)) { sweeper.colorIndex = i; return; }
    }
    sweeper.colorIndex = 0;
  }

  function getSweeperColor(sw) {
    return SWEEPER_COLORS[sw.colorIndex ?? 0];
  }

  function nameToInitials(fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  /* ═══════ SWEEPER TRACKING ═══════ */
  function getPrimaryDriverName(route, sweeperId) {
    // Primary driver = transporter with highest totalStops that isn't the sweeper
    const sorted = [...route.transporters].sort(
      (a, b) => (b.routeDeliveryProgress?.totalStops || 0) - (a.routeDeliveryProgress?.totalStops || 0)
    );
    const primary = sorted.find(t => t.transporterId !== sweeperId) || sorted[0];
    if (!primary) return 'Unknown';
    const info = state.transporterMap[primary.transporterId];
    return info ? info.name : 'Unknown';
  }

  function updateSweeperTracking() {
    let changed = false;

    for (const sw of state.sweepers) {
      if (!sw.history) sw.history = [];
      if (!sw.transporterId) continue;
      if (sw.transporterId.startsWith('dom_')) continue;

      // Collect ALL routes this sweeper appears on (multi-transporter only)
      const allMatches = [];
      for (const route of state.routeSummaries) {
        if (!route.transporters || route.transporters.length <= 1) continue;
        const match = route.transporters.find(t => t.transporterId === sw.transporterId);
        if (!match) continue;
        const p = match.routeDeliveryProgress || {};
        const completed = p.completedStops || 0;
        const total = p.totalStops || 0;
        // Skip routes where sweeper has 0 stops (not actually assigned)
        if (total === 0) continue;
        allMatches.push({
          routeCode: route.routeCode,
          route,
          completedStops: completed,
          totalStops: total,
          isActive: completed < total,
        });
      }

      if (allMatches.length === 0) {
        delete state.sweeperRouteData[sw.transporterId];
        continue;
      }

      // The active route is the ONLY one where completedStops < totalStops
      const activeMatch = allMatches.find(m => m.isActive) || null;
      // All completed routes
      const completedMatches = allMatches.filter(m => !m.isActive);

      // Update sweeperRouteData (for map tooltip)
      if (activeMatch) {
        state.sweeperRouteData[sw.transporterId] = {
          routeCode: activeMatch.routeCode,
          driverName: getPrimaryDriverName(activeMatch.route, sw.transporterId),
          completedStops: activeMatch.completedStops,
          totalStops: activeMatch.totalStops,
        };
      } else {
        delete state.sweeperRouteData[sw.transporterId];
      }

      const newRouteCode = activeMatch?.routeCode || null;
      const prevRouteCode = sw.currentWith?.routeCode || null;

      // --- Handle currentWith transitions ---

      if (newRouteCode && newRouteCode === prevRouteCode) {
        // Same active route — update stops, preserve arrivedAt
        sw.currentWith.completedStops = activeMatch.completedStops;
        sw.currentWith.totalStops = activeMatch.totalStops;
        sw.currentWith.driverName = sw.currentWith.driverName || getPrimaryDriverName(activeMatch.route, sw.transporterId);

      } else if (newRouteCode && newRouteCode !== prevRouteCode) {
        // New active route (first detection or route changed)
        // Archive old currentWith if it exists
        if (sw.currentWith) {
          _archiveCurrentWith(sw);
          changed = true;
        }
        sw.currentWith = {
          routeCode: newRouteCode,
          driverName: getPrimaryDriverName(activeMatch.route, sw.transporterId),
          completedStops: activeMatch.completedStops,
          totalStops: activeMatch.totalStops,
          arrivedAt: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase(),
          arrivedAtEpoch: Date.now(),
        };
        changed = true;

      } else if (!newRouteCode && prevRouteCode) {
        // No active route anymore — all sweeps finished
        _archiveCurrentWith(sw);
        sw.currentWith = null;
        changed = true;
      }
      // else: !newRouteCode && !prevRouteCode — nothing active, nothing to do

      // --- Sync completed routes into history (update counts only, no new entries) ---
      for (const m of completedMatches) {
        const driver = getPrimaryDriverName(m.route, sw.transporterId);
        const existing = sw.history.find(h => h.routeCode === m.routeCode);
        if (existing) {
          existing.stopsCompleted = m.completedStops;
          existing.driverName = driver;
        }
        // Do NOT push new history entries from the sync loop —
        // history entries are only created when currentWith transitions
      }

      if (sw.history.length > 20) sw.history = sw.history.slice(-20);
    }

    if (changed) persist();
  }

  function _archiveCurrentWith(sw) {
    const cw = sw.currentWith;
    if (!cw) return;
    const rc = cw.routeCode;
    const driver = cw.driverName;
    // Deduplicate: check if routeCode already in history
    const existing = sw.history.find(h => h.routeCode === rc);
    if (existing) {
      existing.stopsCompleted = cw.completedStops || 0;
      existing.driverName = driver;
      if (!existing.arrivedAtEpoch && cw.arrivedAtEpoch) {
        existing.arrivedAt = cw.arrivedAt;
        existing.arrivedAtEpoch = cw.arrivedAtEpoch;
      }
    } else {
      sw.history.push({
        routeCode: rc,
        driverName: driver,
        stopsCompleted: cw.completedStops || 0,
        arrivedAt: cw.arrivedAt,
        arrivedAtEpoch: cw.arrivedAtEpoch,
        departedAt: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase(),
        departedAtEpoch: Date.now(),
      });
    }
  }

  /* ═══════ SWEEPER MARKER HIGHLIGHT ═══════ */
  function highlightSweeperMarkers() {
    const transporterSweeper = {};
    state.sweepers.forEach(sw => {
      if (sw.transporterId) transporterSweeper[sw.transporterId] = sw;
    });

    const initialsOnMap = {};
    for (const marker of Object.values(state.personMarkers)) {
      if (marker.initials) {
        if (!initialsOnMap[marker.initials]) initialsOnMap[marker.initials] = new Set();
        initialsOnMap[marker.initials].add(marker.transporterId || marker.routeCode);
      }
    }

    const initialsSweeper = {};
    state.sweepers.forEach(sw => {
      const ini = nameToInitials(sw.name);
      const onMap = initialsOnMap[ini];
      if (!onMap || onMap.size <= 1) initialsSweeper[ini] = sw;
    });

    document.querySelectorAll('.mapboxgl-marker').forEach(marker => {
      const svg = marker.querySelector('svg');
      if (!svg) return;
      const circle = svg.querySelector('circle:not(.bbdr-ring)');
      if (!circle) return;

      const initials = marker.querySelector('text')?.textContent?.trim() || '';
      const svgClass = svg.getAttribute('class') || '';

      const transMatch = svgClass.match(/transporter-(\S+)/);
      const tid = transMatch ? transMatch[1] : '';
      const sw = (tid && transporterSweeper[tid]) || (initials && initialsSweeper[initials]) || null;

      const ring = svg.querySelector('.bbdr-ring');
      if (ring) ring.remove();

      if (sw) {
        if (!circle.getAttribute('data-bbdr-orig-fill')) {
          circle.setAttribute('data-bbdr-orig-fill', circle.getAttribute('fill') || '');
        }
        circle.style.fill = getSweeperColor(sw);
        marker.setAttribute('data-bbdr-sw', 'sweeper');
        marker.setAttribute('data-bbdr-sw-name', sw.name);
      } else if (marker.getAttribute('data-bbdr-sw')) {
        const origFill = circle.getAttribute('data-bbdr-orig-fill');
        marker.removeAttribute('data-bbdr-sw');
        marker.removeAttribute('data-bbdr-sw-name');
        circle.removeAttribute('data-bbdr-orig-fill');
        if (origFill) circle.style.fill = origFill;
        else circle.style.removeProperty('fill');
      }
    });
  }

  /* ═══════ MAP TOOLTIP ═══════ */
  let tipEl = null;

  function initTooltip() {
    tipEl = document.createElement('div');
    tipEl.id = 'bbdr-tip';
    tipEl.style.display = 'none';
    document.body.appendChild(tipEl);
  }

  function attachMarkerTooltips() {
    const mapContainer = document.querySelector('.mapboxgl-canvas-container')?.parentElement;
    if (!mapContainer || mapContainer._bbdrTipBound) return;
    mapContainer._bbdrTipBound = true;

    mapContainer.addEventListener('mouseover', e => {
      const marker = e.target.closest('.mapboxgl-marker[data-bbdr-sw]');
      if (!marker || !tipEl) return;

      const swName = marker.getAttribute('data-bbdr-sw-name');
      if (!swName) return;

      const sw = state.sweepers.find(s => s.name === swName);
      if (!sw) return;

      const cur = sw.currentWith;
      let html = `<div class="tip-name" style="color:${getSweeperColor(sw)}">${sw.name}</div>`;
      if (cur) {
        const routeData = sw.transporterId ? state.sweeperRouteData[sw.transporterId] : null;
        const stops = routeData ? `${routeData.completedStops}/${routeData.totalStops}` : '...';
        html += `<div class="tip-detail">${cur.driverName} · ${cur.routeCode} · ${stops} stops</div>`;
        html += `<div class="tip-detail">Since ${cur.arrivedAt}</div>`;
      } else {
        html += `<div class="tip-detail">Detecting route...</div>`;
      }

      tipEl.innerHTML = html;
      tipEl.style.visibility = 'hidden';
      tipEl.style.display = 'block';

      requestAnimationFrame(() => {
        const rect = marker.getBoundingClientRect();
        const tw = tipEl.offsetWidth;
        const th = tipEl.offsetHeight;
        let left = rect.left + rect.width / 2 - tw / 2;
        let top = rect.top - th - 8;
        if (left < 4) left = 4;
        if (left + tw > window.innerWidth - 4) left = window.innerWidth - tw - 4;
        if (top < 4) top = rect.bottom + 8;
        tipEl.style.left = left + 'px';
        tipEl.style.top = top + 'px';
        tipEl.style.visibility = 'visible';
      });
    });

    mapContainer.addEventListener('mouseout', e => {
      const marker = e.target.closest('.mapboxgl-marker[data-bbdr-sw]');
      if (marker && tipEl) {
        const related = e.relatedTarget;
        if (!related || !marker.contains(related)) {
          tipEl.style.display = 'none';
        }
      }
    });
  }

  /* ═══════ TOOLBAR DOT TOOLTIP ═══════ */
  let dotTipEl = null;

  function initDotTooltip() {
    dotTipEl = document.createElement('div');
    dotTipEl.id = 'bbdr-dot-tip';
    dotTipEl.style.display = 'none';
    document.body.appendChild(dotTipEl);
  }

  function showDotTooltip(dotEl, sw) {
    if (!dotTipEl) return;
    const color = getSweeperColor(sw);
    dotTipEl.innerHTML = `<div class="dt-name" style="color:${color}">${sw.name}</div>`;
    dotTipEl.style.visibility = 'hidden';
    dotTipEl.style.display = 'block';

    requestAnimationFrame(() => {
      const toolbar = document.getElementById('bbdr-toolbar');
      const toolbarRect = toolbar.getBoundingClientRect();
      const dotRect = dotEl.getBoundingClientRect();
      const tw = dotTipEl.offsetWidth;
      const th = dotTipEl.offsetHeight;
      let left = dotRect.left + dotRect.width / 2 - tw / 2;
      let top = toolbarRect.top - th;
      if (left < 4) left = 4;
      if (left + tw > window.innerWidth - 4) left = window.innerWidth - tw - 4;
      dotTipEl.style.left = left + 'px';
      dotTipEl.style.top = top + 'px';
      dotTipEl.style.visibility = 'visible';
    });
  }

  function hideDotTooltip() {
    if (dotTipEl) dotTipEl.style.display = 'none';
  }

  /* ═══════ TIME HELPERS ═══════ */
  function timeAgo(epochMs) {
    if (!epochMs) return '';
    const diff = Math.max(0, Date.now() - epochMs);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (remMins === 0) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
    return `${hrs} hr${hrs > 1 ? 's' : ''} ${remMins} min${remMins > 1 ? 's' : ''} ago`;
  }

  /* ═══════ RENDER ═══════ */
  let _raf = false;
  function render() {
    if (_raf) return;
    _raf = true;
    requestAnimationFrame(() => { _raf = false; _renderNow(); });
  }

  function _renderNow() {
    // Toolbar
    let toolbar = document.getElementById('bbdr-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'bbdr-toolbar';
      document.body.appendChild(toolbar);
      toolbar.addEventListener('click', _onToolbarClick);
      toolbar.addEventListener('mouseover', _onToolbarHover);
      toolbar.addEventListener('mouseout', _onToolbarHoverOut);
    }
    toolbar.innerHTML = renderToolbar();

    // Add popover
    let popover = document.getElementById('bbdr-popover');
    if (state.activePopover === 'add') {
      if (!popover) {
        popover = document.createElement('div');
        popover.id = 'bbdr-popover';
        document.body.appendChild(popover);
        popover.addEventListener('click', _onPopoverClick);
      }
      popover.innerHTML = renderAddPopover();
    } else if (popover) {
      popover.remove();
    }

    // Detail panel
    let detailPanel = document.getElementById('bbdr-detail');
    if (state.activeDetailPanel) {
      const sw = state.sweepers.find(s => s.transporterId === state.activeDetailPanel);
      if (sw) {
        if (!detailPanel) {
          detailPanel = document.createElement('div');
          detailPanel.id = 'bbdr-detail';
          document.body.appendChild(detailPanel);
          detailPanel.addEventListener('click', _onDetailClick);
        }
        detailPanel.innerHTML = renderDetailPanel(sw);
      } else {
        state.activeDetailPanel = null;
        if (detailPanel) detailPanel.remove();
      }
    } else if (detailPanel) {
      detailPanel.remove();
    }
  }

  /* ═══════ TOOLBAR HTML ═══════ */
  function renderToolbar() {
    const S = state.sweepers;

    const confirmedIds = new Set(S.map(s => s.transporterId).filter(Boolean));
    const dismissedIds = new Set(state.dismissedHelpers);
    const candidates = state.detectedHelpers.filter(
      h => !confirmedIds.has(h.transporterId) && !dismissedIds.has(h.transporterId)
    );
    const candidateCount = candidates.length;

    const hasSweepers = S.length > 0;
    const addActive = state.activePopover === 'add' ? ' active' : '';
    const hasNewCandidates = candidateCount > 0;
    const disabledAttr = hasNewCandidates ? '' : ' disabled';
    const badgeClass = hasNewCandidates ? ' has-badge' : ' btn-disabled';
    const badgeAttr = hasNewCandidates ? ` data-count="${candidateCount}"` : '';

    // Build dots
    const dots = S.map((sw, i) => {
      const color = getSweeperColor(sw);
      const selected = state.activeDetailPanel === sw.transporterId ? ' bt-dot-selected' : '';
      return `<div class="bt-dot${selected}" style="background:${color}" data-act="detail" data-i="${i}"></div>`;
    }).join('');

    let html = '';

    if (hasSweepers) {
      // State 3/4: Active — reset icon + divider + dots
      html += `<button class="bt-reset" data-act="reset" title="Reset all">&#8634;</button>`;
      html += `<div class="bt-divider"></div>`;
      html += `<div class="bt-dots">${dots}</div>`;
    } else {
      // State 1: Empty
      html += `<span class="bt-empty">No sweepers</span>`;
    }

    html += `<div class="bt-actions">`;
    html += `<button class="bt-btn${addActive}${badgeClass}"${badgeAttr}${disabledAttr} data-act="open-add" title="Add sweeper">+</button>`;
    html += `</div>`;

    return html;
  }

  /* ═══════ ADD POPOVER HTML ═══════ */
  function renderAddPopover() {
    const confirmedIds = new Set(state.sweepers.map(s => s.transporterId).filter(Boolean));
    const dismissedIds = new Set(state.dismissedHelpers);
    const candidates = state.detectedHelpers.filter(
      h => !confirmedIds.has(h.transporterId) && !dismissedIds.has(h.transporterId)
    );

    let html = `<div class="po-hdr">Add Sweeper</div>`;

    if (candidates.length > 0) {
      html += candidates.map(h => `
        <div class="po-cand">
          <div class="po-cand-info">
            <span class="po-cand-name">${h.name}</span>
            <span class="po-cand-routes">${h.onRoutes.join(',')}</span>
          </div>
          <div class="po-cand-actions">
            <button class="po-btn-yes" data-act="confirm-sw" data-tid="${h.transporterId}" data-name="${h.name}" title="Confirm">&#10003;</button>
            <button class="po-btn-no" data-act="dismiss" data-tid="${h.transporterId}" title="Not a sweeper">&#10005;</button>
          </div>
        </div>
      `).join('');
    } else {
      html += `<div class="po-empty">No candidates detected</div>`;
    }

    return html;
  }

  /* ═══════ DETAIL PANEL HTML ═══════ */
  function renderDetailPanel(sw) {
    const color = getSweeperColor(sw);

    let html = '';

    // Header
    html += `<div class="dp-header">`;
    html += `<div class="dp-header-left">`;
    html += `<span class="dp-color-dot" style="background:${color}"></span>`;
    html += `<span class="dp-name">${sw.name}</span>`;
    html += `</div>`;
    html += `<div class="dp-header-right">`;
    html += `<button class="dp-delete" data-act="remove-sw" data-tid="${sw.transporterId}" title="Remove sweeper"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`;
    html += `<button class="dp-close" data-act="close-detail" title="Close">&times;</button>`;
    html += `</div>`;
    html += `</div>`;

    const cw = sw.currentWith;
    const isActive = cw && cw.completedStops < cw.totalStops;

    // Active sweep row (pinned to top) — only if completedStops < totalStops
    if (isActive) {
      const ago = timeAgo(cw.arrivedAtEpoch);
      html += `<div class="dp-row dp-row-active">`;
      html += `<div class="dp-row-top">`;
      html += `<span class="dp-route">${cw.routeCode}</span>`;
      html += `<span class="dp-driver">${cw.driverName || 'Unknown'}</span>`;
      html += `<span class="dp-stops">${cw.completedStops}/${cw.totalStops}</span>`;
      html += `</div>`;
      html += `<div class="dp-row-bottom">`;
      html += `<span class="dp-time">${cw.arrivedAt || ''}${ago ? ' (' + ago + ')' : ''}</span>`;
      html += `<span class="dp-active-badge">ACTIVE</span>`;
      html += `</div>`;
      html += `</div>`;
    }

    // Build completed rows from history (deduplicated by routeCode)
    const completedRows = [];
    const seen = new Set();
    // If active, exclude its routeCode from completed list
    if (isActive) seen.add(cw.routeCode);

    const history = sw.history || [];
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      if (seen.has(h.routeCode)) continue;
      seen.add(h.routeCode);
      completedRows.push({
        routeCode: h.routeCode,
        driverName: h.driverName || 'Unknown',
        stopsCompleted: h.stopsCompleted,
        arrivedAtEpoch: h.arrivedAtEpoch,
        arrivedAt: h.arrivedAt,
        arrayIndex: i, // fallback sort for entries without timestamps
      });
    }

    // Sort: arrivedAtEpoch descending (newest first)
    // For entries without epoch, use array index (higher = more recent)
    completedRows.sort((a, b) => {
      const aTime = a.arrivedAtEpoch || 0;
      const bTime = b.arrivedAtEpoch || 0;
      if (aTime && bTime) return bTime - aTime;
      if (aTime) return -1;
      if (bTime) return 1;
      return b.arrayIndex - a.arrayIndex;
    });

    for (const row of completedRows) {
      const ago = timeAgo(row.arrivedAtEpoch);
      html += `<div class="dp-row">`;
      html += `<div class="dp-row-top">`;
      html += `<span class="dp-route">${row.routeCode}</span>`;
      html += `<span class="dp-driver">${row.driverName}</span>`;
      html += `<span class="dp-stops">${row.stopsCompleted}</span>`;
      html += `</div>`;
      html += `<div class="dp-row-bottom">`;
      html += `<span class="dp-time">${row.arrivedAt || ''}${ago ? ' (' + ago + ')' : ''}</span>`;
      html += `</div>`;
      html += `</div>`;
    }

    // Empty state
    if (!isActive && completedRows.length === 0) {
      html += `<div class="dp-row">`;
      html += `<div class="dp-row-bottom">`;
      html += `<span class="dp-time">Waiting for route data...</span>`;
      html += `</div>`;
      html += `</div>`;
    }

    return html;
  }

  /* ═══════ EVENTS ═══════ */
  function _onToolbarClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.stopPropagation();
    _handleAction(b.dataset.act, b.dataset);
  }

  function _onToolbarHover(e) {
    const dot = e.target.closest('.bt-dot');
    if (!dot) return;
    const i = +dot.dataset.i;
    const sw = state.sweepers[i];
    if (sw && state.activeDetailPanel !== sw.transporterId) showDotTooltip(dot, sw);
  }

  function _onToolbarHoverOut(e) {
    const dot = e.target.closest('.bt-dot');
    if (dot) {
      const related = e.relatedTarget;
      if (!related || !dot.contains(related)) {
        hideDotTooltip();
      }
    }
  }

  function _onPopoverClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.stopPropagation();
    _handleAction(b.dataset.act, b.dataset);
  }

  function _onDetailClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.stopPropagation();
    _handleAction(b.dataset.act, b.dataset);
  }

  // Close panels on click outside
  document.addEventListener('click', e => {
    if (state.activePopover == null && state.activeDetailPanel == null) return;
    if (e.target.closest('#bbdr-toolbar') || e.target.closest('#bbdr-popover') || e.target.closest('#bbdr-detail')) return;
    let changed = false;
    if (state.activePopover != null) { state.activePopover = null; changed = true; }
    if (state.activeDetailPanel != null) { state.activeDetailPanel = null; changed = true; }
    if (changed) render();
  });

  function _handleAction(act, data) {
    switch (act) {
      case 'open-add': {
        // Don't open if disabled (no candidates)
        const confirmedIds = new Set(state.sweepers.map(s => s.transporterId).filter(Boolean));
        const dismissedIds = new Set(state.dismissedHelpers);
        const candidates = state.detectedHelpers.filter(
          h => !confirmedIds.has(h.transporterId) && !dismissedIds.has(h.transporterId)
        );
        if (candidates.length === 0) return;
        state.activeDetailPanel = null;
        state.activePopover = state.activePopover === 'add' ? null : 'add';
        render();
        break;
      }

      case 'confirm-sw': {
        if (!state.sweepers.find(s => s.transporterId === data.tid)) {
          const helper = state.detectedHelpers.find(h => h.transporterId === data.tid);
          const now = new Date();
          const newSw = {
            name: data.name,
            transporterId: data.tid,
            colorIndex: null,
            currentWith: helper && helper.onRoutes.length > 0 ? {
              routeCode: helper.onRoutes[0],
              driverName: null,
              completedStops: 0,
              totalStops: 0,
              completedDeliveries: 0,
              arrivedAt: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase(),
              arrivedAtEpoch: Date.now(),
            } : null,
            history: [],
          };
          assignSweeperColor(newSw);
          state.sweepers.push(newSw);
          persist();
          updateSweeperTracking();
          highlightSweeperMarkers();
        }
        // Auto-close if no remaining candidates
        const confirmedIds = new Set(state.sweepers.map(s => s.transporterId).filter(Boolean));
        const dismissedIds = new Set(state.dismissedHelpers);
        const remaining = state.detectedHelpers.filter(
          h => !confirmedIds.has(h.transporterId) && !dismissedIds.has(h.transporterId)
        );
        if (remaining.length === 0) state.activePopover = null;
        render();
        break;
      }

      case 'dismiss': {
        if (!state.dismissedHelpers.includes(data.tid)) {
          state.dismissedHelpers.push(data.tid);
          persist();
        }
        // Auto-close if no remaining candidates
        const confirmedIds = new Set(state.sweepers.map(s => s.transporterId).filter(Boolean));
        const dismissedIds = new Set(state.dismissedHelpers);
        const remaining = state.detectedHelpers.filter(
          h => !confirmedIds.has(h.transporterId) && !dismissedIds.has(h.transporterId)
        );
        if (remaining.length === 0) state.activePopover = null;
        render();
        break;
      }

      case 'detail': {
        const sw = state.sweepers[+data.i];
        if (!sw || !sw.transporterId) return;
        state.activePopover = null;
        hideDotTooltip();
        if (state.activeDetailPanel === sw.transporterId) {
          state.activeDetailPanel = null;
        } else {
          state.activeDetailPanel = sw.transporterId;
        }
        render();
        break;
      }

      case 'close-detail':
        state.activeDetailPanel = null;
        render();
        break;

      case 'remove-sw': {
        const sw = state.sweepers.find(s => s.transporterId === data.tid);
        if (sw && confirm(`Remove ${sw.name}?`)) {
          state.sweepers = state.sweepers.filter(s => s.transporterId !== data.tid);
          state.activeDetailPanel = null;
          delete state.sweeperRouteData[data.tid];
          persist();
          highlightSweeperMarkers();
        }
        render();
        break;
      }

      case 'reset':
        if (confirm('Reset all sweeper data?')) {
          state.sweepers = [];
          state.dismissedHelpers = [];
          state.activePopover = null;
          state.activeDetailPanel = null;
          state.sweeperRouteData = {};
          persist();
          hideDotTooltip();
          highlightSweeperMarkers();
        }
        render();
        break;
    }
  }

  /* ═══════ AUTO-REFRESH ═══════ */
  function startLoop() {
    // Marker re-highlight on interval (API interception handles data updates)
    setInterval(() => {
      scrapeMapMarkers();
      highlightSweeperMarkers();
      render();
    }, 30000);

    // MutationObserver for marker re-highlight when DOM changes
    const obs = new MutationObserver(muts => {
      let hit = false;
      for (const m of muts) {
        if (m.target.id === 'bbdr-toolbar' || m.target.id === 'bbdr-popover' || m.target.id === 'bbdr-detail') continue;
        if (m.target.closest?.('#bbdr-toolbar') || m.target.closest?.('#bbdr-popover') || m.target.closest?.('#bbdr-detail')) continue;
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.id !== 'bbdr-toolbar' && n.id !== 'bbdr-popover' && n.id !== 'bbdr-detail'
              && !n.closest?.('#bbdr-toolbar') && n.textContent && /CX\d{2,4}/.test(n.textContent)) {
            hit = true; break;
          }
        }
        if (hit) break;
      }
      if (hit) {
        clearTimeout(state._mt);
        state._mt = setTimeout(() => {
          scrapeMapMarkers();
          highlightSweeperMarkers();
          render();
        }, 1500);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ═══════ INIT ═══════ */
  function waitForCortex() {
    console.log('[DSP Sweeper] Waiting for Cortex...');
    const iv = setInterval(() => {
      // Wait for either route cards in DOM or API data
      const hasRouteCards = document.querySelectorAll('div[class*="route-"]').length > 2;
      const hasApiData = state._apiReady;
      if (hasRouteCards || hasApiData) {
        clearInterval(iv);
        initTooltip();
        initDotTooltip();
        scrapeMapMarkers();
        detectHelpers();
        updateSweeperTracking();
        highlightSweeperMarkers();
        attachMarkerTooltips();
        render();
        startLoop();
        console.log(`[DSP Sweeper] Ready — ${state.sweepers.length} sweepers`);
      }
    }, 1000);
    setTimeout(() => clearInterval(iv), 60000);
  }

})();
