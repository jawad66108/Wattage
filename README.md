# Wattage

A planner built around scheduled power cuts (load-shedding). Set your area's
outage windows once; Wattage reschedules your tasks into the hours you'll
actually have power, flags what won't fit, and tracks which tasks need mains
power vs. a charged device. **Fully offline-first** — it has to work when
both the grid and your router are down, since that's the entire premise.

Built for [RevenueCat Shipaton 2026](https://shipaton.revenuecat.com), Next
Gen (student) track.

## Why this exists

Most planner apps assume power and connectivity are constants. In areas with
scheduled load-shedding, they aren't — and "just reschedule around it in your
head" is exactly the kind of manual, error-prone task software should be
doing for you. Free tier covers one area with manual schedule entry; Pro
unlocks multiple areas, cross-device sync, a home-screen widget, and
battery-budget planning.

**Deliberate non-goal:** Wattage does not scrape any utility's published
outage timetable. Schedules are entered manually or from presets. Scraping a
third-party source that can change format or go down at any time is a single
point of failure this project doesn't need, especially on a hackathon clock.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React Native + Expo (Expo Router for navigation) |
| Storage | expo-sqlite, fully local — no backend, no network calls |
| Monetization | RevenueCat (`react-native-purchases`) |
| Notifications | expo-notifications (on-device, pre-outage warnings) |
| Scheduling logic | Plain TypeScript, no library — see `core/scheduler.ts` |
| Build | EAS Build → internal-distribution APK (no Play Console needed) |

## If this is your first React Native project

A few things that trip up people coming from web React (this was written
with that jump in mind):

- **No DOM.** `<div>`/`<span>`/`<p>` don't exist. Layout uses `<View>` and
  `<Text>` — and text content on native code **must** be inside a `<Text>`,
  unlike web where stray strings in JSX just render.
- **Flexbox is the only layout system**, and `flexDirection: "column"` is
  the *default* on `<View>` (web's default is `row`, via CSS). No CSS files,
  no `className` — styles are JS objects via `StyleSheet.create`, and there's
  no cascade/inheritance from parent to child.
- **No `localStorage`/`sessionStorage`/cookies.** Persistent storage is
  `AsyncStorage` or, here, `expo-sqlite` for anything structured.
- **Navigation isn't the browser history API.** Expo Router (used here)
  gives you file-based routes under `app/`, similar in spirit to Next.js,
  but backed by native stack/tab navigators, not the DOM history.
- **Everything native needs a native build**, not just a JS bundle. Expo Go
  (the quick-preview app) can run *most* of this, but `react-native-purchases`
  requires native modules Expo Go doesn't include — you'll need a
  **development build** or an EAS build to test purchases at all. `expo
  start` + Expo Go is fine for iterating on UI/scheduler logic; switch to a
  dev build once you're wiring up the paywall.
- **Hot reload is Fast Refresh**, same idea as web, but a change to
  `app.json`, native config, or a newly-added native module needs a full
  rebuild, not just a refresh.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your RevenueCat keys, see below
npx expo start
```

`npx expo start` gets you the Metro bundler + QR code for Expo Go, which is
enough to iterate on everything except the paywall (see native-modules note
above).

To build something you can actually install and demo (APK, no Play Console
account needed — this is what Next Gen's waiver is for):

```bash
npx eas build --profile preview --platform android
```

That produces a downloadable `.apk` link from EAS; install it on a physical
device or emulator via `adb install` or by opening the link on-device.

## RevenueCat setup

1. Create a project in the [RevenueCat dashboard](https://app.revenuecat.com).
2. Add an Android app (and iOS if you're also targeting that). You do **not**
   need a live Play Console listing to test purchases — RevenueCat supports
   sandbox/test purchases via a properly signed test build.
3. Create an **Entitlement** called `pro` (must match `ENTITLEMENT_ID` in
   `core/purchases.ts` — change both together if you rename it).
4. Create a **Product** for the Pro unlock (one-time or subscription — a
   single non-consumable "Pro" purchase is the simplest fit here) and attach
   it to an **Offering** with a package.
5. Copy your **public** Android API key into `.env` as
   `EXPO_PUBLIC_RC_ANDROID_KEY`. Public SDK keys are safe to ship in a client
   build (that's how RevenueCat's SDK is designed), but keep them out of the
   public repo's git history anyway by loading from `.env`, which is
   gitignored — commit `.env.example`, never `.env`.

**Open question to resolve before deep paywall work:** without a Play
Console account, a real completed purchase can't be tested end-to-end.
Ask in the Shipaton Discord how deep the Next Gen judging expects the
RevenueCat integration to functionally go — a fully wired SDK with a real
fetched offering and working paywall UI (what's built here) is a reasonable
bet since judging is video/repo-based, but confirm rather than assume. This
README will be worth updating once you have an answer, so future-you (or a
judge skimming the repo) doesn't have to guess either.

## Testing

The scheduler is the one piece of logic worth trusting without reading every
line, so it has real unit tests, no RN runtime needed:

```bash
npm test
```

## Project structure

```
wattage/
├── app/                 # Expo Router screens (file-based routing)
│   ├── _layout.tsx       # root layout: RC init, onboarding gate, stack nav
│   ├── index.tsx          # "Today" — the powered-hours plan
│   ├── tasks.tsx           # add/edit tasks
│   ├── onboarding.tsx       # first-run: set outage windows
│   └── paywall.tsx           # RevenueCat offering + purchase flow
├── core/
│   ├── scheduler.ts      # pure TS scheduling algorithm (unit tested)
│   ├── scheduler.test.ts
│   ├── db.ts              # expo-sqlite wrapper, local-only
│   ├── purchases.ts        # RevenueCat init / offering / entitlement gate
│   ├── notifications.ts     # pre-outage local notification scheduling
│   └── id.ts                # local id generator
├── components/
│   ├── PowerTimeline.tsx  # the day's outage/powered hours, SVG — the
│   │                       # screenshot-worthy visual
│   └── TaskCard.tsx
├── assets/
│   ├── icon-1024.png      # placeholder — swap for real art, keep 1024x1024
│   └── screenshot-1179x2556.png  # placeholder — swap, no device frame
├── LICENSE                # MIT — GitHub auto-shows this in the About sidebar
└── README.md
```

## Before submitting to Devpost

- [ ] Repo is public, with the `LICENSE` file showing in the repo's **About**
      section (GitHub picks up a recognized license like MIT automatically —
      double check it renders after your first push).
- [ ] Replace the placeholder icon/screenshot in `assets/` with real ones —
      sizes are already correct (1024×1024 icon, 1179×2556 screenshot, no
      device frame).
- [ ] Demo video, under 2 minutes, YouTube or Vimeo, showing the app running
      **on-device** (not just a simulator, if you can help it — on-device is
      more convincing for the "meaningful progress" criterion).
- [ ] Everything customer-facing (screens, description, video) in English.
- [ ] Confirm the RevenueCat integration-depth question above in Discord.
- [ ] Double check your Devpost eligibility used the verified
      `@student.uow.edu.pk` address, not the bare `@uow.edu.pk`.
