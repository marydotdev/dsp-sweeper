#!/usr/bin/env python3
"""Builds the Chrome Web Store images for DSP Sweeper.

    python3 store/build/build.py

Renders the extension's real pages (history.html, popup.html) and real overlay
styles (overlay.css) with made-up sample data, then captures them with headless
Chrome. Output: store/screenshots/*.png (1280x800) and store/promo-small-440x280.png.
Everything under store/build/out/ is generated and can be deleted.
"""
import json, pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / 'out'
SHOTS = HERE.parent / 'screenshots'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# ───────────────────────── sample data (all names are made up) ─────────────────────────
STUB = r"""
<script>
(() => {
  const q = new URLSearchParams(location.search);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
  const at = (d, h, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();

  const P = { dana: 'Dana Reyes', priya: 'Priya Kapoor', eli: 'Eli Novak', jo: 'Jo Alvarez', theo: 'Theo Marsh', nina: 'Nina Brooks',
              marcus: 'Marcus Tate', leo: 'Leo Park', sam: 'Sam Wu', ana: 'Ana Gomez', ravi: 'Ravi Shah', kim: 'Kim Doyle' };
  const A = (d, helper, route, driver, done, total, h, m) => ({
    helperId: helper, helperName: P[helper], routeCode: route, serviceAreaId: 'area-1',
    driverId: driver, driverName: P[driver], completedStops: done, totalStops: total, firstSeen: at(d, h, m) });
  const day = (n, complete, list, own) => {
    const d = dayAgo(n), assists = {};
    for (const a of list) { const x = A(d, ...a); assists[x.helperId + '|' + x.routeCode] = x; }
    return { date: iso(d), updatedAt: Date.now() - 4 * 60000, complete, routeCount: 42, version: 2, assists, ownRoutes: own || {} };
  };
  const JO = { jo: { routeCode: 'CX127', totalStops: 168 } }, ANA = { ana: { routeCode: 'CX112', totalStops: 174 } };
  const days = [
    day(0, false, [['dana', 'CX104', 'sam', 18, 18, 11, 20], ['dana', 'CX131', 'leo', 22, 22, 13, 5], ['dana', 'CX118', 'marcus', 14, 36, 14, 41],
                   ['priya', 'CX109', 'ravi', 31, 31, 12, 10], ['priya', 'CX122', 'ana', 9, 27, 15, 2],
                   ['eli', 'CX140', 'kim', 12, 25, 14, 15], ['jo', 'CX136', 'leo', 12, 20, 14, 50], ['theo', 'CX112', 'sam', 1, 1, 13, 30]], JO),
    day(1, true, [['dana', 'CX118', 'marcus', 28, 28, 12, 40], ['dana', 'CX109', 'ravi', 16, 16, 15, 5],
                  ['priya', 'CX131', 'leo', 24, 24, 13, 15], ['eli', 'CX122', 'marcus', 19, 19, 16, 0], ['ana', 'CX140', 'kim', 21, 21, 17, 10]], ANA),
    day(2, true, [['dana', 'CX131', 'leo', 30, 30, 12, 0], ['priya', 'CX118', 'marcus', 26, 26, 14, 20], ['priya', 'CX104', 'sam', 11, 11, 16, 30],
                  ['theo', 'CX127', 'ravi', 2, 2, 15, 0]]),
    day(3, true, [['dana', 'CX122', 'marcus', 33, 33, 13, 0], ['eli', 'CX131', 'leo', 17, 17, 14, 0], ['jo', 'CX109', 'ravi', 14, 14, 16, 45]], JO),
    day(4, true, [['priya', 'CX118', 'marcus', 21, 21, 12, 30], ['dana', 'CX140', 'kim', 25, 25, 13, 10], ['eli', 'CX104', 'sam', 15, 15, 15, 40]]),
    day(6, true, [['dana', 'CX131', 'leo', 27, 27, 12, 50], ['priya', 'CX136', 'kim', 13, 13, 14, 0]]),
    day(7, true, [['dana', 'CX118', 'marcus', 19, 19, 13, 30], ['eli', 'CX112', 'ana', 23, 23, 15, 15]]),
  ];
  const today = iso(new Date());
  const store = { histVersion: 2, activeDate: today, toolbarHidden: false, sweepers: [
    { transporterId: 'dana', name: P.dana, colorIndex: 1, currentWith: { routeCode: 'CX118', driverName: P.marcus } },
    { transporterId: 'priya', name: P.priya, colorIndex: 2, currentWith: { routeCode: 'CX122', driverName: P.ana } },
    { transporterId: 'eli', name: P.eli, colorIndex: 0, currentWith: { routeCode: 'CX140', driverName: P.kim } },
  ] };
  for (const d of days) store['hist:' + d.date] = d;

  const pick = keys => keys == null ? { ...store }
    : Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, store[k]]));
  window.chrome = {
    storage: {
      local: {
        get: (keys, cb) => cb(pick(keys)),
        set: (obj, cb) => { Object.assign(store, obj); cb && cb(); },
        remove: (keys, cb) => { [].concat(keys).forEach(k => delete store[k]); cb && cb(); },
      },
      onChanged: { addListener() {} },
    },
    tabs: { query: async () => [{ id: 1, url: 'https://logistics.amazon.com/operations/execution/dv/routes' }], create() {}, sendMessage: async () => ({ visible: true }) },
    runtime: { getURL: p => p },
  };
  try { localStorage.setItem('hist-tab', q.get('tab') || 'days'); } catch {}
  addEventListener('load', () => {
    document.documentElement.style.zoom = q.get('zoom') || 1;
    document.documentElement.style.overflow = 'hidden';
    const hide = q.get('hide'); if (hide) document.querySelectorAll(hide).forEach(e => e.remove());
    const to = q.get('scroll') && document.querySelector(q.get('scroll'));
    if (to) { to.scrollIntoView(); scrollBy(0, -16); }
  });
})();
</script>
"""


def demo(name):
    """Copy an extension page into out/, pointing at the real files and adding the stub."""
    html = (ROOT / name).read_text()
    html = html.replace('<head>', '<head>\n  <base href="../../../">', 1)
    html = html.replace('<script src="history-core.js">', STUB + '<script src="history-core.js">', 1)
    (OUT / name.replace('.html', '-demo.html')).write_text(html)


# ───────────────────────── page templates ─────────────────────────
CSS = """
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600&display=swap');
* { box-sizing: border-box; }
html, body { margin: 0; width: 1280px; height: 800px; overflow: hidden; }
body { background: #faf8f4; background-image: radial-gradient(#1c1f2412 1.3px, transparent 1.3px); background-size: 20px 20px;
       font-family: 'Hanken Grotesk', system-ui, sans-serif; color: #3f444c; }
.cap { position: absolute; left: 60px; top: 34px; right: 300px; }
.cap h1 { margin: 0; font: 800 47px/1.05 'Bricolage Grotesque', sans-serif; letter-spacing: -.03em; color: #1c1f24; }
.cap h1 span { background: linear-gradient(transparent 62%, #f59e0b 62%, #f59e0b 94%, transparent 94%); }
.cap p { margin: 12px 0 0; font-size: 21px; line-height: 1.3; }
.brand { position: absolute; right: 60px; top: 44px; display: flex; align-items: center; gap: 10px;
         font: 800 22px 'Bricolage Grotesque', sans-serif; color: #1c1f24; letter-spacing: -.02em; }
.brand img { width: 40px; height: 40px; }
.note { position: absolute; right: 62px; bottom: 9px; font-size: 12px; color: #9a9485; letter-spacing: .04em; }
.win { position: absolute; left: 60px; top: 172px; width: 1150px; height: 586px; border: 2px solid #1c1f24; border-radius: 16px;
       box-shadow: 10px 10px 0 #f59e0b; overflow: hidden; background: #fff; transform: translateZ(0); }
.bar { height: 34px; background: #1c1f24; display: flex; align-items: center; gap: 7px; padding: 0 14px; }
.bar i { width: 10px; height: 10px; border-radius: 50%; background: #4a4e56; }
.bar span { margin-left: 10px; flex: 1; font: 500 12px ui-monospace, Menlo, monospace; color: #aeb3bc; background: #2b2e34; padding: 4px 12px; border-radius: 999px; }
.body { position: absolute; inset: 34px 0 0 0; }
iframe { border: 0; width: 100%; height: 100%; display: block; background: #faf8f4; }

/* stylised map */
.map { position: absolute; inset: 0; background: #ebe6da; overflow: hidden; }
.map svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.map path { fill: none; stroke-linecap: round; }
.map .water { fill: #cfe1e6; } .map .park { fill: #d9e4c6; }
.map .maj path { stroke: #fff; stroke-width: 12; } .map .min path { stroke: #f8f5ee; stroke-width: 5; }
.pin { position: absolute; transform: translate(-50%, -50%); width: 34px; height: 34px; border-radius: 50%; background: #5b8a8a; border: 2.5px solid #fff;
       box-shadow: 0 2px 5px #0000003d; color: #fff; font: 700 13px system-ui, sans-serif; display: grid; place-items: center; }
.pin.sw { width: 42px; height: 42px; font-size: 15px; z-index: 2; box-shadow: 0 3px 8px #00000055; }
.pin.hot { box-shadow: 0 0 0 5px #ffffffcc, 0 3px 10px #00000066; }
#bbdr-toolbar, #bbdr-popover, #bbdr-detail, #bbdr-tip { zoom: 1.45; }

/* popup shot */
.side { position: absolute; left: 60px; top: 270px; width: 560px; }
.side h1 { margin: 0; font: 800 64px/1 'Bricolage Grotesque', sans-serif; letter-spacing: -.035em; color: #1c1f24; }
.side h1 span { background: linear-gradient(transparent 62%, #f59e0b 62%, #f59e0b 94%, transparent 94%); }
.side p { font-size: 24px; line-height: 1.35; margin: 22px 0 0; }
.pop { position: absolute; left: 730px; top: 96px; width: 454px; height: 586px; border: 2px solid #1c1f24; border-radius: 18px;
       box-shadow: 10px 10px 0 #f59e0b; overflow: hidden; }
"""

MAP = """
<div class="map">
  <svg viewBox="0 0 1150 552" preserveAspectRatio="none">
    <path class="water" d="M-20 430 C160 380 300 470 480 450 S800 500 1170 420 V580 H-20Z"/>
    <path class="park" d="M760 40 h210 a18 18 0 0 1 18 18 v96 a18 18 0 0 1 -18 18 h-210 a18 18 0 0 1 -18 -18 v-96 a18 18 0 0 1 18 -18z"/>
    <path class="park" d="M70 250 h120 a14 14 0 0 1 14 14 v60 a14 14 0 0 1 -14 14 h-120 a14 14 0 0 1 -14 -14 v-60 a14 14 0 0 1 14 -14z"/>
    <g class="maj"><path d="M-20 160 C240 120 430 240 690 210 S1010 280 1170 240"/><path d="M370 -20 C340 150 470 280 430 580"/><path d="M-20 340 C290 360 600 300 1170 360"/></g>
    <g class="min"><path d="M130 -20 V580"/><path d="M620 -20 C640 170 580 320 650 580"/><path d="M860 -20 C890 210 830 340 920 580"/><path d="M1050 -20 V580"/>
      <path d="M-20 70 H1170"/><path d="M-20 255 C320 270 750 240 1170 290"/><path d="M215 160 L360 320"/><path d="M690 210 L860 330"/><path d="M240 -20 L250 580"/><path d="M500 60 L760 70"/></g>
  </svg>
  %s
</div>"""

PINS = [('MB', 9, 20), ('DO', 18, 12), ('CB', 27, 27), ('YS', 36, 17), ('JP', 45, 10), ('AC', 53, 24), ('PL', 62, 14), ('AP', 71, 30),
        ('ET', 12, 44), ('DZ', 22, 58), ('MR', 31, 46), ('CG', 41, 38), ('TB', 49, 52), ('AJ', 58, 42), ('MD', 67, 56), ('JO', 77, 46),
        ('SJ', 8, 68), ('ES', 26, 74), ('JH', 39, 66), ('KM', 95, 13), ('BV', 93, 36), ('DV', 85, 62)]
# name initials, colour, x%, y%
SWEEPERS = [('DR', '#3498DB', 60, 30), ('PK', '#E91E90', 29, 60), ('EN', '#9B59B6', 14, 31)]


def map_html(hot=None):
    pins = ''.join(f'<span class="pin" style="left:{x}%;top:{y}%">{t}</span>' for t, x, y in PINS)
    pins += ''.join(f'<span class="pin sw{" hot" if t == hot else ""}" style="left:{x}%;top:{y}%;background:{c}">{t}</span>' for t, c, x, y in SWEEPERS)
    return MAP % pins


HIST_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>'


def toolbar(selected=None, add_active=False, count=3):
    """Same markup as renderToolbar() in content.js."""
    dots = ''.join(f'<div class="bt-dot{" bt-dot-selected" if i == selected else ""}" style="background:{c}"></div>'
                   for i, (_, c, _, _) in enumerate(SWEEPERS))
    return (f'<div id="bbdr-toolbar"><button class="bt-reset">&#8634;</button><div class="bt-divider"></div><div class="bt-dots">{dots}</div>'
            f'<div class="bt-actions"><button class="bt-btn">{HIST_ICON}</button>'
            f'<button class="bt-btn{" active" if add_active else ""} has-badge" data-count="{count}">+</button></div></div>')


TIP = ('<div id="bbdr-tip" style="left:%dpx;top:%dpx"><div class="tip-name" style="color:#3498DB">Dana Reyes</div>'
       '<div class="tip-detail">Marcus Tate · CX118 · 14/36 stops</div><div class="tip-detail">Since 2:41 pm</div></div>')

POPOVER = '<div id="bbdr-popover"><div class="po-hdr">Add Sweeper</div>' + ''.join(
    f'<div class="po-cand"><div class="po-cand-info"><span class="po-cand-name">{n}</span><span class="po-kind po-kind-{k}">{k}</span>'
    f'<span class="po-cand-routes">{r}</span></div><div class="po-cand-actions"><button class="po-btn-yes">&#10003;</button>'
    f'<button class="po-btn-no">&#10005;</button></div></div>'
    for n, k, r in [('Nina Brooks', 'sweeper', 'CX127'), ('Jo Alvarez', 'rescue', 'CX136'), ('Theo Marsh', 'pickup', 'CX112')]) + '</div>'

COLORS = ['#9B59B6', '#3498DB', '#E91E90', '#2ECC71', '#B0B8C4', '#A3CB38', '#4834D4', '#FDA7DF', '#E74C3C', '#F39C12']
TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>'
DETAIL = (
    '<div id="bbdr-detail"><div class="dp-header"><div class="dp-header-left"><span class="dp-color-dot" style="background:#3498DB"></span>'
    '<span class="dp-name">Dana Reyes</span></div><div class="dp-header-right"><button class="dp-delete">' + TRASH + '</button>'
    '<button class="dp-close">&times;</button></div></div><div class="dp-color-picker">'
    + ''.join(f'<button class="dp-swatch{" dp-swatch-active" if i == 1 else ""}" style="background:{c}"></button>' for i, c in enumerate(COLORS))
    + '</div><div class="dp-row dp-row-active"><div class="dp-row-top"><span class="dp-route">CX118</span><span class="dp-driver">Marcus Tate</span>'
    '<span class="dp-stops">14/36</span></div><div class="dp-row-bottom"><span class="dp-time">2:41 pm (23 mins ago)</span>'
    '<span class="dp-active-badge">ACTIVE</span></div></div>'
    + ''.join(f'<div class="dp-row"><div class="dp-row-top"><span class="dp-route">{r}</span><span class="dp-driver">{d}</span>'
              f'<span class="dp-stops">{s}</span></div><div class="dp-row-bottom"><span class="dp-time">{t}</span></div></div>'
              for r, d, s, t in [('CX131', 'Leo Park', 22, '1:05 pm (1 hr 59 mins ago)'), ('CX104', 'Sam Wu', 18, '11:20 am (3 hrs 44 mins ago)')])
    + '</div>')

URL = 'logistics.amazon.com/operations/execution/dv/routes'


def page(title, sub, body, bar=URL, overlay=False):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style>
{'<link rel="stylesheet" href="../../../overlay.css">' if overlay else ''}</head><body>
<div class="cap"><h1>{title}</h1><p>{sub}</p></div>
<div class="brand"><img src="../../../icons/logo.png" alt="">DSP Sweeper</div>
<div class="win"><div class="bar"><i></i><i></i><i></i><span>{bar}</span></div><div class="body">{body}</div></div>
<div class="note">Illustration with sample data</div></body></html>"""


PAGES = {
    '1-sweepers-on-the-map': page('See every <span>sweeper</span> on the map', 'Each sweeper gets their own pin color. Hover a pin for the route, driver and stops.',
                                  map_html('DR') + TIP % (505, 60) + toolbar(), overlay=True),
    '2-helpers-detected': page('Helpers are <span>found for you</span>', 'Confirm a sweeper with one click. Rescues and pickups are labelled automatically.',
                               map_html() + POPOVER + toolbar(add_active=True), overlay=True),
    '3-sweeper-detail': page('Follow each sweeper <span>through the day</span>', 'The route they are on now, stops done, and every route they have helped. Pick any color.',
                             map_html('DR') + DETAIL + toolbar(selected=0), overlay=True),
    '4-history-by-day': page('A daily record of <span>every assist</span>', 'Who helped, on whose route, and how many stops. Saved automatically.',
                             '<iframe src="history-demo.html?zoom=1.28&scroll=.tabs"></iframe>', bar='DSP Sweeper — Sweeper History'),
    '5-most-rescued': page('See who gets <span>rescued most</span>', 'Drivers ranked by days rescued, and who helped them. Export any range to CSV.',
                           '<iframe src="history-demo.html?zoom=1.28&scroll=.tabs&tab=rescued"></iframe>', bar='DSP Sweeper — Sweeper History'),
    '6-today-summary': f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="brand" style="left:60px;right:auto"><img src="../../../icons/logo.png" alt="">DSP Sweeper</div>
<div class="side"><h1>Today at a <span>glance</span></h1><p>Click the toolbar icon for today's totals and where each sweeper is right now.</p></div>
<div class="pop"><iframe src="popup-demo.html?zoom=1.5&hide=.help"></iframe></div>
<div class="note">Illustration with sample data</div></body></html>""",
}

PROMO = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}
html, body {{ width: 440px; height: 280px; }} body {{ background-color: #f59e0b; background-image: radial-gradient(#1c1f241f 1.3px, transparent 1.3px); }}
.w {{ position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }}
.w img {{ width: 92px; height: 92px; filter: drop-shadow(0 5px 0 #00000026); }}
.w h1 {{ margin: 6px 0 4px; font: 800 44px/1 'Bricolage Grotesque', sans-serif; letter-spacing: -.035em; color: #1c1f24; }}
.w p {{ margin: 0; font: 600 17px 'Hanken Grotesk', sans-serif; color: #3d2a05; }}
.d {{ position: absolute; width: 22px; height: 22px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 5px #0000003d; }}
</style></head><body>
<i class="d" style="left:38px;top:40px;background:#3498DB"></i><i class="d" style="left:372px;top:54px;background:#E91E90"></i>
<i class="d" style="left:62px;top:206px;background:#9B59B6"></i><i class="d" style="left:392px;top:226px;background:#2ECC71"></i>
<div class="w"><img src="../../../icons/logo.png" alt=""><h1>DSP Sweeper</h1><p>Track your sweepers in Cortex</p></div></body></html>"""


def capture(html_path, png_path, w, h):
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                    '--allow-file-access-from-files', '--virtual-time-budget=6000', f'--window-size={w},{h}',
                    f'--screenshot={png_path}', html_path.as_uri()], check=True, capture_output=True)
    from PIL import Image
    img = Image.open(png_path).convert('RGB')          # the store wants 24-bit PNG with no alpha
    if img.size != (w, h):
        sys.exit(f'{png_path.name}: got {img.size}, wanted {(w, h)}')
    img.save(png_path, optimize=True)
    print('wrote', png_path.relative_to(ROOT))


def main():
    OUT.mkdir(exist_ok=True)
    SHOTS.mkdir(exist_ok=True)
    demo('history.html')
    demo('popup.html')
    for name, html in PAGES.items():
        (OUT / f'{name}.html').write_text(html)
        capture(OUT / f'{name}.html', SHOTS / f'{name}.png', 1280, 800)
    (OUT / 'promo.html').write_text(PROMO)
    capture(OUT / 'promo.html', HERE.parent / 'promo-small-440x280.png', 440, 280)


if __name__ == '__main__':
    main()
