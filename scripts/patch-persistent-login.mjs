#!/usr/bin/env node
/**
 * dsh-chat-shell — optional shell patch.
 *
 * ★ What it changes
 *   The DSH desktop shell gives every embedded browser a session partition named
 *   `dsh-sidebar-browser-<random uuid>`. That name has no `persist:` prefix, so
 *   Chromium keeps the storage in memory only and every restart of the app starts
 *   from a clean cookie jar: you log in to DeepSeek / Doubao / ChatGPT again.
 *
 *   This script rewrites that one expression in the shell:
 *
 *     - partition = `dsh-sidebar-browser-${randomUUID()}`;
 *     + partition = `persist:dsh-sidebar-browser-${createHash("sha1").update(workspace).digest("hex").slice(0, 16)}`;
 *
 *   A `persist:` partition is written to disk, and the stable per-workspace hash
 *   keeps the same partition across runs. Logins survive a restart afterwards.
 *
 * ★ What it does NOT change
 *   Nothing else. No menus, no behaviour, no other file. The plugin itself keeps
 *   working without this script — it only loses the "stay logged in" nicety.
 *
 * ★ How the swap happens (Windows only)
 *   Windows keeps `resources/app.asar` open for the lifetime of the app, so the
 *   swap cannot happen while it runs. `apply` therefore does not touch anything:
 *   it writes a PowerShell helper next to this script and a `.cmd` launcher. You
 *   double-click the launcher, it waits for the app to fully exit, moves the
 *   original archive aside, puts the patched copy in its place and relaunches the
 *   app. The original archive is kept on disk, so `restore` can undo it at any
 *   time and a DSH update simply overwrites everything back to stock.
 *
 * ★ Usage
 *   node scripts/patch-persistent-login.mjs status
 *   node scripts/patch-persistent-login.mjs build     # extract + patch, no swap
 *   node scripts/patch-persistent-login.mjs apply     # prepare the swap, then
 *                                                     # double-click the .cmd
 *   node scripts/patch-persistent-login.mjs restore   # same, in reverse
 *
 *   --resources=<dir>   override the detected resources directory
 *   DSH_RESOURCES=<dir> same, via the environment
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MARKER = ".dsh-chat-shell.json";

const PATCH_ID = "dsh-chat-shell/persistent-login/1";
const MAIN_REL = ["lib", "main.js"];

/* ------------------------------------------------------------- path discovery */

function resolveResources() {
  const fromArg = process.argv.slice(2).find((arg) => arg.startsWith("--resources="));
  const explicit = fromArg ? fromArg.slice("--resources=".length) : process.env.DSH_RESOURCES;
  if (explicit && explicit.trim() !== "") return path.resolve(explicit.trim());
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    throw new Error("LOCALAPPDATA is not set; pass --resources=<…\\DeepSeek Harness\\resources>");
  }
  return path.join(localAppData, "Programs", "DeepSeek Harness", "resources");
}

const RESOURCES = resolveResources();
const ASAR = path.join(RESOURCES, "app.asar");
const UNPACKED = path.join(RESOURCES, "app.asar.unpacked");
const APP_DIR = path.join(RESOURCES, "app");
const NEXT_DIR = path.join(RESOURCES, "app.next");
const EXE = path.resolve(RESOURCES, "..", "DeepSeek Harness.exe");

/* ------------------------------------------------------------------ asar read */

function readIndex(asarPath) {
  const fd = fs.openSync(asarPath, "r");
  try {
    const pre = Buffer.alloc(16);
    if (fs.readSync(fd, pre, 0, 16, 0) !== 16) throw new Error("asar header truncated");
    if (pre.readUInt32LE(0) !== 4) throw new Error("not an asar archive");
    const headerSize = pre.readUInt32LE(4);
    const jsonSize = pre.readUInt32LE(12);
    const jsonBuf = Buffer.alloc(jsonSize);
    if (fs.readSync(fd, jsonBuf, 0, jsonSize, 16) !== jsonSize) throw new Error("asar header short");
    return { fd, header: JSON.parse(jsonBuf.toString("utf8")), dataOffset: 8 + headerSize };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function walkEntries(node, prefix, out) {
  for (const [name, info] of Object.entries(node.files || {})) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (info && info.files) walkEntries(info, rel, out);
    else if (info) out.push({ rel, info });
  }
}

function extractAsar(asarPath, destDir) {
  const { fd, header, dataOffset } = readIndex(asarPath);
  const entries = [];
  walkEntries(header, "", entries);
  const chunk = Buffer.alloc(4 * 1024 * 1024);
  let written = 0;
  try {
    for (const { rel, info } of entries) {
      // `unpacked` files live beside the archive and are overlaid separately;
      // `link` entries are asar-internal symlinks and have no payload.
      if (info.unpacked || typeof info.link === "string") continue;
      const outPath = path.join(destDir, ...rel.split("/"));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      const size = Number(info.size || 0);
      const out = fs.openSync(outPath, "w");
      try {
        let left = size;
        let pos = dataOffset + Number(info.offset || 0);
        while (left > 0) {
          const want = Math.min(chunk.length, left);
          const got = fs.readSync(fd, chunk, 0, want, pos);
          if (got <= 0) throw new Error(`asar short read: ${rel}`);
          fs.writeSync(out, chunk, 0, got);
          pos += got;
          left -= got;
        }
      } finally {
        fs.closeSync(out);
      }
      written += 1;
    }
  } finally {
    fs.closeSync(fd);
  }
  return { files: written, entries: entries.length };
}

function overlayUnpacked(unpackedDir, destDir) {
  if (!fs.existsSync(unpackedDir)) return 0;
  let copied = 0;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const from = path.join(dir, ent.name);
      const to = path.join(destDir, path.relative(unpackedDir, from));
      if (ent.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        walk(from);
      } else if (ent.isFile()) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
        copied += 1;
      }
    }
  };
  walk(unpackedDir);
  return copied;
}

/* -------------------------------------------------------------------- patch */

const PARTITION_FROM = "\t\t\tpartition = `dsh-sidebar-browser-${randomUUID()}`;";
const PARTITION_TO =
  "\t\t\t// [dsh-chat-shell] persistent per-workspace session, so AI web logins survive restarts\n"
  + "\t\t\tpartition = `persist:dsh-sidebar-browser-${createHash(\"sha1\").update(workspace).digest(\"hex\").slice(0, 16)}`;";

function countOf(haystack, needle) {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
}

function patchMain(source) {
  const hits = countOf(source, PARTITION_FROM);
  if (hits === 0 && countOf(source, PARTITION_TO) === 1) {
    return { source, state: "already-applied" };
  }
  if (hits !== 1) {
    throw new Error(
      `the partition anchor matched ${hits} times (expected exactly 1). `
      + "This DSH build changed the shell, so the patch is refused rather than guessed.",
    );
  }
  return { source: source.split(PARTITION_FROM).join(PARTITION_TO), state: "applied" };
}

/* ------------------------------------------------------------- handoff helper */

const HANDOFF_PS1 = String.raw`param(
  [Parameter(Mandatory=$true)][string]$ResourcesPath,
  [Parameter(Mandatory=$true)][string]$ExePath,
  [Parameter(Mandatory=$true)][string]$StatePath,
  [Parameter(Mandatory=$true)][string]$Mode,
  [long]$ExpectedSize = -1,
  [int]$TimeoutSeconds = 21600
)
$ErrorActionPreference = 'Stop'
$asar = Join-Path $ResourcesPath 'app.asar'
$appDir = Join-Path $ResourcesPath 'app'
$nextDir = Join-Path $ResourcesPath 'app.next'
$log = $StatePath + '.log'

function Save-State([string]$phase, [string]$detail = '') {
  $state = [ordered]@{
    pid = $PID; phase = $phase; mode = $Mode; detail = $detail
    updated_at = [DateTime]::UtcNow.ToString('o')
  }
  $tmp = $StatePath + '.tmp'
  [IO.File]::WriteAllText($tmp, ($state | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $tmp -Destination $StatePath -Force
  Add-Content -LiteralPath $log -Value (([DateTime]::UtcNow.ToString('o')) + ' ' + $phase + ' ' + $detail) -Encoding UTF8
}

function Wait-Quit() {
  $procName = [IO.Path]::GetFileNameWithoutExtension($ExePath)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $alive = @(Get-Process -Name $procName -ErrorAction SilentlyContinue |
      Where-Object { try { $_.Path -and [string]::Equals($_.Path, $ExePath, [StringComparison]::OrdinalIgnoreCase) } catch { $false } })
    if ($alive.Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

try {
  Save-State 'waiting_for_quit'
  if (-not (Wait-Quit)) { Save-State 'expired' 'Timed out waiting for a full quit.'; exit 2 }

  if ($Mode -eq 'apply') {
    if (-not (Test-Path -LiteralPath (Join-Path $nextDir 'package.json'))) { throw 'app.next/package.json missing; nothing changed.' }
    if (-not (Test-Path -LiteralPath $asar)) { throw 'app.asar missing; unexpected state.' }
    $size = (Get-Item -LiteralPath $asar).Length
    if ($ExpectedSize -ge 0 -and $size -ne $ExpectedSize) { throw "app.asar changed since build ($size vs $ExpectedSize); run build again." }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $bak = $asar + '.dsh-chat-shell-' + $stamp + '.bak'
    $prev = $appDir + '.prev-' + $stamp
    Save-State 'swapping'
    # Move the archive first: if it is still locked, nothing has changed yet.
    Move-Item -LiteralPath $asar -Destination $bak -ErrorAction Stop
    try {
      if (Test-Path -LiteralPath $appDir) { Move-Item -LiteralPath $appDir -Destination $prev -ErrorAction Stop }
      Move-Item -LiteralPath $nextDir -Destination $appDir -ErrorAction Stop
      if (-not (Test-Path -LiteralPath (Join-Path $appDir 'package.json'))) { throw 'swap verification failed.' }
    } catch {
      if ((Test-Path -LiteralPath $prev) -and -not (Test-Path -LiteralPath $appDir)) {
        Move-Item -LiteralPath $prev -Destination $appDir -ErrorAction SilentlyContinue
      }
      if (Test-Path -LiteralPath $bak) { Move-Item -LiteralPath $bak -Destination $asar -ErrorAction SilentlyContinue }
      throw
    }
    Save-State 'complete' ('original archive kept as ' + (Split-Path -Leaf $bak))
  }
  elseif ($Mode -eq 'restore') {
    $bak = Get-ChildItem -LiteralPath $ResourcesPath -Filter 'app.asar.dsh-chat-shell-*.bak' -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $bak) { throw 'no app.asar.dsh-chat-shell-*.bak found; nothing to restore.' }
    if (Test-Path -LiteralPath $asar) { throw 'app.asar is already present; assuming stock.' }
    Move-Item -LiteralPath $bak.FullName -Destination $asar -ErrorAction Stop
    if (Test-Path -LiteralPath $appDir) {
      Move-Item -LiteralPath $appDir -Destination ($appDir + '.disabled-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) -ErrorAction Stop
    }
    Save-State 'complete' 'restored the original archive.'
  }
  else { Save-State 'failed' ('unknown mode ' + $Mode); exit 1 }

  Start-Sleep -Milliseconds 600
  Start-Process -FilePath $ExePath -WorkingDirectory (Split-Path -Parent $ExePath)
  Save-State 'relaunched'
  exit 0
} catch {
  try { Save-State 'failed' $_.Exception.Message } catch {}
  exit 1
}
`;

/* ------------------------------------------------------------------ commands */

function installedMarker() {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP_DIR, MARKER), "utf8"));
  } catch {
    return null;
  }
}

async function cmdStatus() {
  const asarPresent = fs.existsSync(ASAR);
  const marker = installedMarker();
  console.log(JSON.stringify({
    resources: RESOURCES,
    appAsarPresent: asarPresent,
    appAsarSize: asarPresent ? fs.statSync(ASAR).size : null,
    appDirPresent: fs.existsSync(APP_DIR),
    installedPatch: marker,
    nextDirPresent: fs.existsSync(NEXT_DIR),
    state: marker
      ? "patched — the shell is loaded from resources/app and logins persist"
      : asarPresent
        ? "stock — the shell is loaded from app.asar and embedded logins are lost on restart"
        : "unknown — neither app.asar nor a patch marker was found",
  }, null, 2));
}

async function cmdBuild() {
  if (!fs.existsSync(ASAR)) {
    throw new Error(`no ${ASAR}. Either DSH was already patched (run status) or --resources is wrong.`);
  }
  if (fs.existsSync(NEXT_DIR)) {
    console.log(`removing stale ${NEXT_DIR}`);
    fs.rmSync(NEXT_DIR, { recursive: true, force: true });
  }
  const size = fs.statSync(ASAR).size;
  console.log(`extracting app.asar (${(size / 1048576).toFixed(1)} MiB) -> app.next`);
  const started = Date.now();
  const { files, entries } = extractAsar(ASAR, NEXT_DIR);
  console.log(`  ${files}/${entries} entries written in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  const overlaid = overlayUnpacked(UNPACKED, NEXT_DIR);
  console.log(`  ${overlaid} unpacked files overlaid`);

  const mainPath = path.join(NEXT_DIR, ...MAIN_REL);
  const original = fs.readFileSync(mainPath, "utf8");
  const { source, state } = patchMain(original);
  if (state === "applied") {
    fs.writeFileSync(`${mainPath}.orig`, original, "utf8");
    fs.writeFileSync(mainPath, source, "utf8");
  }
  console.log(`  patch: ${state}`);

  const { spawnSync } = await import("node:child_process");
  const check = spawnSync(process.execPath, ["--check", mainPath], { encoding: "utf8" });
  if (check.status !== 0) throw new Error(`patched main.js does not parse:\n${check.stderr || check.stdout}`);
  console.log("  patched lib/main.js parses (node --check)");

  const pkg = JSON.parse(fs.readFileSync(path.join(NEXT_DIR, "package.json"), "utf8"));
  const marker = {
    id: PATCH_ID,
    patch: "persistent-login",
    state,
    shellVersion: pkg.version,
    builtAt: new Date().toISOString(),
    asar: { size, path: ASAR },
  };
  fs.writeFileSync(path.join(NEXT_DIR, MARKER), JSON.stringify(marker, null, 2), "utf8");
  console.log("\nbuilt app.next");
  console.log("next: node scripts/patch-persistent-login.mjs apply");
}

async function cmdApply() {
  if (!fs.existsSync(path.join(NEXT_DIR, "package.json"))) {
    throw new Error(`${NEXT_DIR} is missing; run build first.`);
  }
  const expectedSize = fs.statSync(ASAR).size;
  return prepareHandoff("apply", expectedSize);
}

async function cmdRestore() {
  return prepareHandoff("restore", -1);
}

function prepareHandoff(mode, expectedSize) {
  const label = mode === "apply" ? "apply" : "restore";
  const scriptPath = path.join(HERE, `handoff-${label}.ps1`);
  const cmdPath = path.join(HERE, `${label}-patch.cmd`);
  const statePath = path.join(HERE, `handoff-${label}.json`);
  const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
  const body = HANDOFF_PS1.replace(/^param\([\s\S]*?\)\r?\n/, "");
  const prelude = [
    `$ResourcesPath = ${literal(RESOURCES)}`,
    `$ExePath = ${literal(EXE)}`,
    `$StatePath = ${literal(statePath)}`,
    `$Mode = ${literal(mode)}`,
    `$ExpectedSize = ${expectedSize}`,
    "",
  ].join("\n");
  // Windows PowerShell reads .ps1 as ANSI unless it starts with a BOM, and the
  // install path usually contains non-ASCII characters (user name, CJK folders).
  fs.writeFileSync(scriptPath, "\uFEFF" + prelude + body, "utf8");
  // The .cmd must stay pure ASCII: cmd.exe parses batch files in the OEM code
  // page, so a baked-in path would be mangled. `%~dp0` resolves at run time.
  fs.writeFileSync(cmdPath, [
    "@echo off",
    `title DSH Chat Shell - ${label}`,
    "echo ==========================================================",
    "echo  Waiting for DeepSeek Harness to exit completely.",
    "echo  Now choose Application - Quit inside the app window.",
    "echo  This window finishes by itself afterwards.",
    "echo ==========================================================",
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0${path.basename(scriptPath)}"`,
    "echo.",
    "echo exit code: %ERRORLEVEL%   (0=ok 1=failed 2=timed out)",
    "pause",
    "",
  ].join("\r\n"), "ascii");
  fs.rmSync(statePath, { force: true });
  fs.rmSync(`${statePath}.log`, { force: true });
  console.log(JSON.stringify({
    prepared: true,
    mode,
    resources: RESOURCES,
    launcher: cmdPath,
    helper: scriptPath,
    state: statePath,
    instruction: "Double-click the launcher, then quit DeepSeek Harness (应用 → 退出).",
  }, null, 2));
  return { mode, launcher: cmdPath };
}

const command = process.argv[2] || "status";
const commands = { status: cmdStatus, build: cmdBuild, apply: cmdApply, restore: cmdRestore };
const fn = commands[command];
if (!fn) {
  console.error(`unknown command "${command}"; use one of ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
await fn();
