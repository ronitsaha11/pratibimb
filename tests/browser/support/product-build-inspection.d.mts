/** Types for `product-build-inspection.mjs`, so the TypeScript tests can import it. The module is the source of truth. */
export const EXPECTED_PRODUCT_FILES: { readonly ortFiles: readonly string[]; readonly tr01File: string };
export const DIAGNOSTIC_HOOK_MARKERS: readonly string[];
export const APPROVED_UI_COPY: { readonly toolbarTitle: string; readonly sidePanelDescription: string; readonly privacyExplanation: string };
export const STALE_UI_WORDING: readonly string[];
export function inspectProductBuild(
  directory: string,
  expected: { readonly ortFiles: readonly string[]; readonly tr01File: string }
): {
  readonly problems: readonly string[];
  readonly files: readonly string[];
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly bundle: Readonly<Record<string, unknown>>;
};
