# Chrome Web Store listing — DSP Sweeper 0.3.0

Everything to paste into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) when publishing 0.3.0.
The live listing is still 0.2.2 (one screenshot, description ends at tooltips).

## 1. Package

Upload `store/dsp-sweeper-0.3.0.zip` under **Package → Upload new package**.

## 2. Store listing tab

### Description

Paste as plain text (the store does not render Markdown).

```
New in 0.3: Sweeper History. Every day is saved automatically, so you can see who swept, who got rescued, and how often. Also new: a "today" summary when you click the toolbar icon.

DSP Sweeper color-codes your sweepers on the Cortex route execution map, so you can see at a glance where each one is and whose route they're helping.

ON THE ROUTES PAGE
- Each sweeper gets their own pin color on the map. Pick any color you like.
- Helpers on multi-driver routes are detected for you. Confirm or dismiss each one with a click.
- See the route a sweeper is on now, their stops done, and every route they've helped today.
- Hover a colored pin to see the sweeper, driver, route, and stop progress.

SWEEPER HISTORY (NEW)
- By day: each helper, the routes they helped on, whose route it was, and how many stops they took.
- Most rescued: drivers ranked by how many days they needed help, and who helped them.
- Sweepers & rescuers: days worked and total stops for each person.
- Helpers are sorted automatically into sweeper (no route of their own), rescue (has their own route and helped another driver), and pickup (took only 1-2 stops). You can change a helper's type for any day.
- Export any date range to CSV.
- Add earlier days by opening them in Cortex's date picker, or let the extension step through them for you. The automatic option changes the date in your Cortex tab using your sign-in and only runs when you start it. Check that it fits your DSP's rules before using it.

TODAY AT A GLANCE (NEW)
Click the DSP Sweeper icon in Chrome's toolbar for today's totals (sweepers, routes helped, stops done) and where each sweeper is right now. You can also hide or show the overlay from there.

HOW TO USE IT
1. Open the routes page in Cortex (logistics.amazon.com). The toolbar appears in the bottom-right corner. If it doesn't, refresh the page.
2. Click + to see detected helpers, then the check mark to confirm a sweeper.
3. Click a sweeper's dot to see their routes. Click the dot next to their name to change their color.
4. Click the clock icon to open Sweeper History.

Today's sweeper list clears itself at midnight. History is kept.

PRIVACY
DSP Sweeper only reads what Cortex has already loaded in your tab. Everything is stored in Chrome on your computer. Nothing is sent anywhere.

DSP Sweeper is an independent tool and is not affiliated with or endorsed by Amazon.
```

### Graphics

| Slot | File |
|---|---|
| Screenshot 1 | `store/screenshots/1-sweepers-on-the-map.png` |
| Screenshot 2 | `store/screenshots/2-helpers-detected.png` |
| Screenshot 3 | `store/screenshots/3-sweeper-detail.png` |
| Screenshot 4 | `store/screenshots/4-history-by-day.png` |
| Screenshot 5 | `store/screenshots/5-most-rescued.png` |
| Small promo tile (440×280) | `store/promo-small-440x280.png` |

The store takes at most five screenshots. `6-today-summary.png` is a spare: swap it in for any of the five if you prefer it.

Remove the current screenshot (the blurred Cortex capture) when you add these.

The screenshots use the extension's real history page, popup, and overlay styles with made-up names and routes. The map behind the overlay is drawn, not a Cortex capture, and each image says "Illustration with sample data".

### Other fields

- **Category:** Tools (unchanged)
- **Language:** English (unchanged)
- **Homepage URL:** the website's address, once `site/` is hosted

## 3. Privacy practices tab

0.3.0 adds two permissions and widens where the scripts load, so the dashboard will ask for these again.

**Single purpose**

```
Adds a sweeper-tracking overlay to the Amazon Logistics Cortex routes page and keeps a local history of which drivers helped on which routes.
```

**storage**

```
Saves the user's confirmed sweepers, color choices, and daily helper history on their own computer so they persist across page refreshes.
```

**unlimitedStorage**

```
Daily helper history is kept for months. This avoids hitting the 10 MB local storage limit. All of it stays on the user's computer.
```

**activeTab**

```
When the user clicks the toolbar icon, the popup reads the current tab's URL to decide whether to show "Hide overlay" (on the Cortex routes page) or "Open routes page" (anywhere else).
```

**Host permission — `https://logistics.amazon.com/*`**

```
The overlay only appears on the Cortex routes page (/operations/execution/dv/routes). Cortex is a single-page app, so the scripts must load on the whole site to notice when the user navigates to the routes page without a page reload. The extension reads the route data Cortex has already loaded in the tab and makes no requests of its own.
```

**Remote code:** No, I am not using remote code.

**Data usage:** nothing collected (unchanged). Keep all three certifications ticked.

## 4. One-line summary

The line under the extension's name in the store comes from `description` in `manifest.json`. It is already updated in the zip (123 characters, limit is 132):

```
See your sweepers on the Amazon Logistics Cortex route map, track who they're helping, and keep a daily history of rescues.
```

## Rebuilding the images

```
python3 store/build/build.py
```
