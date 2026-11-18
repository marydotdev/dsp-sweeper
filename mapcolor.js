/**
 * DSP Sweeper — Map colorizer (MAIN world)
 *
 * Cortex draws driver pins on a MapLibre canvas (layer "cortex-pins").
 * We capture the map instance, wrap the pins source's setData so sweeper
 * features get their fill swapped before MapLibre sees them, and report
 * hovers on sweeper pins back to content.js.
 *
 * Talks to content.js via CustomEvents on document:
 *   in:  __bbdr_sweeper_colors  detail = JSON { transporterId: "#hex" }
 *   out: __bbdr_hover           detail = JSON { tid, x, y } | null
 */
(() => {
  'use strict';

  const SOURCE = 'cortex-pins';
  const LAYERS = ['cortex-pins', 'cortex-pins-top'];

  let colors = {};
  let map = null;
  let src = null;
  let lastData = null;
  let hoverTid = null;
  let warnedUpdate = false;

  // feature key looks like "driver:<routeId>:<transporterId>"
  const tidOf = p => {
    const m = /^driver:[^:]+:(.+)$/.exec(p?.key || '');
    return m ? m[1] : null;
  };

  function recolor(data) {
    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) return data;
    if (!Object.keys(colors).length) return data;
    return {
      ...data,
      features: data.features.map(f => {
        const c = colors[tidOf(f.properties)];
        return c ? { ...f, properties: { ...f.properties, fill: c, hoverFill: c } } : f;
      }),
    };
  }

  function apply() {
    if (src && lastData && src.__bbdrOrigSetData) src.__bbdrOrigSetData(recolor(lastData));
  }

  function wrapSource(s) {
    if (s.__bbdrOrigSetData) { src = s; return; }
    const orig = s.setData.bind(s);
    s.__bbdrOrigSetData = orig;
    s.setData = (data, ...rest) => {
      lastData = (data && typeof data === 'object') ? data : null;
      return orig(recolor(data), ...rest);
    };
    if (typeof s.updateData === 'function') {
      const origUpdate = s.updateData.bind(s);
      s.updateData = (...a) => {
        if (!warnedUpdate) {
          warnedUpdate = true;
          console.warn('[DSP Sweeper] Cortex is using updateData on cortex-pins; sweeper colors may not stick.');
        }
        return origUpdate(...a);
      };
    }
    src = s;

    // Seed with whatever is already on the map
    const existing = s._data;
    if (existing && existing.type === 'FeatureCollection') {
      lastData = existing;
      apply();
    } else if (typeof s.getData === 'function') {
      Promise.resolve(s.getData()).then(d => {
        if (!lastData && d && d.type === 'FeatureCollection') { lastData = d; apply(); }
      }).catch(() => {});
    }
    console.log('[DSP Sweeper] Map pins hooked');
  }

  function emitHover(payload) {
    document.dispatchEvent(new CustomEvent('__bbdr_hover', { detail: JSON.stringify(payload) }));
  }

  // Layers may be added after the source, so bind each one once it exists
  function bindHover(m) {
    const bound = m.__bbdrHoverLayers || (m.__bbdrHoverLayers = new Set());
    const pending = LAYERS.filter(id => !bound.has(id) && m.getLayer(id));
    if (!pending.length) return;
    const onMove = e => {
      const f = e.features && e.features[0];
      const tid = tidOf(f?.properties);
      const isSw = tid && colors[tid];
      if (isSw && tid !== hoverTid) {
        hoverTid = tid;
        const r = m.getCanvas().getBoundingClientRect();
        emitHover({ tid, x: r.left + e.point.x, y: r.top + e.point.y });
      } else if (!isSw && hoverTid) {
        hoverTid = null;
        emitHover(null);
      }
    };
    const onLeave = () => { if (hoverTid) { hoverTid = null; emitHover(null); } };
    for (const id of pending) {
      bound.add(id);
      m.on('mousemove', id, onMove);
      m.on('mouseleave', id, onLeave);
    }
  }

  function tick(m) {
    if (map !== m) { map = m; src = null; }
    const s = m.getSource && m.getSource(SOURCE);
    if (s && s !== src && typeof s.setData === 'function') wrapSource(s);
    if (src) bindHover(m);
  }

  function hookLib(lib) {
    const P = lib && lib.Map && lib.Map.prototype;
    if (!P || P.__bbdrHooked || typeof P._render !== 'function') return false;
    P.__bbdrHooked = true;
    const orig = P._render;
    P._render = function (...a) {
      try { tick(this); } catch (e) {}
      return orig.apply(this, a);
    };
    return true;
  }

  // maplibregl loads after document_start, so poll for it
  if (!hookLib(window.maplibregl)) {
    const iv = setInterval(() => { if (hookLib(window.maplibregl)) clearInterval(iv); }, 250);
    setTimeout(() => clearInterval(iv), 120000);
  }

  document.addEventListener('__bbdr_sweeper_colors', e => {
    try {
      colors = JSON.parse(e.detail) || {};
      apply();
    } catch (err) {
      console.warn('[DSP Sweeper] colors parse error:', err);
    }
  });
})();
