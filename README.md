<p align="center"><img src="icons/logo.svg" width="112" alt="Moatie, the Deep Moat mascot"></p>

# Deep Moat

A private, fast site blocker for Chromium. No tracking, no network requests, no dependencies.

- **Groups.** Each group has its own sites, schedule, focus toggle and daily budget.
- **Patterns.** Use `reddit.com` to block a domain and its subdomains, `youtube.com/shorts` to block a path, or a bare word like `doomscroll` to block any URL containing that keyword.
- **Allowlist mode.** While the group is active, everything except its sites is blocked.
- **Schedules.** One window per line, e.g. `mon-fri 09:00-17:00`, `sat,sun 10:00-12:00`, `daily 00:00-24:00`. Overnight windows such as `sun 22:00-02:00` work too.
- **Focus sessions.** A pomodoro cycle (25/5 by default) with a stated intention, a badge countdown and a notification at each phase change. Rest never lifts a scheduled block, and a session can only be stopped during rest.
- **Daily budgets.** Minutes per day on a group's sites, counted only while the window is focused and you're active. When the budget runs out, the group blocks for the rest of the day.
- **Break glass.** To get through a block, type a random string by hand (pasting is rejected), then wait out a timer that only runs while the tab is visible. The wait doubles with each use that day. The override applies only to the site you broke through, for a few minutes.
- **Shortcut.** `Alt+Shift+P` starts or stops a focus session.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this directory.
3. Optionally, enable **Allow in Incognito** in the extension's details.

## Design

- **Blocking.** Uses `declarativeNetRequest` regex rules. Chromium redirects before the request leaves the browser, so there's no content script, no flash of the page and no per-page cost.
- **Service worker.** Event-driven. It computes the next moment anything can change (a schedule edge, a pomodoro phase, an override expiring, a budget running out, midnight), sets one alarm for then, and sleeps.
- **`core.js`.** All logic lives here as pure functions. The DNR rules and the in-page `match()` are generated from the same pattern regexes, and a test checks that they agree.
- **Privacy.** State lives in `chrome.storage.local` and never syncs. Budget usage is kept only for the current day.

## Develop

```sh
npm test               # node --test, no dependencies
./icons/build.sh       # re-render PNG icons from logo.svg (needs rsvg-convert)
```
