# Keeping AI-website logins across restarts (optional)

> **Short version.** The desktop shell gives every embedded browser an
> **in-memory** session partition, so a restart logs you out. One line in the
> shell switches it to a **persistent** partition. You do not need this for the
> plugin to work.
>
> ```
> - partition = `dsh-sidebar-browser-${randomUUID()}`;
> + partition = `persist:dsh-sidebar-browser-${createHash("sha1").update(workspace).digest("hex").slice(0, 16)}`;
> ```

---

## 1. Why a restart logs you out

`dsh-chat-shell` does not own the browser. It asks the desktop shell for one:

```js
const { lease, partition } = await window.dshDesktop.browser.acquire(workspace);
```

`partition` is the Chromium session name. The shell builds it like this:

```js
partition = `dsh-sidebar-browser-${randomUUID()}`;   // src: lib/main.js, DesktopBrowserGuests.acquire()
```

Two properties follow from that string:

* **No `persist:` prefix** → Chromium treats it as an in-memory session. Cookies,
  `localStorage` and IndexedDB live in the process and die with it.
* **`randomUUID()`** → even inside one process, a fresh name means a fresh jar.

The renderer only ever receives the `partition` *name*. It never gets the
session object, so a plugin cannot reach the cookie jar to save or restore it —
`webview.executeJavaScript` sees non-HttpOnly cookies at best, and the login
cookies of DeepSeek / Doubao / ChatGPT are HttpOnly. The fix has to happen where
the name is created: in the shell.

## 2. What the script does

`scripts/patch-persistent-login.mjs`:

1. reads `resources/app.asar` (a plain asar archive: 8-byte prefix, JSON index,
   then the file payloads — no external tool needed);
2. extracts it to `resources/app.next`, overlays `app.asar.unpacked`;
3. rewrites **exactly one expression** in `app.next/lib/main.js`, refusing to
   continue unless the anchor matches exactly once;
4. runs `node --check` on the result;
5. `apply` writes a PowerShell helper plus a `.cmd` launcher — it does not touch
   the installation.

The swap itself happens only after you quit the app, because Windows keeps
`app.asar` open while it runs:

```
quit  →  move app.asar           → app.asar.dsh-chat-shell-<stamp>.bak
      →  move resources\app      → app\prev-<stamp>          (usually absent)
      →  move app.next           → resources\app
      →  relaunch the app
```

`resources/app` wins over `app.asar`, so the patched shell is what loads. If any
step fails, the helper puts everything back before it exits.

## 3. Doing it

```bash
node scripts/patch-persistent-login.mjs status   # stock / patched, plus the paths it resolved
node scripts/patch-persistent-login.mjs build    # ~1 minute, ~450 MB on disk
node scripts/patch-persistent-login.mjs apply    # writes apply-patch.cmd next to the script
```

Then:

1. double-click `scripts/apply-patch.cmd`;
2. in DSH choose **应用 → 退出** (Application → Quit);
3. the window waits, swaps, and relaunches the app by itself.

Reopen the Chat side once and log in to each site. From then on the logins are
on disk.

`status` should now report:

```json
{
  "appAsarPresent": false,
  "appDirPresent": true,
  "installedPatch": { "id": "dsh-chat-shell/persistent-login/1", "state": "applied" }
}
```

## 4. Undoing it

```bash
node scripts/patch-persistent-login.mjs restore
```

Double-click `scripts/restore-patch.cmd`, quit DSH, and the newest
`app.asar.dsh-chat-shell-*.bak` is moved back into place.

Manual alternative — with the app closed:

1. rename `resources\app` to anything else;
2. rename `resources\app.asar.dsh-chat-shell-*.bak` back to `app.asar`;
3. start the app.

Deleting `resources\app` and restoring the `.bak` is exactly what the helper
does; the `.bak` is the only file you must not throw away.

## 5. After a DSH update

An update reinstalls `app.asar` and drops the `resources\app` directory, so the
patch is gone — the plugin itself is unaffected. Re-run `build` + `apply`.
If the new shell changed the anchor line, `build` stops and says so instead of
guessing; check the "What the script does" section and adjust the anchor.

## 6. Caveats

* **Windows only.** The swap helper is PowerShell; the plugin is not.
* **It edits the installed application.** Run it on your own machine and read the
  script first — it is short, and it is the only thing here that touches files
  outside the plugin.
* **`app.asar` integrity.** The archive carries per-file integrity metadata.
  Rather than rewriting it in place (which would need the archive re-signed as a
  whole), the script extracts it into a directory, which Electron loads verbatim.
* **Disk cost.** The extraction is roughly the size of the archive (~450 MB), and
  the original archive is kept as `.bak`. You can delete the `.bak` after the
  patched app has started a few times, but then you lose the one-command rollback.
* **Scope.** It changes no behaviour other than where the partition lives. The
  embedded browsers still cannot download, request permissions, open popups as
  windows, or nest another webview.
