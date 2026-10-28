/**
 * dsh-chat-shell — browser half.
 *
 * Paints a glass segmented switch into the window title bar:
 *
 *     [ ⬤ ▾ ]        Chat | Harness
 *
 * Harness is the untouched DeepSeek Harness interface. Chat covers the content
 * area with a real browser (<webview>) pointed at one of the configured AI
 * websites, and keeps every site mounted, so switching back and forth never
 * reloads a page and never interrupts an answer that is still streaming.
 *
 * The webview carrier comes from the DSH desktop shell:
 *
 *     window.dshDesktop.browser.acquire(workspace) -> { lease, partition }
 *
 * The shell only attaches a webview whose src is `about:blank#<lease>` and it
 * overwrites the web preferences itself; this file never tries to relax them.
 * When the bridge is missing (the browser-hosted DSH), the switch hides itself.
 */
window.__ModuleLoader__.load({
  id: "dsh-chat-shell",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    // ---------------------------------------------------------------- constants

    var STORE_KEY = "dsh-chat-shell:state";
    var CSS_ID = "dsh-chat-shell-style";

    var PRESET_SITES = [
      { id: "deepseek", label: "DeepSeek", url: "https://chat.deepseek.com/" },
      { id: "doubao", label: "豆包", url: "https://www.doubao.com/chat/" },
      { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" }
    ];

    var CSS = [
      ".chat-shell-panel{position:fixed;inset:0;z-index:1050;display:flex;flex-direction:column;padding-top:40px;box-sizing:border-box;background:var(--cs-bg);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s ease,visibility .2s ease}",
      ".chat-shell-panel.chat-shell-open{opacity:1;visibility:visible;pointer-events:auto}",
      ".chat-shell-sites{position:fixed;top:5px;right:110px;z-index:1200;-webkit-app-region:no-drag;transition:opacity .16s ease,transform .16s ease}",
      ".chat-shell-sites.chat-shell-sites-hidden{opacity:0;transform:translateX(-8px);pointer-events:none}",
      ".chat-shell-site-btn{display:flex;align-items:center;gap:4px;height:28px;padding:0 9px;border-radius:999px;border:1px solid var(--cs-glass-border);background:var(--cs-pill);color:var(--cs-fg);cursor:pointer;backdrop-filter:blur(20px) saturate(1.6);-webkit-backdrop-filter:blur(20px) saturate(1.6);box-shadow:0 1px 6px rgba(0,0,0,.16)}",
      ".chat-shell-site-btn:hover{background:var(--cs-hover)}",
      ".chat-shell-logo{position:relative;display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center;font:600 11px/1 system-ui,'Microsoft YaHei',sans-serif;border-radius:5px;overflow:hidden}",
      ".chat-shell-logo-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;box-sizing:border-box}",
      ".chat-shell-logo-letter{font:600 11px/1 system-ui,'Microsoft YaHei',sans-serif;opacity:.9;color:var(--cs-fg)}",
      ".chat-shell-site-btn-empty .chat-shell-logo-letter{opacity:.55}",
      ".chat-shell-caret{font-size:9px;opacity:.6}",
      ".chat-shell-menu{position:absolute;top:34px;right:0;min-width:210px;padding:5px;border-radius:12px;border:1px solid var(--cs-border);background:var(--cs-pill);box-shadow:var(--cs-menu-shadow);display:none;z-index:5}",
      ".chat-shell-menu.chat-shell-menu-open{display:block}",
      ".chat-shell-menu-icon{width:16px;height:16px;flex:none;object-fit:contain;border-radius:3px}",
      ".chat-shell-item-label{flex:1;text-align:left}",
      ".chat-shell-check{opacity:.65;font-size:11px}",      ".chat-shell-item{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:var(--cs-fg);font:500 13px/1.3 system-ui,'Microsoft YaHei',sans-serif;text-align:left;cursor:pointer}",
      ".chat-shell-item:hover{background:var(--cs-hover)}",
      ".chat-shell-item.chat-shell-current{background:var(--cs-active)}",
      ".chat-shell-dot{width:6px;height:6px;border-radius:999px;background:currentColor;opacity:.5;flex:none}",
      ".chat-shell-item.chat-shell-current .chat-shell-dot{opacity:1}",
      ".chat-shell-sep{height:1px;margin:5px 6px;background:var(--cs-border)}",
      ".chat-shell-add{display:none;padding:6px 6px 4px;gap:6px;flex-direction:column}",
      ".chat-shell-add.chat-shell-add-open{display:flex}",
      ".chat-shell-input{height:30px;padding:0 9px;border-radius:8px;border:1px solid var(--cs-border);background:transparent;color:var(--cs-fg);font:400 12.5px/1 system-ui,'Microsoft YaHei',sans-serif;outline:none;width:100%;box-sizing:border-box}",
      ".chat-shell-add-actions{display:flex;gap:6px;justify-content:flex-end}",
      ".chat-shell-mini{height:26px;padding:0 10px;border-radius:7px;border:1px solid var(--cs-border);background:transparent;color:var(--cs-fg);font:500 12px/1 system-ui,'Microsoft YaHei',sans-serif;cursor:pointer}",
      ".chat-shell-mini.chat-shell-primary{background:var(--cs-active);border-color:transparent}",
      ".chat-shell-body{position:relative;flex:1;min-height:0;display:flex}",
      ".chat-shell-view{position:absolute;inset:0;display:none}",
      ".chat-shell-view.chat-shell-view-active{display:flex}",
      ".chat-shell-guest{flex:1;min-width:0;min-height:0;width:100%;height:100%;border:0;display:flex;background:var(--cs-bg)}",
      ".chat-shell-status{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font:13px/1.7 system-ui,'Microsoft YaHei',sans-serif;padding:24px;text-align:center;pointer-events:none;color:var(--cs-muted)}",
      ".chat-shell-status-title{font-size:15px;font-weight:600;color:var(--cs-fg)}",
      ".chat-shell-status-detail{opacity:.72;max-width:520px;word-break:break-all}",
      ".chat-shell-retry{display:none;align-items:center;justify-content:center;height:34px;padding:0 20px;margin-top:4px;border-radius:999px;border:1px solid var(--cs-border);background:var(--cs-glass);color:var(--cs-fg);font:500 13px/1 system-ui,'Microsoft YaHei',sans-serif;cursor:pointer}",
      ".chat-shell-retry:hover{background:var(--cs-glass-highlight)}",
      ".chat-shell-empty{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;font:13px/1.7 system-ui,'Microsoft YaHei',sans-serif;text-align:center;padding:24px}",
      ".chat-shell-empty.chat-shell-empty-open{display:flex}",
      ".chat-shell-empty-title{font:600 26px/1.4 system-ui,'Microsoft YaHei',sans-serif;color:var(--cs-fg)}",
      ".chat-shell-empty-detail{color:var(--cs-muted);max-width:560px}",
      ".chat-shell-chips{display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;justify-content:center}",
      ".chat-shell-chip{height:38px;padding:0 22px;border-radius:999px;border:1px solid var(--cs-border);background:transparent;color:var(--cs-fg);font:500 13.5px/1 system-ui,'Microsoft YaHei',sans-serif;cursor:pointer}",
      ".chat-shell-chip:hover{background:var(--cs-hover)}",
      ".chat-shell-pill{position:fixed;top:5px;left:50%;transform:translateX(-50%);z-index:1200;display:flex;align-items:center;padding:2px;border-radius:999px;border:1px solid var(--cs-glass-border);background:var(--cs-pill);backdrop-filter:blur(22px) saturate(1.7);-webkit-backdrop-filter:blur(22px) saturate(1.7);box-shadow:var(--cs-shadow),inset 0 1px 0 var(--cs-glass-highlight);-webkit-app-region:no-drag;touch-action:none;user-select:none;cursor:default}",
      ".chat-shell-thumb{position:absolute;top:2px;bottom:2px;left:2px;width:0;border-radius:999px;background:var(--cs-glass);background-image:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,0) 62%);border:1px solid var(--cs-glass-border);backdrop-filter:blur(14px) saturate(1.5);-webkit-backdrop-filter:blur(14px) saturate(1.5);box-shadow:0 1px 6px rgba(0,0,0,.24),inset 0 1px 0 var(--cs-glass-highlight);transition:transform .26s cubic-bezier(.32,.72,0,1);pointer-events:none}",
      ".chat-shell-tab{appearance:none;-webkit-appearance:none;position:relative;z-index:1;border:0;background:transparent;color:var(--cs-fg);font:500 12px/1 system-ui,'Microsoft YaHei',sans-serif;padding:7px 18px;border-radius:999px;cursor:pointer;text-align:center;white-space:nowrap;box-sizing:border-box;transition:opacity .18s ease}",
      ".chat-shell-tab:hover{color:var(--cs-fg)}",
      ".chat-shell-tab.chat-shell-active{color:var(--cs-fg)}",
      ".chat-shell-tab:not(.chat-shell-active){opacity:.55}"
    ].join("");

    // ----------------------------------------------------------------- helpers


    function rgb(value) {
      var match = /rgba?\(([^)]+)\)/.exec(value || "");
      if (!match) return null;
      var parts = match[1].split(",").map(function (part) {
        return parseFloat(part);
      });
      if (parts.length < 3 || parts.some(isNaN)) return null;
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }

    /**
     * Read the surface colour the app actually painted, then derive a small
     * palette from its luminance. Guessing a theme token is not reliable across
     * themes and skins.
     */
    function opaqueColour(value) {
      var parsed = rgb(value);
      return parsed !== null && parsed !== undefined && parsed.a > 0 ? parsed : null;
    }

    function luma(colour) {
      return (0.299 * colour.r + 0.587 * colour.g + 0.114 * colour.b) / 255;
    }

    function surface() {
      var probe = opaqueColour(getComputedStyle(document.body).backgroundColor);
      if (probe === null) {
        probe = opaqueColour(getComputedStyle(document.documentElement).backgroundColor);
      }

      var dark;
      var base;
      if (probe !== null) {
        base = probe;
        dark = luma(base) < 0.5;
      } else {
        // Some skins paint through a wrapper and leave <body> transparent. The
        // text colour flips with the theme, so it still tells light from dark.
        var text =
          opaqueColour(getComputedStyle(document.body).color) ||
          opaqueColour(getComputedStyle(document.documentElement).color);
        dark = text !== null && text !== undefined && luma(text) > 0.5;
        base = dark ? { r: 24, g: 24, b: 27, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
      }

      var background = "rgb(" + base.r + "," + base.g + "," + base.b + ")";
      return {
        dark: dark,
        background: background,
        foreground: dark ? "#e9e9ec" : "#1f1f22",
        border: dark ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.14)",
        pill: dark ? "rgba(32,32,36,.52)" : "rgba(15,23,42,.06)",
        hover: dark ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.05)",
        active: dark ? "rgba(255,255,255,.20)" : "rgba(0,0,0,.07)",
        glass: dark ? "rgba(255,255,255,.10)" : "rgba(255,255,255,1)",
        glassBorder: dark ? "rgba(255,255,255,.14)" : "rgba(15,23,42,.10)",
        glassHighlight: dark ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.95)",
        muted: dark ? "rgba(233,233,236,.66)" : "rgba(31,31,34,.62)",
        shadow: dark ? "0 2px 12px rgba(0,0,0,.22)" : "0 2px 12px rgba(15,23,42,.12)",
        menuShadow: dark ? "0 10px 28px rgba(0,0,0,.28)" : "0 10px 28px rgba(15,23,42,.16)"
      };
    }

    function readState() {
      var fallback = { mode: "harness", active: null, sites: PRESET_SITES.slice() };
      var stored;
      try {
        stored = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      } catch (error) {
        return fallback;
      }
      if (!stored || typeof stored !== "object") return fallback;

      var sites = PRESET_SITES.map(function (preset) {
        var saved = (stored.sites || []).filter(function (site) {
          return site && site.id === preset.id;
        })[0];
        return { id: preset.id, label: preset.label, url: (saved && saved.url) || preset.url };
      });
      (stored.sites || []).forEach(function (site) {
        if (!site || !site.id || !site.url) return;
        var known = sites.some(function (entry) {
          return entry.id === site.id;
        });
        if (!known) sites.push({ id: site.id, label: site.label || site.id, url: site.url });
      });

      var active =
        typeof stored.active === "string" &&
        sites.some(function (site) {
          return site.id === stored.active;
        })
          ? stored.active
          : null;

      return { mode: stored.mode === "chat" ? "chat" : "harness", active: active, sites: sites };
    }

    function writeState(state) {
      try {
        localStorage.setItem(
          STORE_KEY,
          JSON.stringify({ mode: state.mode, active: state.active, sites: state.sites })
        );
      } catch (error) {
        /* storage unavailable: the session keeps its state in memory */
      }
    }

    /**
     * A plain desktop Chrome UA. Electron appends `Electron/…` and the app name
     * to the default UA, and DeepSeek treats those tokens as a polluted client.
     */
    function guestUA() {
      var ua = navigator.userAgent;
      return ua
        .split(" ")
        .filter(function (token) {
          return !/electron|deepseek|dsh-desktop/i.test(token);
        })
        .join(" ");
    }

    function node(tag, className, text) {
      var element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    function hostOf(url) {
      var match = /^https?:\/\/([^/]+)/i.exec(url);
      return match ? match[1].replace(/^www\./, "") : url;
    }


    var PRESET_ICONS = {
      deepseek: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAuMDAwMDAwIiBoZWlnaHQ9IjUwLjAwMDAwMCIgdmlld0JveD0iMCAwIDUwIDUwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciCgl4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+Cgk8cGF0aCBpZD0icGF0aCIKCQlkPSJNNDguODM1NCAxMC4wNDc5QzQ4LjMyMzIgOS43OTE5OSA0OC4xMDI1IDEwLjI3OTggNDcuODAzMiAxMC41Mjc4QzQ3LjcwMDcgMTAuNjA3OSA0Ny42MTQzIDEwLjcxMTkgNDcuNTI3MyAxMC44MDc2QzQ2Ljc3OTMgMTEuNjI0IDQ1LjkwNDggMTIuMTU5NyA0NC43NjIyIDEyLjA5NTdDNDMuMDkyMyAxMiA0MS42NjYgMTIuNTM1NiA0MC40MDU4IDEzLjgzOThDNDAuMTM3NyAxMi4yMzE5IDM5LjI0NzYgMTEuMjcyIDM3Ljg5MjYgMTAuNjU1OEMzNy4xODM2IDEwLjMzNTkgMzYuNDY2OCAxMC4wMTU2IDM1Ljk3MDIgOS4zMTk4MkMzNS42MjM1IDguODIzNzMgMzUuNTI5MyA4LjI3MTk3IDM1LjM1NiA3LjcyNzU0QzM1LjI0NTYgNy4zOTk5IDM1LjEzNTMgNy4wNjM5NiAzNC43NjUxIDcuMDA3ODFDMzQuMzYzMyA2Ljk0Mzg1IDM0LjIwNTYgNy4yODc2IDM0LjA0NzkgNy41NzU2OEMzMy40MTggOC43NTE5NSAzMy4xNzMzIDEwLjA0NzkgMzMuMTk3MyAxMS4zNTk5QzMzLjI1MjQgMTQuMzEyIDM0LjQ3MzYgMTYuNjY0MSAzNi44OTk5IDE4LjMzNTlDMzcuMTc1OCAxOC41Mjc4IDM3LjI0NjYgMTguNzE5NyAzNy4xNTk3IDE5QzM2Ljk5NDYgMTkuNTc1NyAzNi43OTc0IDIwLjEzNTcgMzYuNjI0IDIwLjcxMTlDMzYuNTEzNyAyMS4wODAxIDM2LjM0ODYgMjEuMTU5NyAzNS45NjI0IDIxQzM0LjYzMDkgMjAuNDMyMSAzMy40ODEgMTkuNTkxOCAzMi40NjQ0IDE4LjU3NTdDMzAuNzM5MyAxNi44NzIxIDI5LjE3OTIgMTQuOTkxNyAyNy4yMzM0IDEzLjUyQzI2Ljc3NjQgMTMuMTc1OCAyNi4zMTkzIDEyLjg1NiAyNS44NDY3IDEyLjU1MThDMjMuODYxOCAxMC41ODQgMjYuMTA2OSA4Ljk2Nzc3IDI2LjYyNyA4Ljc3NTg4QzI3LjE3MDQgOC41NzU2OCAyNi44MTU5IDcuODg3NyAyNS4wNTkxIDcuODk2QzIzLjMwMjIgNy45MDM4MSAyMS42OTUzIDguNTAzOTEgMTkuNjQ3IDkuMzAzNzFDMTkuMzQ3NyA5LjQyMzgzIDE5LjAzMjIgOS41MTE3MiAxOC43MDk1IDkuNTgzOThDMTYuODUwMSA5LjIyMzYzIDE0LjkxOTkgOS4xNDM1NSAxMi45MDMzIDkuMzc1OThDOS4xMDU5NiA5LjgwNzYyIDYuMDcyNzUgMTEuNjM5NiAzLjg0MzI2IDE0Ljc2ODFDMS4xNjQ1NSAxOC41Mjc4IDAuNTM0MTggMjIuNzk5OCAxLjMwNjY0IDI3LjI1NTlDMi4xMTc2OCAzMS45NTIxIDQuNDY1ODIgMzUuODM5OCA4LjA3MzczIDM4Ljg3OTlDMTEuODE1OSA0Mi4wMzIyIDE2LjEyNTUgNDMuNTc2MiAyMS4wNDEgNDMuMjgwM0MyNC4wMjY5IDQzLjEwNCAyNy4zNTE2IDQyLjY5NjMgMzEuMTAxNiAzOS40NTYxQzMyLjA0NjkgMzkuOTM2IDMzLjAzOTYgNDAuMTI3OSAzNC42ODYgNDAuMjcyQzM1Ljk1NDYgNDAuMzkyMSAzNy4xNzU4IDQwLjIwOCAzOC4xMjExIDQwLjAwNzhDMzkuNjAyMSAzOS42ODggMzkuNDk5NSAzOC4yODgxIDM4Ljk2MzkgMzguMDMyMkMzNC42MjMgMzUuOTY3OCAzNS41NzYyIDM2LjgwODEgMzQuNzEgMzYuMTI3OUMzNi45MTU1IDMzLjQ2MzkgNDAuMjQwMiAzMC42OTU4IDQxLjU0IDIxLjcyOEM0MS42NDI2IDIxLjAxNjEgNDEuNTU1NyAyMC41Njc5IDQxLjU0IDE5Ljk5MTdDNDEuNTMyMiAxOS42Mzk2IDQxLjYxMDggMTkuNTAzOSA0Mi4wMDQ5IDE5LjQ2MzlDNDMuMDkyMyAxOS4zMzU5IDQ0LjE0NzkgMTkuMDMxNyA0NS4xMTY3IDE4LjQ4NzhDNDcuOTI5MiAxNi45MTk5IDQ5LjA2NCAxNC4zNDM4IDQ5LjMzMTUgMTEuMjU1OUM0OS4zNzExIDEwLjc4MzcgNDkuMzIzNyAxMC4yOTU5IDQ4LjgzNTQgMTAuMDQ3OVpNMjQuMzI2MiAzNy44Mzk4QzIwLjExOTYgMzQuNDYzOSAxOC4wNzkxIDMzLjM1MjEgMTcuMjM1OCAzMy4zOTk5QzE2LjQ0ODIgMzMuNDQ4MiAxNi41ODk4IDM0LjM2ODIgMTYuNzYzMiAzNC45Njc4QzE2Ljk0NDMgMzUuNTYwMSAxNy4xODEyIDM1Ljk2ODMgMTcuNTExNyAzNi40ODc4QzE3Ljc0MDIgMzYuODMyIDE3Ljg5NzkgMzcuMzQ0MiAxNy4yODMyIDM3LjcyOEMxNS45MjgyIDM4LjU4NCAxMy41NzI4IDM3LjQzOTkgMTMuNDYyNCAzNy4zODM4QzEwLjcyMDcgMzUuNzM1OCA4LjQyODIyIDMzLjU2MDEgNi44MTM0OCAzMC41ODRDNS4yNTM0MiAyNy43MTk3IDQuMzQ3NjYgMjQuNjQ3OSA0LjE5Nzc1IDIxLjM2NzdDNC4xNTgyIDIwLjU3NTcgNC4zODY3MiAyMC4yOTU5IDUuMTU4NjkgMjAuMTUxOUM2LjE3NTI5IDE5Ljk2IDcuMjIzMTQgMTkuOTE5OSA4LjIzOTI2IDIwLjA3MThDMTIuNTMyNyAyMC43MTE5IDE2LjE4ODUgMjIuNjcxOSAxOS4yNTI5IDI1Ljc3NTlDMjEuMDAyIDI3LjU0MzkgMjIuMzI1MiAyOS42NTU4IDIzLjY4ODUgMzEuNzIwMkMyNS4xMzc3IDMzLjkxMjEgMjYuNjk3OCAzNiAyOC42ODMxIDM3LjcxMTlDMjkuMzg0MyAzOC4zMTIgMjkuOTQzNCAzOC43NjgxIDMwLjQ3OSAzOS4xMDRDMjguODY0MyAzOS4yODgxIDI2LjE2OTkgMzkuMzI4MSAyNC4zMjYyIDM3LjgzOThaTTI2LjM0MzMgMjQuNjAwMUMyNi4zNDMzIDI0LjI0OCAyNi42MTkxIDIzLjk2NzggMjYuOTY1OCAyMy45Njc4QzI3LjA0NDQgMjMuOTY3OCAyNy4xMTUyIDIzLjk4MzkgMjcuMTc4MiAyNC4wMDc4QzI3LjI2NTEgMjQuMDQgMjcuMzQzOCAyNC4wODc5IDI3LjQwNjcgMjQuMTYwMkMyNy41MTcxIDI0LjI3MiAyNy41ODAxIDI0LjQzMjEgMjcuNTgwMSAyNC42MDAxQzI3LjU4MDEgMjQuOTUyMSAyNy4zMDQyIDI1LjIzMTkgMjYuOTU3NSAyNS4yMzE5QzI2LjYxMDggMjUuMjMxOSAyNi4zNDMzIDI0Ljk1MjEgMjYuMzQzMyAyNC42MDAxWk0zMi42MDY0IDI3Ljg3OTlDMzIuMjA0NiAyOC4wNDc5IDMxLjgwMjcgMjguMTkxOSAzMS40MTY1IDI4LjIwOEMzMC44MTc5IDI4LjIzOTcgMzAuMTY0MSAyNy45OTIyIDI5LjgwOTYgMjcuNjg4QzI5LjI1ODMgMjcuMjE1OCAyOC44NjQzIDI2Ljk1MjEgMjguNjk4NyAyNi4xMjc5QzI4LjYyNzkgMjUuNzc1OSAyOC42Njc1IDI1LjIzMTkgMjguNzMwNSAyNC45MTk5QzI4Ljg3MjEgMjQuMjQ4IDI4LjcxNDQgMjMuODE1OSAyOC4yNDk1IDIzLjQyMzhDMjcuODcxNiAyMy4xMDQgMjcuMzkxMSAyMy4wMTYxIDI2Ljg2MzMgMjMuMDE2MUMyNi42NjYgMjMuMDE2MSAyNi40ODQ5IDIyLjkyNzcgMjYuMzUxMSAyMi44NTZDMjYuMTMwNCAyMi43NDQxIDI1Ljk0OTIgMjIuNDYzOSAyNi4xMjI2IDIyLjEyMDFDMjYuMTc3NyAyMi4wMDc4IDI2LjQ0NTggMjEuNzM1OCAyNi41MDg4IDIxLjY4OEMyNy4yMjU2IDIxLjI3MiAyOC4wNTI3IDIxLjQwNzcgMjguODE2OSAyMS43MTk3QzI5LjUyNTkgMjIuMDE2MSAzMC4wNjE1IDIyLjU2MDEgMzAuODM0IDIzLjMyODFDMzEuNjIxNiAyNC4yNTU5IDMxLjc2MzIgMjQuNTExNyAzMi4yMTI0IDI1LjIwOEMzMi41NjY5IDI1Ljc1MiAzMi44OTAxIDI2LjMxMiAzMy4xMTA0IDI2Ljk1MjFDMzMuMjQ0NiAyNy4zNTIxIDMzLjA3MTMgMjcuNjgwMiAzMi42MDY0IDI3Ljg3OTlaIgoJCWZpbGw9IiM0RDZCRkUiIGZpbGwtb3BhY2l0eT0iMS4wMDAwMDAiIGZpbGwtcnVsZT0ibm9uemVybyIgLz4KPC9zdmc+",
      doubao: "data:image/png;base64,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",
      chatgpt: "data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMTgwIgogIGhlaWdodD0iMTgwIgogIHZpZXdCb3g9IjAgMCAxODAgMTgwIgogIGZpbGw9Im5vbmUiCj4KICA8c3R5bGU+CiAgICA6cm9vdCB7CiAgICAgIGZpbGw6ICMwMDA7CiAgICB9CiAgICBAbWVkaWEgKHByZWZlcnMtY29sb3Itc2NoZW1lOiBkYXJrKSB7CiAgICAgIDpyb290IHsKICAgICAgICBmaWxsOiAjZmZmOwogICAgICB9CiAgICB9CiAgPC9zdHlsZT4KICA8cGF0aAogICAgZD0iTTEwMS4yMjggMTY0LjI0N0M5Ni4yNzc2IDE2NC4yNDcgOTEuNTc1MSAxNjMuMzA3IDg3LjEyMDEgMTYxLjQyNkM4Mi42NjUxIDE1OS41NDUgNzguNzA1MSAxNTYuOTIxIDc1LjI0MDEgMTUzLjU1NUM3MS40NzgxIDE1NC44NDIgNjcuNTY3NiAxNTUuNDg2IDYzLjUwODYgMTU1LjQ4NkM1Ni44NzU2IDE1NS40ODYgNTAuNzM3NiAxNTMuODUyIDQ1LjA5NDYgMTUwLjU4NUMzOS40NTE2IDE0Ny4zMTggMzQuODk3NiAxNDIuODYzIDMxLjQzMjYgMTM3LjIyQzI4LjA2NjYgMTMxLjU3NyAyNi4zODM2IDEyNS4yOTEgMjYuMzgzNiAxMTguMzYxQzI2LjM4MzYgMTE1LjQ5IDI2Ljc3OTYgMTEyLjM3MSAyNy41NzE2IDEwOS4wMDVDMjMuNjExNiAxMDUuMzQyIDIwLjU0MjYgMTAxLjEzNSAxOC4zNjQ2IDk2LjM4MjhDMTYuMTg2NiA5MS41MzE4IDE1LjA5NzYgODYuNDgyOCAxNS4wOTc2IDgxLjIzNThDMTUuMDk3NiA3NS44ODk4IDE2LjIzNjEgNzAuNzQxOCAxOC41MTMxIDY1Ljc5MThDMjAuNzkwMSA2MC44NDE4IDIzLjk1ODEgNTYuNTg0OCAyOC4wMTcxIDUzLjAyMDhDMzIuMTc1MSA0OS4zNTc4IDM2Ljk3NjYgNDYuODMzMyA0Mi40MjE2IDQ1LjQ0NzNDNDMuNTEwNiAzOS44MDQzIDQ1Ljc4NzYgMzQuNzU1MyA0OS4yNTI2IDMwLjMwMDNDNTIuODE2NiAyNS43NDYzIDU3LjE3MjYgMjIuMTgyMyA2Mi4zMjA2IDE5LjYwODNDNjcuNDY4NiAxNy4wMzQzIDcyLjk2MzEgMTUuNzQ3MyA3OC44MDQxIDE1Ljc0NzNDODMuNzU0MSAxNS43NDczIDg4LjQ1NjYgMTYuNjg3OCA5Mi45MTE2IDE4LjU2ODhDOTcuMzY2NiAyMC40NDk4IDEwMS4zMjcgMjMuMDczMyAxMDQuNzkyIDI2LjQzOTNDMTA4LjU1NCAyNS4xNTIzIDExMi40NjQgMjQuNTA4OCAxMTYuNTIzIDI0LjUwODhDMTIzLjE1NiAyNC41MDg4IDEyOS4yOTQgMjYuMTQyMyAxMzQuOTM3IDI5LjQwOTNDMTQwLjU4IDMyLjY3NjMgMTQ1LjA4NSAzNy4xMzEzIDE0OC40NTEgNDIuNzc0M0MxNTEuOTE2IDQ4LjQxNzMgMTUzLjY0OCA1NC43MDM4IDE1My42NDggNjEuNjMzOEMxNTMuNjQ4IDY0LjUwNDggMTUzLjI1MiA2Ny42MjMzIDE1Mi40NiA3MC45ODkzQzE1Ni40MiA3NC42NTIzIDE1OS40ODkgNzguOTA5MyAxNjEuNjY3IDgzLjc2MDNDMTYzLjg0NSA4OC41MTIzIDE2NC45MzQgOTMuNTExOCAxNjQuOTM0IDk4Ljc1ODhDMTY0LjkzNCAxMDQuMTA1IDE2My43OTYgMTA5LjI1MyAxNjEuNTE5IDExNC4yMDNDMTU5LjI0MiAxMTkuMTUzIDE1Ni4wMjQgMTIzLjQ1OSAxNTEuODY2IDEyNy4xMjJDMTQ3LjgwNyAxMzAuNjg2IDE0My4wNTUgMTMzLjE2MSAxMzcuNjEgMTM0LjU0N0MxMzYuNTIxIDE0MC4xOSAxMzQuMTk1IDE0NS4yMzkgMTMwLjYzMSAxNDkuNjk0QzEyNy4xNjYgMTU0LjI0OCAxMjIuODU5IDE1Ny44MTIgMTE3LjcxMSAxNjAuMzg2QzExMi41NjMgMTYyLjk2IDEwNy4wNjkgMTY0LjI0NyAxMDEuMjI4IDE2NC4yNDdaTTY0LjU0ODEgMTQ1LjY4NUM2OS40OTgxIDE0NS42ODUgNzMuODA0NiAxNDQuNjQ1IDc3LjQ2NzYgMTQyLjU2NkwxMDUuMzg2IDEyNi41MjhDMTA2LjM3NiAxMjUuODM1IDEwNi44NzEgMTI0Ljg5NSAxMDYuODcxIDEyMy43MDdWMTEwLjkzNkw3MC45MzM2IDEzMS41NzdDNjguNzU1NiAxMzIuODY0IDY2LjU3NzYgMTMyLjg2NCA2NC4zOTk2IDEzMS41NzdMMzYuMzMzMSAxMTUuMzkxQzM2LjMzMzEgMTE1LjY4OCAzNi4yODM2IDExNi4wMzQgMzYuMTg0NiAxMTYuNDNDMzYuMTg0NiAxMTYuODI2IDM2LjE4NDYgMTE3LjQyIDM2LjE4NDYgMTE4LjIxMkMzNi4xODQ2IDEyMy4yNjEgMzcuMzcyNiAxMjcuOTE0IDM5Ljc0ODYgMTMyLjE3MUM0Mi4yMjM2IDEzNi4zMjkgNDUuNjM5MSAxMzkuNTk2IDQ5Ljk5NTEgMTQxLjk3MkM1NC4zNTExIDE0NC40NDcgNTkuMjAyMSAxNDUuNjg1IDY0LjU0ODEgMTQ1LjY4NVpNNjYuMDMzMSAxMjEuNDc5QzY2LjYyNzEgMTIxLjc3NiA2Ny4xNzE2IDEyMS45MjUgNjcuNjY2NiAxMjEuOTI1QzY4LjE2MTYgMTIxLjkyNSA2OC42NTY2IDEyMS43NzYgNjkuMTUxNiAxMjEuNDc5TDgwLjI4OTEgMTE1LjA5NEw0NC41MDA2IDk0LjMwMzhDNDIuMzIyNiA5My4wMTY4IDQxLjIzMzYgOTEuMDg2MyA0MS4yMzM2IDg4LjUxMjNWNTYuMjg3OEMzNi4yODM2IDU4LjQ2NTggMzIuMzIzNiA2MS44MzE4IDI5LjM1MzYgNjYuMzg1OEMyNi4zODM2IDcwLjg0MDggMjQuODk4NiA3NS43OTA4IDI0Ljg5ODYgODEuMjM1OEMyNC44OTg2IDg2LjA4NjggMjYuMTM2MSA5MC43Mzk4IDI4LjYxMTEgOTUuMTk0OEMzMS4wODYxIDk5LjY0OTggMzQuMzAzNiAxMDMuMDE2IDM4LjI2MzYgMTA1LjI5M0w2Ni4wMzMxIDEyMS40NzlaTTEwMS4yMjggMTU0LjQ0NkMxMDYuNDc1IDE1NC40NDYgMTExLjIyNyAxNTMuMjU4IDExNS40ODQgMTUwLjg4MkMxMTkuNzQxIDE0OC41MDYgMTIzLjEwNyAxNDUuMjM5IDEyNS41ODIgMTQxLjA4MUMxMjguMDU3IDEzNi45MjMgMTI5LjI5NCAxMzIuMjcgMTI5LjI5NCAxMjcuMTIyVjk1LjA0NjNDMTI5LjI5NCA5My44NTgzIDEyOC43OTkgOTIuOTY3MyAxMjcuODA5IDkyLjM3MzNMMTE2LjUyMyA4NS44MzkzVjEyNy4yNzFDMTE2LjUyMyAxMjkuODQ1IDExNS40MzQgMTMxLjc3NSAxMTMuMjU2IDEzMy4wNjJMODUuMTg5NiAxNDkuMjQ5QzkwLjA0MDYgMTUyLjcxNCA5NS4zODY2IDE1NC40NDYgMTAxLjIyOCAxNTQuNDQ2Wk0xMDYuODcxIDEwMC4wOTVWNzkuODk5M0w5MC4wOSA3MC4zOTUzTDczLjE2MTEgNzkuODk5M1YxMDAuMDk1TDkwLjA5IDEwOS41OTlMMTA2Ljg3MSAxMDAuMDk1Wk02My41MDg2IDUyLjcyMzhDNjMuNTA4NiA1MC4xNDk4IDY0LjU5NzYgNDguMjE5MyA2Ni43NzU2IDQ2LjkzMjNMOTQuODQyMSAzMC43NDU4Qzg5Ljk5MTEgMjcuMjgwOCA4NC42NDUxIDI1LjU0ODMgNzguODA0MSAyNS41NDgzQzczLjU1NzEgMjUuNTQ4MyA2OC44MDUxIDI2LjczNjMgNjQuNTQ4MSAyOS4xMTIzQzYwLjI5MTEgMzEuNDg4MyA1Ni45MjUxIDM0Ljc1NTMgNTQuNDUwMSAzOC45MTMzQzUyLjA3NDEgNDMuMDcxMyA1MC44ODYxIDQ3LjcyNDMgNTAuODg2MSA1Mi44NzIzVjg0Ljc5OThDNTAuODg2MSA4NS45ODc4IDUxLjM4MTEgODYuOTI4MyA1Mi4zNzExIDg3LjYyMTNMNjMuNTA4NiA5NC4xNTUzVjUyLjcyMzhaTTEzOC45NDcgMTIzLjcwN0MxNDMuODk3IDEyMS41MjkgMTQ3LjgwNyAxMTguMTYzIDE1MC42NzggMTEzLjYwOUMxNTMuNjQ4IDEwOS4wNTUgMTU1LjEzMyAxMDQuMTA1IDE1NS4xMzMgOTguNzU4OEMxNTUuMTMzIDkzLjkwNzggMTUzLjg5NiA4OS4yNTQ4IDE1MS40MjEgODQuNzk5OEMxNDguOTQ2IDgwLjM0NDggMTQ1LjcyOCA3Ni45Nzg4IDE0MS43NjggNzQuNzAxOEwxMTMuOTk5IDU4LjY2MzhDMTEzLjQwNSA1OC4yNjc4IDExMi44NiA1OC4xMTkzIDExMi4zNjUgNTguMjE4M0MxMTEuODcgNTguMjE4MyAxMTEuMzc1IDU4LjM2NjggMTEwLjg4IDU4LjY2MzhMOTkuNzQyNiA2NC45MDA4TDEzNS42OCA4NS44MzkzQzEzNi43NjkgODYuNDMzMyAxMzcuNTYxIDg3LjIyNTMgMTM4LjA1NiA4OC4yMTUzQzEzOC42NSA4OS4xMDYzIDEzOC45NDcgOTAuMTk1MyAxMzguOTQ3IDkxLjQ4MjNWMTIzLjcwN1pNMTA5LjA5OCA0OC4yNjg4QzExMS4yNzYgNDYuODgyOCAxMTMuNDU0IDQ2Ljg4MjggMTE1LjYzMiA0OC4yNjg4TDE0My44NDcgNjQuNzUyM0MxNDMuODQ3IDY0LjA1OTMgMTQzLjg0NyA2My4xNjgzIDE0My44NDcgNjIuMDc5M0MxNDMuODQ3IDU3LjMyNzMgMTQyLjY1OSA1Mi44MjI4IDE0MC4yODMgNDguNTY1OEMxMzguMDA2IDQ0LjIwOTggMTM0LjY5IDQwLjc0NDggMTMwLjMzNCAzOC4xNzA4QzEyNi4wNzcgMzUuNTk2OCAxMjEuMTI3IDM0LjMwOTggMTE1LjQ4NCAzNC4zMDk4QzExMC41MzQgMzQuMzA5OCAxMDYuMjI3IDM1LjM0OTMgMTAyLjU2NCAzNy40MjgzTDc0LjY0NjEgNTMuNDY2M0M3My42NTYxIDU0LjE1OTMgNzMuMTYxMSA1NS4wOTk4IDczLjE2MTEgNTYuMjg3OFY2OS4wNTg4TDEwOS4wOTggNDguMjY4OFoiCiAgLz4KPC9zdmc+Cg=="
    };

    function normalizeUrl(raw) {
      var value = String(raw || "").trim();
      if (!value) return null;
      if (!/^https?:\/\//i.test(value)) value = "https://" + value;
      try {
        var parsed = new URL(value);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        return parsed.toString();
      } catch (error) {
        return null;
      }
    }

    // ------------------------------------------------------------------- mount

    /**
     * Mount the switch, the site picker and one lazily created guest per site.
     * Returns a disposer so a disabled plugin leaves no DOM and no browser lease.
     */
    function mount() {
      var product = window.dshDesktop;
      var bridge =
        product !== undefined && product.protocolVersion === 1 ? product.browser : undefined;
      if (bridge === undefined) {
        return function () {};
      }

      var theme = surface();
      var state = readState();

      var style = document.createElement("style");
      style.id = CSS_ID;
      style.textContent = CSS;
      document.head.append(style);

      var root = document.documentElement;
      var applying = false;
      var applied = null;

      /** Push a palette into the CSS variables every panel rule reads. */
      function applyTheme(next) {
        if (applied !== null && applied.background === next.background && applied.dark === next.dark) {
          return;
        }
        applied = next;
        applying = true;
        theme = next;
        root.style.setProperty("--cs-bg", next.background);
        root.style.setProperty("--cs-fg", next.foreground);
        root.style.setProperty("--cs-border", next.border);
        root.style.setProperty("--cs-pill", next.pill);
        root.style.setProperty("--cs-hover", next.hover);
        root.style.setProperty("--cs-active", next.active);
        root.style.setProperty("--cs-muted", next.muted);
        root.style.setProperty("--cs-glass", next.glass);
        root.style.setProperty("--cs-glass-border", next.glassBorder);
        root.style.setProperty("--cs-glass-highlight", next.glassHighlight);
        root.style.setProperty("--cs-shadow", next.shadow);
        root.style.setProperty("--cs-menu-shadow", next.menuShadow);
        applying = false;
      }

      applyTheme(theme);

      // Clear leftovers from a previous instance that was torn down without cleanup.
      document.querySelectorAll(".chat-shell-panel,.chat-shell-sites,.chat-shell-pill").forEach(
        function (element) {
          element.remove();
        }
      );
      document.querySelectorAll("style#" + CSS_ID).forEach(function (element) {
        if (element !== style) element.remove();
      });

      var panel = node("div", "chat-shell-panel");

      var sites = node("div", "chat-shell-sites");
      var siteBtn = node("button", "chat-shell-site-btn");
      siteBtn.type = "button";
      siteBtn.title = "选择 AI 网页";
      var logoBox = node("span", "chat-shell-logo");
      var caret = node("span", "chat-shell-caret", "▾");
      siteBtn.append(logoBox, caret);

      var menu = node("div", "chat-shell-menu");
      var listBox = node("div");
      var sep = node("div", "chat-shell-sep");
      var addToggle = node("button", "chat-shell-item", "＋ 添加 AI 网页");
      addToggle.type = "button";
      var addForm = node("div", "chat-shell-add");
      var addInput = node("input", "chat-shell-input");
      addInput.type = "text";
      addInput.placeholder = "粘贴网址，例如 https://kimi.moonshot.cn";
      var addActions = node("div", "chat-shell-add-actions");
      var addCancel = node("button", "chat-shell-mini", "取消");
      addCancel.type = "button";
      var addConfirm = node("button", "chat-shell-mini chat-shell-primary", "添加");
      addConfirm.type = "button";
      addActions.append(addCancel, addConfirm);
      addForm.append(addInput, addActions);
      menu.append(listBox, sep, addToggle, addForm);
      sites.append(siteBtn, menu);

      var body = node("div", "chat-shell-body");
      var empty = node("div", "chat-shell-empty");
      var emptyTitle = node("div", "chat-shell-empty-title", "选择一个网站，开始聊天");
      var emptyDetail = node(
        "div",
        "chat-shell-empty-detail",
        "从顶部选择 AI 网页。各平台分别登录，切换后保留已打开页面。"
      );
      var chips = node("div", "chat-shell-chips");
      empty.append(emptyTitle, emptyDetail, chips);
      body.append(empty);
      panel.append(body);

      var pill = node("div", "chat-shell-pill");
      var thumb = node("div", "chat-shell-thumb");
      var tabChat = node("button", "chat-shell-tab", "Chat");
      tabChat.type = "button";
      var tabHarness = node("button", "chat-shell-tab", "Harness");
      tabHarness.type = "button";
      pill.append(thumb, tabChat, tabHarness);

      var views = {}; // site id -> { view, status, statusTitle, statusDetail, record }
      var disposed = false;

      // ------------------------------------------------------------- per site

      function viewFor(site) {
        var existing = views[site.id];
        if (existing !== undefined) return existing;

        var view = node("div", "chat-shell-view");
        var status = node("div", "chat-shell-status");
        var statusTitle = node("div", "chat-shell-status-title", "正在连接 AI 网页…");
        var statusDetail = node("div", "chat-shell-status-detail", site.url);
        var retry = node("button", "chat-shell-retry", "重新加载");
        retry.type = "button";
        status.append(statusTitle, statusDetail, retry);
        view.append(status);
        body.append(view);

        var entry = {
          site: site,
          view: view,
          status: status,
          statusTitle: statusTitle,
          statusDetail: statusDetail,
          retry: retry,
          watchdog: undefined,
          record: undefined
        };
        views[site.id] = entry;
        retry.addEventListener("click", function () {
          restart(entry);
        });
        return entry;
      }

      function showStatus(entry, title, detail, offerRetry) {
        entry.statusTitle.textContent = title;
        entry.statusDetail.textContent = detail || "";
        entry.retry.style.display = offerRetry ? "inline-flex" : "none";
        entry.status.style.display = "flex";
        entry.status.style.pointerEvents = offerRetry ? "auto" : "none";
      }

      function hideStatus(entry) {
        entry.status.style.display = "none";
        entry.status.style.pointerEvents = "none";
        window.clearTimeout(entry.watchdog);
        entry.watchdog = undefined;
        entry.tries = 0;
      }

      /**
       * A site can stall on a cold start or a flaky network. Rebuild it silently
       * first — that recovers the boot case where the guest never attaches — and
       * only offer a manual button once the automatic attempts are used up.
       */
      function armWatchdog(entry) {
        window.clearTimeout(entry.watchdog);
        entry.watchdog = window.setTimeout(function () {
          if (disposed) return;
          if ((entry.tries || 0) < 2) {
            entry.tries = (entry.tries || 0) + 1;
            rebuild(entry, false);
            return;
          }
          showStatus(entry, "网页加载较慢…", "网络可能不稳定，点下面按钮重新加载", true);
        }, 15000);
      }

      function fail(entry, error) {
        var text = typeof error === "string" ? error : (error && error.message) || String(error);
        window.clearTimeout(entry.watchdog);
        entry.watchdog = undefined;
        showStatus(entry, "AI 网页没有加载成功", text, true);
      }

      /**
       * Throw a site's guest away and build it again. Without `hard` the same
       * partition is reused, so the site stays signed in; a hard rebuild moves
       * to a fresh session key, which is the last resort for a stuck lease.
       */
      function rebuild(entry, hard) {
        var record = entry.record;
        entry.record = undefined;
        window.clearTimeout(entry.watchdog);
        entry.watchdog = undefined;
        if (record !== undefined) {
          if (record.element !== undefined) record.element.remove();
          if (record.lease !== undefined) bridge.release(record.lease).catch(function () {});
        }
        if (hard) entry.attempt = (entry.attempt || 0) + 1;
        createGuest(entry);
      }


      function createGuest(entry) {
        if (entry.record !== undefined || disposed) return;
        var site = entry.site;
        var record = { element: undefined, lease: undefined, pending: site.url, ready: false };
        entry.record = record;
        showStatus(entry, "正在连接 AI 网页…", site.url);
        armWatchdog(entry);

        // A lease left behind by an earlier mount blocks the same workspace key,
        // so a hard retry asks for a brand new session instead of waiting forever.
        var key = "chat-shell:" + site.id + (entry.attempt ? ":" + entry.attempt : "");
        Promise.resolve(bridge.acquire(key)).then(
          function (reservation) {
            if (disposed || entry.record !== record) {
              bridge.release(reservation.lease).catch(function () {});
              return;
            }
            record.lease = reservation.lease;
            var element = document.createElement("webview");
            element.className = "chat-shell-guest";
            element.setAttribute("name", reservation.lease);
            element.setAttribute("partition", reservation.partition);
            element.setAttribute("allowpopups", "");
            element.setAttribute("useragent", guestUA());
            element.setAttribute("src", "about:blank#" + reservation.lease);
            record.element = element;

            element.addEventListener("dom-ready", function () {
              record.ready = true;
              var pending = record.pending;
              record.pending = undefined;
              if (pending === undefined) return;
              armWatchdog(entry);
              element.loadURL(pending).catch(function (error) {
                if (error && error.code === "ERR_ABORTED") return;
                fail(entry, error);
              });
            });

            element.addEventListener("did-finish-load", function () {
              hideStatus(entry);
            });

            element.addEventListener("did-fail-load", function (event) {
              if (event.errorCode === -3) return;
              fail(entry, "(" + event.errorCode + ") " + (event.errorDescription || ""));
            });

            element.addEventListener("render-process-gone", function (event) {
              fail(entry, "网页进程已退出：" + (event.reason || "unknown"));
              if (entry.record === record) entry.record = undefined;
            });

            element.addEventListener("destroyed", function () {
              if (entry.record === record) entry.record = undefined;
            });

            entry.view.append(element);
            // A guest inserted while its container had no layout box can stay
            // detached forever: no dom-ready, no load, just a spinner. Two
            // nudges cover the boot case, where the app is still laying out.
            window.setTimeout(function () {
              if (disposed || entry.record !== record || record.ready) return;
              nudge(entry, record);
            }, 900);
            window.setTimeout(function () {
              if (disposed || entry.record !== record || record.ready) return;
              nudge(entry, record);
            }, 2600);
          },
          function (error) {
            fail(entry, error);
          }
        );
      }

      /**
       * Force the guest's container to be re-laid out. Re-inserting the element
       * would destroy the guest (the lease cannot be attached twice), so only
       * the container's box is toggled while the element stays in place.
       */
      function nudge(entry, record) {
        if (record.element === undefined) return;
        var view = entry.view;
        var previous = view.style.display;
        view.style.display = "none";
        void view.offsetHeight;
        view.style.display = previous;
      }

      /** Manual retry from the status overlay, and the target of the watchdog. */
      function restart(entry) {
        var record = entry.record;
        if (record !== undefined && record.ready && record.element !== undefined) {
          // The guest is alive, only the page is stuck: reload it in place so the
          // signed-in session survives.
          hideStatus(entry);
          armWatchdog(entry);
          record.element.reload();
          return;
        }
        var tries = (entry.tries || 0) + 1;
        entry.tries = tries;
        hideStatus(entry);
        rebuild(entry, tries > 2);
      }

      function destroyGuests() {
        Object.keys(views).forEach(function (id) {
          var entry = views[id];
          window.clearTimeout(entry.watchdog);
          entry.watchdog = undefined;
          var record = entry.record;
          entry.record = undefined;
          if (record === undefined) return;
          if (record.element !== undefined) record.element.remove();
          if (record.lease !== undefined) bridge.release(record.lease).catch(function () {});
        });
      }

      // ------------------------------------------------------------------- ui

      function menuIcon(site) {
        var source = PRESET_ICONS[site.id];
        if (!source) return node("span", "chat-shell-dot");
        var image = document.createElement("img");
        image.className = "chat-shell-menu-icon";
        image.alt = "";
        image.src = source;
        return image;
      }

      function renderMenu() {
        listBox.textContent = "";
        state.sites.forEach(function (site) {
          var item = node("button", "chat-shell-item");
          item.type = "button";
          if (site.id === state.active) item.classList.add("chat-shell-current");
          item.append(menuIcon(site), node("span", "chat-shell-item-label", site.label));
          if (site.id === state.active) item.append(node("span", "chat-shell-check", "✓"));
          item.addEventListener("click", function () {
            activate(site.id);
            closeMenu();
          });
          listBox.append(item);
        });

        chips.textContent = "";
        state.sites.slice(0, 5).forEach(function (site) {
          var chip = node("button", "chat-shell-chip", site.label);
          chip.type = "button";
          chip.addEventListener("click", function () {
            activate(site.id);
          });
          chips.append(chip);
        });
      }

      /** Initial letter, shown only when there is no artwork for the site. */
      function pickerLetter(text) {
        logoBox.append(node("span", "chat-shell-logo-letter", text));
      }

      function paintPicker() {
        var active = state.sites.filter(function (site) {
          return site.id === state.active;
        })[0];

        logoBox.textContent = "";
        siteBtn.title = active ? active.label : "选择 AI 网页";
        siteBtn.classList.toggle("chat-shell-site-btn-empty", active === undefined);

        if (active === undefined) {
          pickerLetter("+");
          return;
        }

        var initial = active.label.slice(0, 1).toUpperCase();
        var source = PRESET_ICONS[active.id];
        if (!source) {
          pickerLetter(initial);
          return;
        }

        // Artwork only. The old letter fallback sat *behind* the transparent
        // SVG, so for example the whale showed a "D" through its body.
        var image = document.createElement("img");
        image.className = "chat-shell-logo-img";
        image.alt = "";
        image.addEventListener("error", function () {
          image.remove();
          pickerLetter(initial);
        });
        image.src = source;
        logoBox.append(image);
      }

      function paintSites() {
        var anyActive = false;
        Object.keys(views).forEach(function (id) {
          var entry = views[id];
          var active = id === state.active;
          entry.view.classList.toggle("chat-shell-view-active", active);
          if (active) anyActive = true;
        });
        if (state.active !== null && views[state.active] === undefined) {
          var site = state.sites.filter(function (entry) {
            return entry.id === state.active;
          })[0];
          if (site !== undefined) {
            viewFor(site);
            paintSites();
            return;
          }
        }
        empty.classList.toggle("chat-shell-empty-open", !anyActive);
      }

      function activate(id) {
        var site = state.sites.filter(function (entry) {
          return entry.id === id;
        })[0];
        if (site === undefined) return;
        state.active = id;
        state.mode = "chat";
        writeState(state);
        paintPicker();
        paintSites();
        paintMode();
        renderMenu();
        createGuest(views[id]);
      }

      function paintMode() {
        var chat = state.mode === "chat";
        panel.classList.toggle("chat-shell-open", chat);
        pill.classList.toggle("chat-shell-pill-harness", !chat);
        sites.classList.toggle("chat-shell-sites-hidden", !chat);
        tabChat.classList.toggle("chat-shell-active", chat);
        tabHarness.classList.toggle("chat-shell-active", !chat);
        layoutTitlebar();
        paintThumb();
        // Showing the panel re-lays out the guest container. A guest that was
        // built while it had no box only attaches at that point, so give it the
        // same push a site switch used to provide by hand.
        if (chat && state.active !== null) {
          var entry = views[state.active];
          if (entry !== undefined && entry.record !== undefined && !entry.record.ready) {
            window.setTimeout(function () {
              if (disposed || entry.record === undefined || entry.record.ready) return;
              nudge(entry, entry.record);
            }, 120);
          }
        }
      }

      /** Both tabs share one width so the switch reads as a symmetric pair. */
      function layoutTabs() {
        tabChat.style.width = "";
        tabHarness.style.width = "";
        var width = Math.ceil(
          Math.max(tabChat.getBoundingClientRect().width, tabHarness.getBoundingClientRect().width)
        );
        if (width === 0) return;
        var value = width + "px";
        tabChat.style.width = value;
        tabHarness.style.width = value;
      }

      /** The thumb mirrors the active tab exactly, so it can never overlap it. */
      function paintThumb() {
        var target = state.mode === "harness" ? tabHarness : tabChat;
        if (target.offsetWidth === 0) return;
        thumb.style.width = target.offsetWidth + "px";
        thumb.style.transform = "translateX(" + (target.offsetLeft - 2) + "px)";
      }

      function layoutTitlebar() {
        // Equal tabs first: their width decides where the switch starts, and the
        // picker is placed from the switch's measured left edge.
        layoutTabs();
        var rect = pill.getBoundingClientRect();
        if (rect.width === 0) return;
        var offset = Math.max(8, Math.round(window.innerWidth - rect.left + 16));
        sites.style.right = offset + "px";
      }

      function setMode(next) {
        if (state.mode === next) return;
        state.mode = next;
        writeState(state);

        paintMode();
        // Returning to Chat must also revive the site that is already selected:
        // the panel may have been mounted straight into Harness mode.
        if (next === "chat" && state.active !== null) {
          var entry = views[state.active];
          if (entry === undefined) {
            var site = state.sites.filter(function (candidate) {
              return candidate.id === state.active;
            })[0];
            if (site !== undefined) entry = viewFor(site);
          }
          if (entry !== undefined) {
            paintSites();
            createGuest(entry);
          }
        }
      }

      function openMenu() {
        menu.classList.add("chat-shell-menu-open");
      }

      function closeMenu() {
        menu.classList.remove("chat-shell-menu-open");
        addForm.classList.remove("chat-shell-add-open");
        addInput.value = "";
      }

      // --------------------------------------------------------------- events

      var suppressClickUntil = 0;
      var drag = { active: false, moved: false, startX: 0, startOffset: 0, travel: 0, offset: 0 };

      function thumbTravel() {
        return Math.max(0, tabHarness.offsetLeft - tabChat.offsetLeft);
      }

      tabChat.addEventListener("click", function () {
        if (Date.now() < suppressClickUntil) return;
        setMode("chat");
      });
      tabHarness.addEventListener("click", function () {
        if (Date.now() < suppressClickUntil) return;
        setMode("harness");
      });

      pill.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        drag.active = true;
        drag.moved = false;
        drag.pointerId = event.pointerId;
        drag.startX = event.clientX;
        drag.travel = thumbTravel();
        drag.startOffset = state.mode === "harness" ? drag.travel : 0;
        drag.offset = drag.startOffset;
      });

      pill.addEventListener("pointermove", function (event) {
        if (!drag.active) return;
        var delta = event.clientX - drag.startX;
        // Capture only once the gesture is clearly a drag, so plain clicks
        // still reach the tab buttons underneath.
        if (!drag.moved && Math.abs(delta) > 4) {
          drag.moved = true;
          thumb.style.transition = "none";
          try {
            pill.setPointerCapture(drag.pointerId);
          } catch (error) {
            /* capture is best effort */
          }
        }
        if (!drag.moved) return;
        drag.offset = Math.min(Math.max(drag.startOffset + delta, 0), drag.travel);
        thumb.style.transform = "translateX(" + drag.offset + "px)";
      });

      function endDrag() {
        if (!drag.active) return;
        drag.active = false;
        thumb.style.transition = "";
        thumb.style.transform = "";
        if (!drag.moved) {
          paintThumb();
          return;
        }
        suppressClickUntil = Date.now() + 260;
        var next = drag.offset > drag.travel / 2 ? "harness" : "chat";
        setMode(next);
        paintThumb();
        if (next === "chat" && state.active !== null) {
          var entry = views[state.active];
          if (entry !== undefined) createGuest(entry);
        }
      }

      window.addEventListener("pointerup", endDrag, true);
      window.addEventListener("pointercancel", endDrag, true);
      pill.addEventListener("pointerup", endDrag);
      pill.addEventListener("pointercancel", endDrag);
      pill.addEventListener("lostpointercapture", endDrag);

      siteBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        if (menu.classList.contains("chat-shell-menu-open")) closeMenu();
        else openMenu();
      });

      addToggle.addEventListener("click", function () {
        addForm.classList.add("chat-shell-add-open");
        addInput.focus();
      });

      addCancel.addEventListener("click", function () {
        addForm.classList.remove("chat-shell-add-open");
        addInput.value = "";
      });

      addConfirm.addEventListener("click", function () {
        var url = normalizeUrl(addInput.value);
        if (url === null) {
          addInput.focus();
          return;
        }
        var id = "site-" + Date.now().toString(36);
        state.sites.push({ id: id, label: hostOf(url), url: url });
        writeState(state);
        renderMenu();
        closeMenu();
        activate(id);
      });

      addInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") addConfirm.click();
        if (event.key === "Escape") addCancel.click();
      });

      function onDocumentClick(event) {
        if (panel.contains(event.target) && menu.contains(event.target)) return;
        if (sites.contains(event.target)) return;
        closeMenu();
      }
      document.addEventListener("click", onDocumentClick);

      document.body.append(sites, panel, pill);

      function onResize() {
        layoutTitlebar();
        paintThumb();
      }
      window.addEventListener("resize", onResize);

      // The app can be re-themed while the plugin is mounted (light/dark skin,
      // appearance switch). Re-read the painted surface instead of caching it.
      var themeTimer = 0;
      function syncTheme() {
        if (disposed || applying) return;
        applyTheme(surface());
        layoutTitlebar();
        paintThumb();
      }
      function scheduleTheme() {
        window.clearTimeout(themeTimer);
        themeTimer = window.setTimeout(syncTheme, 60);
      }
      var themeObserver = new MutationObserver(scheduleTheme);
      ["class", "style", "data-theme", "data-appearance", "data-color-scheme"].forEach(
        function (attribute) {
          themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: [attribute]
          });
          themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: [attribute]
          });
        }
      );
      var colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
      if (colorScheme.addEventListener) colorScheme.addEventListener("change", scheduleTheme);
      else if (colorScheme.addListener) colorScheme.addListener(scheduleTheme);

      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          if (disposed) return;
          layoutTitlebar();
          paintThumb();
        }).catch(function () {});
      }
      renderMenu();
      paintPicker();
      paintSites();
      paintMode();

      if (state.mode === "chat" && state.active !== null) {
        createGuest(viewFor(
          state.sites.filter(function (site) {
            return site.id === state.active;
          })[0]
        ));
      }

      return function () {
        disposed = true;
        window.clearTimeout(themeTimer);
        themeObserver.disconnect();
        if (colorScheme.removeEventListener) colorScheme.removeEventListener("change", scheduleTheme);
        else if (colorScheme.removeListener) colorScheme.removeListener(scheduleTheme);
        document.removeEventListener("click", onDocumentClick);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("pointerup", endDrag, true);
        window.removeEventListener("pointercancel", endDrag, true);
        destroyGuests();
        panel.remove();
        sites.remove();
        pill.remove();
        style.remove();
        [
          "--cs-bg",
          "--cs-fg",
          "--cs-border",
          "--cs-pill",
          "--cs-hover",
          "--cs-active",
          "--cs-muted",
          "--cs-glass",
          "--cs-glass-border",
          "--cs-glass-highlight"
        ].forEach(function (name) {
          document.documentElement.style.removeProperty(name);
        });
      };
    }

    // --------------------------------------------------------------------- api

    function apply(ctx) {
      ctx.effect(function () {
        return mount();
      });
    }

    module.exports = { apply: apply };
    return module.exports;
  }
});
