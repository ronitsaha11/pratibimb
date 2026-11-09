/** Types for `csp-product-phase.mjs`, so the TypeScript tests can import it. The module is the source of truth. */
export const PRODUCT_CSP: Readonly<Record<string, string>>;
export const PRODUCT_PERMISSIONS: readonly string[];
export const EVIDENCE_ONLY_PERMISSIONS: readonly string[];
export const EVIDENCE_PERMISSIONS: readonly string[];
export function evidencePermissionProblems(permissions: unknown): readonly string[];
export function permissionDeltaProblems(productPermissions: unknown, evidencePermissions: unknown): readonly string[];
export const PRODUCT_HOST_PERMISSIONS: readonly string[];
export function ortSmokeCheck(phase: string, ortSmoke: unknown): Readonly<Record<string, boolean>>;
export function parseCsp(policy: unknown): Record<string, string> | null;
export function productManifestProblems(manifest: unknown): readonly string[];
export function productPackageProblems(
  fileNames: readonly string[],
  expected: { readonly ortFiles: readonly string[]; readonly tr01File: string }
): readonly string[];
