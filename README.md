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

### Reset
Click the reset icon on the left side of the toolbar to clear all sweeper data. Data auto-resets each day.

## Testing

### Load the extension
1. Go to `chrome://extensions/` and turn on **Developer mode**.
2. Remove or disable any other installed copy of DSP Sweeper so they don't clash.
3. Click **Load unpacked** and select this folder.
4. Check that the card shows the expected version (from `manifest.json`) and no red **Errors** button.

### Check it in Cortex
1. Open `https://logistics.amazon.com/operations/execution/dv/routes` (reload if it was already open).
2. Confirm the toolbar appears and sweepers are tracked as before.
3. Change a sweeper's color — their pin on the map should switch to that color.
4. Hover a sweeper's pin — the tooltip should show their name, route, driver, and stop progress.
5. Change a color, then pan or zoom the map — the pin should keep its new color.
6. Reload the page — color choices should persist.

### Troubleshooting
- Open the console on the Cortex page (Cmd+Option+J) and look for errors from `content.js`, `intercept.js`, or `mapcolor.js`.
- After editing any file, click the reload icon on the extension's card in `chrome://extensions/`, then reload the Cortex page. Chrome doesn't pick up changes on its own.

## Files

```
dsp-sweeper/
├── manifest.json     # Extension config (Manifest V3)
├── content.js        # Main logic — tracking, UI, marker highlighting
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

Content scripts run only on `https://logistics.amazon.com/operations/execution/dv/routes*`.
