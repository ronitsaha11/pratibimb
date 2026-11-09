/**
 * M23.21 (DEF-M23.19-01) — WHETHER CHROME WILL GIVE AN EXTENSION ITS SUGGESTED SHORTCUT, MODELLED FOR TESTS.
 *
 * Chrome assigns a manifest's `suggested_key` at install only if `CommandService::CanAutoAssign` allows it. For a
 * command that is not global, such as `_execute_action`, that is the last line of the function, quoted from
 * Chromium at tag 153.0.8010.12 (`chrome/browser/extensions/commands/command_service.cc`):
 *
 *     // Not a global command, check if the command is a Chrome shortcut.
 *     return !IsChromeAccelerator(command.accelerator());
 *
 * On Windows, `IsChromeAccelerator` (`chrome/browser/ui/views/accelerator_utils_aura.cc`) walks `GetAcceleratorList()`,
 * which `chrome-153-accelerators.json` lists. A refused key is simply not assigned: `chrome.commands.getAll()` then reports
 * the command with an empty `shortcut`, and pressing the key does whatever Chrome's own accelerator does.
 *
 * This is a MODEL of Chrome, for tests. It establishes what Chrome's source says, never what a browser did: only a person
 * pressing the key in Chrome for Testing can say that. It runs nothing and reads only its fixture.
 */
import { readFileSync } from "node:fs";

export const CHROME_153_ACCELERATORS = Object.freeze(JSON.parse(readFileSync(new URL("./chrome-153-accelerators.json", import.meta.url), "utf8")));

/** The manifest's key names (developer.chrome.com, `commands`), as Chrome's VKEY names. Media keys are left out. */
const KEYS = Object.freeze({
  ...Object.fromEntries([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"].map((c) => [c, `VKEY_${c}`])),
  Comma: "VKEY_OEM_COMMA",
  Period: "VKEY_OEM_PERIOD",
  Home: "VKEY_HOME",
  End: "VKEY_END",
  PageUp: "VKEY_PRIOR",
  PageDown: "VKEY_NEXT",
  Space: "VKEY_SPACE",
  Insert: "VKEY_INSERT",
  Delete: "VKEY_DELETE",
  Up: "VKEY_UP",
  Down: "VKEY_DOWN",
  Left: "VKEY_LEFT",
  Right: "VKEY_RIGHT",
});
const MODIFIERS = Object.freeze({ Ctrl: "EF_CONTROL_DOWN", Alt: "EF_ALT_DOWN", Shift: "EF_SHIFT_DOWN" });

/**
 * A manifest shortcut, read as Chrome reads one on Windows: `{ key, modifiers }`, or `{ error }`. The documented rules:
 * it must include Ctrl or Alt, it may not use Ctrl and Alt together, and it names exactly one other key.
 */
export function parseShortcut(text) {
  if (typeof text !== "string" || text.trim() === "") return { error: "EMPTY" };
  const parts = text.split("+").map((part) => part.trim());
  const keys = parts.filter((part) => !(part in MODIFIERS));
  const modifiers = [...new Set(parts.filter((part) => part in MODIFIERS).map((part) => MODIFIERS[part]))].sort();
  if (keys.length !== 1) return { error: "NOT_EXACTLY_ONE_KEY" };
  const key = KEYS[keys[0]];
  if (key === undefined) return { error: `UNKNOWN_KEY:${keys[0]}` };
  if (!modifiers.includes("EF_CONTROL_DOWN") && !modifiers.includes("EF_ALT_DOWN")) return { error: "NEEDS_CTRL_OR_ALT" };
  if (modifiers.includes("EF_CONTROL_DOWN") && modifiers.includes("EF_ALT_DOWN")) return { error: "CTRL_ALT_NOT_PERMITTED" };
  return { key, modifiers };
}

/** `EF_PLATFORM_ACCELERATOR` is Ctrl on Windows. */
const onWindows = (modifiers) => [...new Set(modifiers.map((m) => (m === "EF_PLATFORM_ACCELERATOR" ? "EF_CONTROL_DOWN" : m)))].sort();
const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Chrome 153's own accelerators that a shortcut matches on Windows. An entry whose presence depends on branding, a build
 * option, DCHECK or a feature ("conditional") counts as present, so a key passes only if no reading of Chrome claims it.
 */
export function chromeAcceleratorsMatching(text, table = CHROME_153_ACCELERATORS) {
  const parsed = parseShortcut(text);
  if ("error" in parsed) return [];
  return table.entries.filter((entry) => entry.onWindows !== "no" && entry.key === parsed.key && same(onWindows(entry.modifiers), parsed.modifiers));
}

/**
 * What `chrome.commands.getAll()` would report for a manifest's `commands` on a fresh install, by the rule above:
 * `shortcut` is the suggested key if Chrome may assign it, otherwise "" (Chrome's own spelling of the key may differ
 * from the manifest's; a browser reports its own). `refusedBecause` says why a key was not assigned.
 */
export function registerCommands(commands, table = CHROME_153_ACCELERATORS) {
  return Object.entries(commands ?? {}).map(([name, command]) => {
    const suggested = command?.suggested_key?.windows ?? command?.suggested_key?.default;
    if (suggested === undefined) return { name, description: command?.description ?? "", shortcut: "", refusedBecause: "NO_SUGGESTED_KEY" };
    const parsed = parseShortcut(suggested);
    if ("error" in parsed) return { name, description: command?.description ?? "", shortcut: "", refusedBecause: parsed.error };
    const claimedBy = chromeAcceleratorsMatching(suggested, table);
    if (claimedBy.length > 0) return { name, description: command?.description ?? "", shortcut: "", refusedBecause: `CHROME_ACCELERATOR:${claimedBy.map((e) => e.command).join(",")}` };
    return { name, description: command?.description ?? "", shortcut: suggested, refusedBecause: null };
  });
}

/**
 * Where a key press goes, by the same model: to `_execute_action` (which Chrome turns into the action's click event) when
 * that command holds the key; to Chrome's own command when Chrome claims it; otherwise nowhere this model knows of.
 */
export function routeKeyPress(registration, pressed, table = CHROME_153_ACCELERATORS) {
  const held = registration.find((command) => command.shortcut !== "" && sameShortcut(command.shortcut, pressed));
  if (held !== undefined) return held.name === "_execute_action" ? { to: "EXECUTE_ACTION" } : { to: "COMMAND", name: held.name };
  const chrome = chromeAcceleratorsMatching(pressed, table);
  if (chrome.length > 0) return { to: "CHROME", command: chrome[0].command };
  return { to: "NOTHING" };
}

function sameShortcut(a, b) {
  const x = parseShortcut(a);
  const y = parseShortcut(b);
  return !("error" in x) && !("error" in y) && x.key === y.key && same(x.modifiers, y.modifiers);
}
