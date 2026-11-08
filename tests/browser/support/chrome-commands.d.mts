/** Types for `chrome-commands.mjs`, so the TypeScript tests can import it. The module is the source of truth. */
export interface AcceleratorEntry {
  readonly line: number;
  readonly array: string;
  readonly key: string;
  readonly modifiers: readonly string[];
  readonly command: string;
  readonly guards: readonly string[];
  readonly onWindows: "yes" | "no" | "conditional";
}
export interface AcceleratorTable {
  readonly source: string;
  readonly tag: string;
  readonly tagObject: string;
  readonly entries: readonly AcceleratorEntry[];
}
export interface Registration {
  readonly name: string;
  readonly description: string;
  readonly shortcut: string;
  readonly refusedBecause: string | null;
}
export const CHROME_153_ACCELERATORS: AcceleratorTable;
export function parseShortcut(text: unknown): { readonly key: string; readonly modifiers: readonly string[] } | { readonly error: string };
export function chromeAcceleratorsMatching(text: string, table?: AcceleratorTable): readonly AcceleratorEntry[];
export function registerCommands(commands: unknown, table?: AcceleratorTable): readonly Registration[];
export function routeKeyPress(
  registration: readonly Registration[],
  pressed: string,
  table?: AcceleratorTable
): { readonly to: "EXECUTE_ACTION" } | { readonly to: "COMMAND"; readonly name: string } | { readonly to: "CHROME"; readonly command: string } | { readonly to: "NOTHING" };
