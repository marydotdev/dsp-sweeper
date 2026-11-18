/**
 * DSP Sweeper — History core (shared by content.js and history.html)
 *
 * Every route-summaries update is boiled down to "assists": one per helper per
 * route they appear on (anyone on a multi-transporter route who isn't that
 * route's primary driver). Assists are saved per day under `hist:YYYY-MM-DD`.
 *
 * Raw numbers are stored and helpers are classified when read, so the rules
 * below can be tuned without losing history:
 *   pickup  — only took 1–2 stops (grabbed packages another driver marked
 *             missing). A false positive, not a real rescue.
 *   rescue  — has their own route, and also helped someone.
 *   sweeper — no route of their own, helps other drivers.
 * Any helper's type can be overridden per day from the history page.
 */
(function (root) {
  'use strict';

  const PICKUP_MAX_STOPS = 2;      // an assist with this many stops or fewer is a pickup
  const OWN_ROUTE_MIN_STOPS = 20;  // a route this big (as primary driver) counts as "their own route"
  const KEY_PREFIX = 'hist:';
  const OVERRIDES_KEY = 'histOverrides';  // { 'YYYY-MM-DD': { transporterId: type } }
  const TYPES = ['sweeper', 'rescue', 'pickup'];
  const HISTORY_VERSION = 2;

  const stopsOf = t => t.routeDeliveryProgress?.totalStops || 0;
  const doneOf = t => t.routeDeliveryProgress?.completedStops || 0;

  function emptyDay(date) {
    return { date, updatedAt: null, assists: {}, ownRoutes: {} };
  }

  // Primary driver = the driver Cortex assigned the route to
  // (transporterIdFromRms). Falls back to the most stops if that driver
  // isn't on the route.
  function primaryOf(route, transporters) {
    const assigned = transporters.find(t => t.transporterId === route.transporterIdFromRms);
    return assigned || transporters.reduce((a, b) => (stopsOf(b) > stopsOf(a) ? b : a));
  }

  // "YYYY-MM-DD" from a route-summaries response (routes carry localDate: [y, m, d])
  function responseDate(data) {
    const ld = (data?.rmsRouteSummaries || []).find(r => Array.isArray(r.localDate))?.localDate;
    if (!ld) return null;
    const pad = n => String(n).padStart(2, '0');
    return `${ld[0]}-${pad(ld[1])}-${pad(ld[2])}`;
  }

  // transporterId → { name } from a route-summaries response
  function namesFrom(data) {
    const map = {};
    for (const t of data?.transporters || []) {
      map[t.transporterId] = { name: `${t.firstName || ''} ${t.lastName || ''}`.replace(/\s+/g, ' ').trim() };
    }
    return map;
  }

  function extract(routeSummaries, transporterMap) {
    const nameOf = id => transporterMap[id]?.name || 'Unknown';
    const ownRoute = {};
    const assists = [];
    const areas = new Set();
    let routeCount = 0;

    for (const r of routeSummaries || []) {
      const ts = (r.transporters || []).filter(t => t.transporterId);
      if (!ts.length) continue;
      routeCount++;
      if (r.serviceAreaId) areas.add(r.serviceAreaId);
      const primary = primaryOf(r, ts);
      const prev = ownRoute[primary.transporterId];
      if (!prev || stopsOf(primary) > prev.totalStops) {
        ownRoute[primary.transporterId] = { routeCode: r.routeCode, totalStops: stopsOf(primary) };
      }
      if (ts.length < 2) continue;
      // Ride-along helpers on "with Helper" routes work the same itinerary;
      // they aren't rescuing the driver.
      const rideAlong = new Set();
      for (const t of ts) {
        if (t.itineraryPartners?.programType !== 'HELPER_ROUTE') continue;
        for (const p of t.itineraryPartners.partnerDetails || []) if (p.transporterId) rideAlong.add(p.transporterId);
      }
      for (const t of ts) {
        if (t === primary || stopsOf(t) === 0 || rideAlong.has(t.transporterId)) continue;
        if (primary.itineraryId && t.itineraryId === primary.itineraryId) continue;  // same itinerary = same work day, not a rescue
        assists.push({
          helperId: t.transporterId,
          helperName: nameOf(t.transporterId),
          routeCode: r.routeCode,
          serviceAreaId: r.serviceAreaId || null,
          driverId: primary.transporterId,
          driverName: nameOf(primary.transporterId),
          completedStops: doneOf(t),
          totalStops: stopsOf(t),
        });
      }
    }
    return { assists, ownRoute, routeCount, areas: [...areas] };
  }

  // Update a stored day from one route-summaries response. Each response is a
  // full picture of the station for that day (helpers stay listed after they
  // finish), so it replaces what was saved for the stations it covers. Only
  // the time each assist was first seen is carried over.
  // Returns true if anything changed.
  function merge(day, extracted, now) {
    const before = JSON.stringify([day.assists, day.ownRoutes, day.routeCount]);
    const covered = new Set(extracted.areas || []);
    const old = day.assists || {};
    const assists = {};
    for (const [k, a] of Object.entries(old)) {
      // keep other stations' entries; drop this station's (and pre-fix entries with no station)
      if (a.serviceAreaId && !covered.has(a.serviceAreaId)) assists[k] = a;
    }
    for (const a of extracted.assists) {
      const key = a.helperId + '|' + a.routeCode;
      assists[key] = Object.assign({}, a, { firstSeen: old[key]?.firstSeen || now });
    }
    day.assists = assists;
    const ownRoutes = {};
    for (const id of new Set(Object.values(assists).map(a => a.helperId))) {
      const own = extracted.ownRoute[id] || day.ownRoutes?.[id];
      if (own) ownRoutes[id] = own;
    }
    day.ownRoutes = ownRoutes;
    day.routeCount = extracted.routeCount;
    day.version = HISTORY_VERSION;
    const changed = JSON.stringify([day.assists, day.ownRoutes, day.routeCount]) !== before;
    if (changed) day.updatedAt = now;
    return changed;
  }

  // History saved before version 2 used a different rule for who owned a
  // route and never dropped stale entries. It can all be reloaded from
  // Cortex, so discard it (type overrides are kept).
  function migrate(storage, done) {
    storage.get(null, d => {
      if (d.histVersion === HISTORY_VERSION) return done && done(false);
      const stale = Object.keys(d).filter(k => k.startsWith(KEY_PREFIX) && d[k]?.version !== HISTORY_VERSION);
      storage.remove(stale.concat('histAutoBackfill', 'histBackfill', 'histBackfillRequest'), () => {
        storage.set({ histVersion: HISTORY_VERSION }, () => done && done(true));
      });
    });
  }

  function autoType(assists, ownRoute) {
    const real = assists.filter(a => a.totalStops > PICKUP_MAX_STOPS);
    if (!real.length) return 'pickup';
    if (ownRoute && ownRoute.totalStops >= OWN_ROUTE_MIN_STOPS) return 'rescue';
    return 'sweeper';
  }

  // → [{ id, name, type, autoType, overridden, ownRoute, totalStops, completedStops, assists[] }]
  function summarizeDay(day, overrides) {
    const byHelper = {};
    for (const a of Object.values(day.assists || {})) {
      (byHelper[a.helperId] ||= []).push(Object.assign({}, a, { tiny: a.totalStops <= PICKUP_MAX_STOPS }));
    }
    const out = [];
    for (const [id, assists] of Object.entries(byHelper)) {
      assists.sort((a, b) => (a.firstSeen || 0) - (b.firstSeen || 0));
      const ownRoute = day.ownRoutes?.[id] || null;
      const auto = autoType(assists, ownRoute);
      const ov = overrides?.[id];
      out.push({
        id,
        name: assists[assists.length - 1].helperName,
        type: ov || auto,
        autoType: auto,
        overridden: !!ov && ov !== auto,
        ownRoute,
        totalStops: assists.reduce((s, a) => s + a.totalStops, 0),
        completedStops: assists.reduce((s, a) => s + a.completedStops, 0),
        assists,
      });
    }
    out.sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || b.totalStops - a.totalStops);
    return out;
  }

  // Real rescues only: pickup helpers and 1–2 stop assists are left out.
  function rescuedTally(days, overridesByDate) {
    const t = {};
    for (const day of days) {
      for (const h of summarizeDay(day, overridesByDate[day.date])) {
        if (h.type === 'pickup') continue;
        for (const a of h.assists) {
          if (a.tiny) continue;
          const key = a.driverId || a.driverName;
          const d = (t[key] ||= { id: key, name: a.driverName, rescues: 0, stops: 0, days: new Set(), lastDate: '', by: {} });
          d.name = a.driverName !== 'Unknown' ? a.driverName : d.name;
          d.rescues++;
          d.stops += a.totalStops;
          d.days.add(day.date);
          if (day.date > d.lastDate) d.lastDate = day.date;
          d.by[h.name] = (d.by[h.name] || 0) + 1;
        }
      }
    }
    return Object.values(t)
      .map(d => Object.assign(d, { dayCount: d.days.size }))
      .sort((a, b) => b.dayCount - a.dayCount || b.rescues - a.rescues || b.stops - a.stops);
  }

  function helperTally(days, overridesByDate) {
    const t = {};
    for (const day of days) {
      for (const h of summarizeDay(day, overridesByDate[day.date])) {
        const d = (t[h.id] ||= { id: h.id, name: h.name, sweeper: 0, rescue: 0, pickup: 0, routes: 0, stops: 0, lastDate: '' });
        d.name = h.name !== 'Unknown' ? h.name : d.name;
        d[h.type]++;
        if (h.type !== 'pickup') {
          d.routes += h.assists.filter(a => !a.tiny).length;
          d.stops += h.assists.filter(a => !a.tiny).reduce((s, a) => s + a.totalStops, 0);
        }
        if (day.date > d.lastDate) d.lastDate = day.date;
      }
    }
    return Object.values(t).sort((a, b) => b.stops - a.stops || b.routes - a.routes);
  }

  root.DSPHistory = {
    PICKUP_MAX_STOPS, OWN_ROUTE_MIN_STOPS, KEY_PREFIX, OVERRIDES_KEY, TYPES,
    HISTORY_VERSION, migrate,
    STEP_KEY: 'histStepper',              // progress of a "load past days" run (content.js)
    STEP_REQUEST_KEY: 'histStepRequest',  // { days, force, at } written by the history page
    emptyDay, extract, merge, summarizeDay, rescuedTally, helperTally, responseDate, namesFrom,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
