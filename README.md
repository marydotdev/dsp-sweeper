# DSP Sweeper — Chrome Extension

## What It Does

Chrome extension that adds a sweeper tracking overlay onto the Amazon Logistics Cortex route execution page. It:

- **Colors sweeper markers on the map** — each sweeper gets a distinct color applied to their Mapbox marker so you can spot them at a glance
- **Auto-detects helpers** — routes with multiple transporters are flagged as potential sweeper candidates
- **Tracks sweeper movement** — see which route a sweeper is currently on, how many stops they've done, and their history throughout the day
- **Map tooltips** — hover over a colored marker to see the sweeper's name, current route, driver, and stop progress

## Install

1. Download or clone this folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right)
4. Click **Load unpacked** and select this folder
5. Navigate to `https://logistics.amazon.com/operations/execution/dv/routes`

The toolbar appears at the bottom-right of the screen.

## Usage

### Adding Sweepers
When the extension detects helpers on multi-transporter routes, the **+** button shows a badge count. Click it to see candidates and confirm or dismiss each one.

### Viewing Sweeper Details
Click any colored dot in the toolbar to open the detail panel showing the sweeper's current route and history.

### Reset
Click the reset icon on the left side of the toolbar to clear all sweeper data. Data auto-resets each day.

## Files

```
dsp-sweeper/
├── manifest.json     # Extension config (Manifest V3)
├── content.js        # Main logic — tracking, UI, marker highlighting
├── intercept.js      # API response interceptor (runs in MAIN world)
├── overlay.css       # Toolbar, popover, detail panel, tooltip styles
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Permissions

- **storage** — persist sweeper data across page refreshes
- **activeTab** — access the current tab
- **Host permission** — scoped to `logistics.amazon.com` only
