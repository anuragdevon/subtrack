# Subtrack

> Track every subscription. See exactly what you're spending. Never get surprised by a renewal.

A mobile-first PWA for managing recurring subscriptions — streaming services, SaaS tools, fitness apps, anything billed on a cycle. Works offline, syncs across devices via Firebase, installs to your home screen.

---

## Preview

```
┌─────────────────────────────────────────┐
│ Dashboard                          ☀️   │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ MONTHLY BURN                      │  │
│  │ ₹2,498                            │  │
│  │ ₹29,976/yr · 8 active             │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Monthly   Annual    Active   Paused    │
│  ₹2,498    ₹29,976     8        2       │
│                                         │
│  RENEWING SOON                          │
│  🎬 Netflix   ₹649   Monthly   3d  🔴  │
│  🛠️ Notion    ₹800   Annual   12d  🟠  │
│                                         │
│  ALL SUBSCRIPTIONS                      │
│  🎵 Spotify   ₹119   Monthly   28d     │
│  ☁️ iCloud    ₹75    Monthly   15d     │
│  …                                      │
│                                         │
│  ＋     📊        💳       📈          │
│  Add  Dashboard  Subs   Insights        │
└─────────────────────────────────────────┘
```

---

## Features

- **Dashboard** — monthly burn, annual cost, active/paused counts, renewals due in the next 30 days highlighted in red/amber
- **Add & edit** — name, emoji, amount, monthly/annual cycle, category, next renewal date, notes
- **Subscriptions view** — all subs grouped by category with per-category monthly totals
- **Insights** — spending doughnut by category, top-5 cost bar chart, per-day cost, category breakdown
- **Toggle active/pause** — one tap to exclude a subscription from totals without deleting it
- **Swipe to delete** — touch-friendly swipe left on any card, confirmed by bottom sheet modal
- **Dark / light theme** — no flash on load (theme applied before first paint)
- **Offline-first** — localStorage cache keeps the app fully usable without network
- **Firebase sync** — optional Firestore sync for real-time cross-device updates
- **Installable PWA** — add to home screen on iOS and Android, runs standalone

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Site generator | Hugo 0.124.0 | Zero-config static output, Hugo pipes for asset fingerprinting |
| Styling | Tailwind CSS (CDN) + CSS variables | No build step; CSS variables handle dark/light theming |
| Charts | Chart.js 4.4.0 (CDN) | Doughnut chart for category breakdown |
| Storage | localStorage + Firebase Firestore | localStorage is the primary store; Firestore is optional sync |
| Deploy | Netlify | Auto-deploy on push, wildcard redirect for SPA |

**No build pipeline.** Zero npm, zero bundler, zero transpilation. Hugo pipes only fingerprint the CSS and JS files. All logic is plain ES5-compatible vanilla JavaScript in a single `app.js`.

---

## Project Structure

```
subtrack/
├── assets/
│   ├── css/
│   │   └── app.css          ← CSS variable theming (dark + light), all component styles
│   └── js/
│       └── app.js           ← all app logic: state, CRUD, rendering, Firebase sync
├── layouts/
│   └── _default/
│       ├── baseof.html      ← HTML shell: CDN scripts, Hugo pipes for CSS/JS, PWA meta
│       └── index.html       ← SPA: Add, Dashboard, Subs, Insights screens + nav + modal
├── static/
│   ├── icons/
│   │   └── icon.svg         ← App icon (credit card on violet background)
│   ├── manifest.json        ← PWA manifest
│   └── sw.js                ← Service worker: cache-first CDN, network-first same-origin
├── config.toml              ← Hugo config (disables all content kinds, single home page)
└── netlify.toml             ← build command + Hugo version + wildcard SPA redirect
```

---

## Local Development

```bash
hugo server
```

Open `http://localhost:1313`. The app uses localStorage by default — no Firebase config required to run locally.

---

## Data Model

Each subscription is a plain object stored in a JSON array:

```js
{
  id:       "lp1x2abc",       // uid() — Date.now().toString(36) + random suffix
  name:     "Netflix",
  emoji:    "🎬",
  amount:   649,              // always the billed amount (not normalised)
  cycle:    "monthly",        // "monthly" | "annual"
  renewsOn: "2026-06-15",     // next renewal date, "YYYY-MM-DD"
  category: "Streaming",      // one of the 10 predefined categories
  active:   true,             // false = paused, excluded from totals
  notes:    "",               // optional free-text
}
```

Monthly cost is computed as: `cycle === "annual" ? amount / 12 : amount`  
Annual cost is computed as: `cycle === "annual" ? amount : amount * 12`

The full array is stored under `localStorage` key `st_data_v1` and, when Firebase is configured, mirrored to Firestore at `subs/data → { items: [...] }`.

---

## Firebase Setup (optional)

Firebase adds real-time sync and cross-device persistence. Without it the app works fully offline using localStorage.

**1. Create a Firebase project**

Go to [console.firebase.google.com](https://console.firebase.google.com) → New project → name it `subtrack`.

**2. Enable Firestore**

Firestore Database → Create database → Start in test mode.

**3. Register a web app and copy the config**

Project Settings → Your apps → Add app → Web → copy the `firebaseConfig` object.

**4. Paste the config into `assets/js/app.js`**

```js
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",
  authDomain:        "subtrack-xxxx.firebaseapp.com",
  projectId:         "subtrack-xxxx",
  storageBucket:     "subtrack-xxxx.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...",
};
```

**5. Set Firestore security rules**

Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /subs/{doc} {
      allow read, write: if true;
    }
  }
}
```

Tighten the rules (add auth checks) before sharing the URL publicly.

**6. Commit and push** — Netlify redeploys automatically.

---

## Deploy to Netlify

**1. Import the repo**

[app.netlify.com](https://app.netlify.com) → Add new site → Import from Git → select `anuragdevon/subtrack`.

**2. Build settings** (picked up automatically from `netlify.toml`)

| Setting | Value |
|---|---|
| Build command | `hugo --minify` |
| Publish directory | `public` |
| Hugo version | `0.124.0` |

**3. Deploy**

Netlify builds and assigns a URL like `subtrack.netlify.app`. Rename it under Site settings → Domain management.

Every push to `main` triggers a redeploy.

---

## Screens

| Screen | Nav key | What it shows |
|---|---|---|
| Add | ＋ | Form to add or edit a subscription |
| Dashboard | 📊 | Monthly burn hero, stat grid, upcoming renewals, full list |
| Subs | 💳 | All subscriptions grouped by category |
| Insights | 📈 | Doughnut chart, top-5 bar chart, per-day cost, category table |

---

## Keyboard / Touch Interactions

| Interaction | Action |
|---|---|
| Tap a subscription card | Open edit form |
| Tap ● / ○ toggle | Pause or resume subscription |
| Swipe card left | Reveal delete action, confirm in modal |
| Tap theme icon | Toggle dark / light |

---

## Roadmap

- [ ] Renewal push notifications (Web Push API)
- [ ] CSV export
- [ ] Currency selector (USD, EUR, GBP …)
- [ ] Shared mode — track subscriptions across two people (like finance-tracker)
- [ ] Annual savings calculator — show how much you'd save cancelling inactive subs

---

## License

MIT
