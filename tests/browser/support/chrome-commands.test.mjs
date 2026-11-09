/**
 * M23.21 (DEF-M23.19-01) — the model of Chrome's shortcut assignment, and the fixture it reads. The fixture is Chromium's
 * own table at the tag the operator's Chrome for Testing reports (153.0.8010.12); these tests pin the facts the fix rests
 * on, so a regenerated or edited fixture that loses one fails here.
 */
import { describe, expect, it } from "vitest";

import { CHROME_153_ACCELERATORS, chromeAcceleratorsMatching, parseShortcut, registerCommands, routeKeyPress } from "./chrome-commands.mjs";

describe("the fixture", () => {
  it("is Chromium's accelerator table at the operator's exact version, with every mapping in it", () => {
    expect(CHROME_153_ACCELERATORS.source).toBe("chromium/src chrome/browser/ui/accelerator_table.cc");
    expect(CHROME_153_ACCELERATORS.tag).toBe("153.0.8010.12");
    expect(CHROME_153_ACCELERATORS.tagObject).toBe("971a7443b0c9b0a9b2860529b33331b76077ec62");
    // 147 `{ui::VKEY_...}` mappings in that file: 145 in arrays, 2 appended by `GetAcceleratorList()` itself.
    expect(CHROME_153_ACCELERATORS.entries).toHaveLength(147);
    expect(CHROME_153_ACCELERATORS.entries.filter((e) => e.array === "GetAcceleratorList.emplace_back")).toHaveLength(2);
  });

  it("holds the tab-group shortcuts, present on Windows: `Alt+Shift+P` is 'create new tab group'", () => {
    const tabGroups = CHROME_153_ACCELERATORS.entries.filter((e) => e.array === "kTabGroupAcceleratorMap");
    expect(tabGroups.map((e) => [e.key, e.command])).toEqual([
      ["VKEY_C", "IDC_ADD_NEW_TAB_TO_GROUP"],
      ["VKEY_P", "IDC_CREATE_NEW_TAB_GROUP"],
      ["VKEY_X", "IDC_FOCUS_NEXT_TAB_GROUP"],
      ["VKEY_Z", "IDC_FOCUS_PREV_TAB_GROUP"],
      ["VKEY_W", "IDC_CLOSE_TAB_GROUP"],
    ]);
    for (const e of tabGroups) {
      expect(e.modifiers).toEqual(["EF_ALT_DOWN", "EF_SHIFT_DOWN"]);
      expect(e.guards).toEqual(["!BUILDFLAG(IS_MAC) && !BUILDFLAG(IS_CHROMEOS)"]);
      expect(e.onWindows).toBe("yes");
    }
  });

  it("names no accelerator on the Y key at all", () => {
    expect(CHROME_153_ACCELERATORS.entries.filter((e) => e.key === "VKEY_Y")).toEqual([]);
  });
});

describe("the manifest's key syntax, as Chrome documents it", () => {
  it("reads a shortcut into Chrome's names", () => {
    expect(parseShortcut("Ctrl+Shift+Y")).toEqual({ key: "VKEY_Y", modifiers: ["EF_CONTROL_DOWN", "EF_SHIFT_DOWN"] });
    expect(parseShortcut("Alt+Shift+P")).toEqual({ key: "VKEY_P", modifiers: ["EF_ALT_DOWN", "EF_SHIFT_DOWN"] });
  });

  it("refuses what Chrome refuses: no Ctrl or Alt, Ctrl with Alt, two keys, no key, an unknown key", () => {
    expect(parseShortcut("Shift+Y")).toEqual({ error: "NEEDS_CTRL_OR_ALT" });
    expect(parseShortcut("Ctrl+Alt+Y")).toEqual({ error: "CTRL_ALT_NOT_PERMITTED" });
    expect(parseShortcut("Ctrl+X+Y")).toEqual({ error: "NOT_EXACTLY_ONE_KEY" });
    expect(parseShortcut("Ctrl+Shift")).toEqual({ error: "NOT_EXACTLY_ONE_KEY" });
    expect(parseShortcut("Ctrl+F13")).toEqual({ error: "UNKNOWN_KEY:F13" });
    expect(parseShortcut("")).toEqual({ error: "EMPTY" });
  });
});

describe("CanAutoAssign, for a command that is not global", () => {
  it("refuses a key Chrome claims, whichever modifier spelling the table uses", () => {
    expect(chromeAcceleratorsMatching("Ctrl+T").map((e) => e.command)).toContain("IDC_NEW_TAB"); // EF_PLATFORM_ACCELERATOR is Ctrl on Windows
    expect(registerCommands({ _execute_action: { suggested_key: { default: "Ctrl+T" } } })[0]?.shortcut).toBe("");
  });

  it("counts a 'conditional' entry as present, and ignores one a Windows build excludes", () => {
    expect(chromeAcceleratorsMatching("Ctrl+Shift+P").map((e) => [e.command, e.onWindows])).toEqual([["IDC_BASIC_PRINT", "conditional"]]);
    const chromeOsOnly = CHROME_153_ACCELERATORS.entries.find((e) => e.onWindows === "no" && e.command === "IDC_NEW_SPLIT_TAB");
    expect(chromeOsOnly?.modifiers).toEqual(["EF_ALT_DOWN", "EF_CONTROL_DOWN"]);
  });

  it("assigns a key Chrome does not claim, and prefers the Windows key when one is given", () => {
    expect(registerCommands({ _execute_action: { suggested_key: { default: "Ctrl+Shift+Y" } } })[0]).toMatchObject({ shortcut: "Ctrl+Shift+Y", refusedBecause: null });
    expect(registerCommands({ _execute_action: { suggested_key: { default: "Alt+Shift+P", windows: "Ctrl+Shift+Y" } } })[0]?.shortcut).toBe("Ctrl+Shift+Y");
  });

  it("assigns nothing for a command with no key", () => {
    expect(registerCommands({ _execute_action: { description: "x" } })[0]).toMatchObject({ shortcut: "", refusedBecause: "NO_SUGGESTED_KEY" });
  });
});

describe("routing a key press", () => {
  const assigned = registerCommands({ _execute_action: { suggested_key: { default: "Ctrl+Shift+Y" } } });

  it("gives the held key to `_execute_action`, in any modifier order", () => {
    expect(routeKeyPress(assigned, "Ctrl+Shift+Y")).toEqual({ to: "EXECUTE_ACTION" });
    expect(routeKeyPress(assigned, "Shift+Ctrl+Y")).toEqual({ to: "EXECUTE_ACTION" });
  });

  it("gives a claimed key to Chrome, and an unclaimed one to nothing", () => {
    expect(routeKeyPress(assigned, "Alt+Shift+P")).toEqual({ to: "CHROME", command: "IDC_CREATE_NEW_TAB_GROUP" });
    expect(routeKeyPress(assigned, "Alt+Shift+Y")).toEqual({ to: "NOTHING" });
  });
});
