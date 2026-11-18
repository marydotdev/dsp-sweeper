# DSP Sweeper — Chrome Extension

## What It Does

Chrome extension that adds a sweeper tracking overlay onto the Amazon Logistics Cortex route execution page. It:

- **Colors sweeper markers on the map** — each sweeper gets a distinct color applied to their Mapbox marker so you can spot them at a glance
- **Customizable colors** — pick from an 8-color palette per sweeper; colors stay unique across sweepers
- **Auto-detects helpers** — routes with multiple transporters are flagged as potential sweeper candidates
- **Tracks sweeper movement** — see which route a sweeper is currently on, how many stops they've done, and their history throughout the day
- **Map tooltips** — hover over a colored marker to see the sweeper's name, current route, driver, and stop progress

## Install

Install from the Chrome Web Store, then open `https://logistics.amazon.com/operations/execution/dv/routes`. The toolbar appears at the bottom-right of the screen.

### Developer install (unpacked)

1. Clone this folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right)
4. Click **Load unpacked** and select this folder

## Usage

### Adding Sweepers
When the extension detects helpers on multi-transporter routes, the **+** button shows a badge count. Click it to see candidates and confirm or dismiss each one.

### Viewing Sweeper Details
Click any colored dot in the toolbar to open the detail panel showing the sweeper's current route and history.

### Changing a Sweeper's Color
In the detail panel, click the colored dot next to the sweeper's name to reveal the palette, then pick a swatch. If another sweeper already uses that color, the two will swap so colors remain unique.

### Sweeper History
Click the clock icon in the toolbar to open the history page in a new tab. Days are saved from the route data Cortex loads in your tab. **Today** is saved and kept up to date while the routes page is open.

#### Adding past days

There are two ways. Both save the same data, so use whichever you prefer.

**Manually (no automation).** You browse Cortex as usual and the extension saves what it shows:

1. Open the Cortex routes page.
2. Click Cortex's date box (next to the station name, showing today's date) and pick an earlier day.
3. Wait for that day's routes to load. The extension saves the day as final, and it appears on the history page within a second or two.
4. Repeat for each day you want, then switch Cortex back to today. Looking at past days doesn't change your sweeper toolbar.

**Automatically (automates your browser).** On the history page, under *Add past days → Automatically*, choose a range and click **Load automatically…**. The page tells you how many days it will open and roughly how long that takes, and nothing happens until you click **Start automation**. Then:

- The extension **takes over your open Cortex routes tab** and changes its date to each missing day by changing `selectedDay` in the address, the same as using the date picker. It takes about 10 seconds a day.
- A banner in that tab says it's being automated and shows progress. Don't use that tab until it returns to today.
- You can **Stop** at any time, from the banner or the history page. The tab goes back to today.
- It only runs when you start it, and it never runs in the background or on a schedule.
- It uses your Cortex sign-in. Automated use of your account may be limited by Amazon's terms, so check that it fits your DSP's rules before using it. If in doubt, use the manual way.

Cortex signs each of its own requests, so the extension never calls Cortex's API itself either way. It only saves what Cortex loads in your tab.

None of this depends on who you confirm in the toolbar, and it's kept after the midnight reset.

- **By day** — each day's helpers, the routes they helped on, whose route it was, and how many stops they took
- **Most rescued** — drivers who needed help, ranked by how many days they were rescued
- **Sweepers & rescuers** — how many days each person worked as a sweeper or rescue, and their total stops
- **Export CSV** — every assist in the selected range

Helpers are sorted into three types automatically:

| Type | Rule |
|---|---|
| **Sweeper** | No route of their own (not the assigned driver on a route of 20+ stops), helps other drivers |
| **Rescue** | Is the assigned driver on a route of 20+ stops and also helped another driver |
| **Pickup** | Took only 1–2 stops in total, usually packages another driver marked missing. Shown collapsed and never counted as a rescue |

If a type is wrong, change it with the dropdown next to the helper's name; the change applies to that day only. The thresholds are `PICKUP_MAX_STOPS` and `OWN_ROUTE_MIN_STOPS` at the top of `history-core.js`. The **+** candidate list shows the same type next to each name.

A route's assigned driver comes from Cortex (`transporterIdFromRms`); anyone else on that route with stops is counted as helping that driver. How far back you can load depends on how long Cortex keeps route data.

### Reset
Click the reset icon on the left side of the toolbar to clear today's sweeper list (history is not affected). Data auto-resets at midnight (your computer's local time), including in tabs left open overnight.

### Extension Icon
Click the DSP Sweeper icon in Chrome's toolbar to open a summary of today:
- **Totals** — confirmed sweepers, rescuers, routes helped, and stops done
- **Sweepers** — each confirmed sweeper's current route, driver, and how many routes they've helped today
- **Helpers today** — everyone seen helping, typed as sweeper / rescue / pickup, with the routes they helped
- **Buttons** — show/hide the overlay (on the routes page) or open the routes page (anywhere else), plus **Full history**

## Testing

### Load the extension
1. Go to `chrome://extensions/` and turn on **Developer mode**.
2. Remove or disable any other installed copy of DSP Sweeper so they don't clash.
3. Click **Load unpacked** and select this folder.
4. Check that the card shows the expected version (from `manifest.json`) and no red **Errors** button.

### Check it in Cortex
1. Open `https://logistics.amazon.com/operations/execution/dv/routes` (reload if it was already open).
2. Confirm the toolbar appears and sweepers are tracked as before.
   - Also start on another Cortex page and click through to the routes page — the toolbar should appear without a refresh.
3. Change a sweeper's color — their pin on the map should switch to that color.
4. Hover a sweeper's pin — the tooltip should show their name, route, driver, and stop progress.
5. Change a color, then pan or zoom the map — the pin should keep its new color.
6. Reload the page — color choices should persist.
7. With helpers on the routes page, click the clock icon — the history page should open and list today's helpers. Change a helper's type and check the **Most rescued** tab updates. Then pick yesterday in Cortex's date picker and check it appears on the history page. Finally, under *Automatically*, pick **Last 7 days**, click **Load automatically…**, check the confirmation describes what will happen, click **Start automation**, and check the Cortex tab shows the automation banner, steps through the days, and returns to today. Try **Stop** partway through too.
8. Click the extension icon — the panel should show today's totals, sweepers, and helpers, matching the toolbar. On the routes page, **Hide overlay** / **Show overlay** should toggle the toolbar; from another site, **Open routes page** should open it.

### Troubleshooting
- Open the console on the Cortex page (Cmd+Option+J) and look for errors from `content.js`, `intercept.js`, or `mapcolor.js`.
- After editing any file, click the reload icon on the extension's card in `chrome://extensions/`, then reload the Cortex page. Chrome doesn't pick up changes on its own.

## Files

```
dsp-sweeper/
├── manifest.json     # Extension config (Manifest V3)
├── background.js     # Service worker (opens the history page)
├── popup.html/.js/.css    # Toolbar icon panel: today's summary
├── content.js        # Main logic — tracking, UI, marker highlighting
├── history-core.js   # Saves daily helper history and classifies sweeper / rescue / pickup
├── history.html/.js/.css  # Sweeper history page
├── intercept.js      # API response interceptor (runs in MAIN world)
├── mapcolor.js       # Recolors sweeper pins on the map, reports hovers (MAIN world)
├── overlay.css       # Toolbar, popover, detail panel, tooltip styles
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Permissions

- **storage** — persist sweeper data across page refreshes
- **unlimitedStorage** — keep months of daily history without hitting Chrome's 10 MB storage cap
- **activeTab** — read the current tab's URL when the toolbar icon panel opens

Content scripts are injected on `https://logistics.amazon.com/*` (Cortex is a single-page app, so the routes page can be reached without a page load), but the overlay only appears on `/operations/execution/dv/routes`.
