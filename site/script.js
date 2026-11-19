(() => {
  // Chrome Web Store listing. Every "Add to Chrome" button links here.
  const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/dsp-sweeper/ocediifeneikminnlchobcffjiiflebk';

  document.documentElement.classList.add('js');

  // ── Install buttons ──
  document.querySelectorAll('[data-install]').forEach((a) => {
    if (CHROME_STORE_URL) {
      a.href = CHROME_STORE_URL;
      a.rel = 'noopener';
      a.hidden = false;
    }
  });

  // ── Scroll reveal ──
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach((el, i) => { el.style.transitionDelay = `${(i % 3) * 70}ms`; io.observe(el); });
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  // ── History tabs ──
  const tabs = document.querySelectorAll('.tabs [role="tab"]');
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    document.querySelectorAll('.hist .panel').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
  }));

  // ── Hero demo (sample data) ──
  const $ = (id) => document.getElementById(id);
  const pinsEl = $('pins');
  if (!pinsEl) return;

  const PALETTE = ['#3498DB', '#E91E90', '#2ECC71', '#9B59B6', '#F39C12', '#1ABC9C'];
  const ROUTES = [
    { code: 'CX104', driver: 'Sam W.', x: 14, y: 22 }, { code: 'CX109', driver: 'Leo P.', x: 31, y: 14 },
    { code: 'CX112', driver: 'Ana G.', x: 47, y: 30 }, { code: 'CX118', driver: 'Marcus T.', x: 66, y: 20 },
    { code: 'CX122', driver: 'Marcus T.', x: 84, y: 34 }, { code: 'CX127', driver: 'Ravi S.', x: 22, y: 48 },
    { code: 'CX131', driver: 'Leo P.', x: 55, y: 54 }, { code: 'CX136', driver: 'Kim D.', x: 76, y: 60 },
    { code: 'CX140', driver: 'Sam W.', x: 38, y: 68 },
  ];
  const initial = () => ({
    sweepers: [
      { name: 'Dana R.', route: 3, stops: 14 },
      { name: 'Priya K.', route: 0, stops: 31 },
    ],
    candidates: [
      { name: 'Jo A.', kind: 'rescue', route: 6, stops: 12 },
      { name: 'Eli N.', kind: 'sweeper', route: 7, stops: 8 },
    ],
    selected: 0,
    open: false,
  });
  let state = initial();

  ROUTES.forEach((r) => {
    const s = document.createElement('span');
    s.className = 'pin';
    s.style.left = `${r.x}%`; s.style.top = `${r.y}%`;
    s.textContent = r.code.slice(-2);
    s.setAttribute('aria-hidden', 'true');
    pinsEl.before(s);
  });

  const pos = (sw) => ({ x: ROUTES[sw.route].x + 4.5, y: ROUTES[sw.route].y + 6 });
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function render() {
    // pins: reuse nodes so position changes animate
    state.sweepers.forEach((sw, i) => {
      let pin = pinsEl.children[i];
      if (!pin) {
        pin = document.createElement('button');
        pin.type = 'button'; pin.className = 'pin';
        pin.addEventListener('click', () => select(i));
        pin.addEventListener('mouseenter', () => select(i));
        pinsEl.append(pin);
      }
      const p = pos(sw);
      pin.style.setProperty('--c', PALETTE[i % PALETTE.length]);
      pin.style.left = `${p.x}%`; pin.style.top = `${p.y}%`;
      pin.setAttribute('aria-label', `${sw.name}, on route ${ROUTES[sw.route].code}`);
      pin.classList.toggle('on', i === state.selected);
    });
    while (pinsEl.children.length > state.sweepers.length) pinsEl.lastChild.remove();

    const dots = $('tb-dots');
    dots.replaceChildren(...state.sweepers.map((sw, i) => {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'tb-dot' + (i === state.selected ? ' on' : '');
      d.style.setProperty('--c', PALETTE[i % PALETTE.length]);
      d.style.animation = dots.children[i] ? 'none' : '';
      d.setAttribute('aria-label', `Show ${sw.name}`);
      d.addEventListener('click', () => select(i));
      return d;
    }));

    const tip = $('tip');
    const sw = state.sweepers[state.selected];
    if (sw) {
      const r = ROUTES[sw.route], p = pos(sw);
      tip.style.setProperty('--c', PALETTE[state.selected % PALETTE.length]);
      tip.style.left = `${Math.min(Math.max(p.x, 20), 80)}%`; tip.style.top = `${p.y}%`;
      tip.innerHTML = `<b>${esc(sw.name)}</b><span>On ${r.code} · ${esc(r.driver)}</span><span>${sw.stops} ${sw.stops === 1 ? 'stop' : 'stops'} done</span>`;
    } else {
      tip.innerHTML = '';
    }

    $('tb-badge').textContent = state.candidates.length || '';
    $('tb-add').classList.toggle('active', state.open);
    const po = $('popover');
    po.hidden = !state.open;
    if (state.open) {
      po.innerHTML = '<div class="po-h">Possible sweepers</div>' + (state.candidates.length
        ? state.candidates.map((c, i) => `
          <div class="po-c">
            <div><strong>${esc(c.name)}</strong><span class="kind k-${c.kind}">${c.kind}</span>
              <small>${ROUTES[c.route].code} · ${c.stops} stops</small></div>
            <button class="po-yes" data-yes="${i}" aria-label="Confirm ${esc(c.name)}">✓</button>
            <button class="po-no" data-no="${i}" aria-label="Dismiss ${esc(c.name)}">✕</button>
          </div>`).join('')
        : '<div class="po-empty">No more candidates right now.</div>');
    }
  }

  function select(i) { if (state.selected !== i) { state.selected = i; render(); } paused = Date.now(); }

  $('tb-add').addEventListener('click', () => { state.open = !state.open; paused = Date.now(); render(); });
  $('tb-reset').addEventListener('click', () => { state = initial(); render(); });
  $('popover').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    paused = Date.now();
    if (b.dataset.yes !== undefined) {
      const [c] = state.candidates.splice(Number(b.dataset.yes), 1);
      state.sweepers.push({ name: c.name, route: c.route, stops: c.stops });
      state.selected = state.sweepers.length - 1;
    } else {
      state.candidates.splice(Number(b.dataset.no), 1);
    }
    render();
  });

  // Every few seconds one sweeper moves to another route, unless the visitor is interacting.
  let paused = 0;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!still) {
    setInterval(() => {
      if (document.hidden || Date.now() - paused < 6000 || !state.sweepers.length) return;
      const i = Math.floor(Math.random() * state.sweepers.length);
      const taken = new Set(state.sweepers.map((s) => s.route));
      const free = ROUTES.map((_, n) => n).filter((n) => !taken.has(n));
      if (!free.length) return;
      state.sweepers[i].route = free[Math.floor(Math.random() * free.length)];
      state.sweepers[i].stops = 0;
      state.selected = i;
      render();
    }, 4200);
    setInterval(() => {
      if (document.hidden) return;
      state.sweepers.forEach((s) => { s.stops += 1; });
      render();
    }, 2600);
  }

  render();
})();
