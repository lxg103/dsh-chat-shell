# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1]

### Fixed

- A site opened during the first paint after launch could stay on “正在连接 AI
  网页…” forever: the guest was created before its container had a layout box, so
  the webview never attached and never loaded. The container is now re-laid out
  right after mount and again when the panel is shown, which is the same push a
  manual site switch used to provide.
- A site that still has not started after 15 s is rebuilt automatically, reusing
  its session so the login survives; the manual reload button only appears after
  the automatic attempts are used up.
- Switching back to Chat now revives the selected site even when the plugin was
  mounted straight into Harness mode.

## [0.5.0] — first public release

### Added

- Chat / Harness segmented switch in the window title bar, with a glass thumb
  that can be clicked **or** dragged and dropped.
- Site button (brand mark + caret) beside the switch, showing the active site and
  opening the site menu; hidden while Harness is showing.
- Three presets — DeepSeek, Doubao, ChatGPT — each in its own browser session,
  with brand marks inlined as data URLs so they render offline.
- Adding any website by URL, stored alongside the presets.
- Instant switching: sites are mounted once and toggled with CSS, so no page is
  reloaded and no streaming answer is interrupted.
- State persistence for mode, active site and the site list.
- Dark/light palettes derived from the live page and re-applied when the app
  theme changes.
- Retry affordance: a site that has not finished loading after 20 s offers a
  reload button that reuses the live browser instead of rebuilding it.
- `scripts/patch-persistent-login.mjs` — optional, documented shell patch that
  makes the embedded browser sessions persistent, so AI-website logins survive a
  restart.

### Notes

- Desktop-only: the embedded browser comes from the DSH Electron shell, and the
  plugin hides itself when that bridge is absent.
- Requires DeepSeek Harness 0.2.x; the shell line the optional patch touches is
  version-specific and the script refuses to guess.
