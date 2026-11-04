/** Types for `build-separation.mjs`, so the TypeScript tests can import it. The module is the source of truth. */
export const EVIDENCE_CONNECT_SRC: string;
export const EVIDENCE_REQUIRED_NAMES: { readonly worker: readonly string[]; readonly offscreen: readonly string[] };
export function evidenceReferenceFlags(options?: { readonly dryRun?: boolean }): Readonly<Record<string, string>>;

export interface BuildSnapshot {
  readonly worker: string;
  readonly content: string;
  readonly manifestRoute: string;
  readonly connectSrc: string | null;
  readonly permissions: readonly string[];
  readonly hostPermissions: readonly string[];
  readonly workerNames: readonly string[];
  readonly offscreenNames: readonly string[];
}
export function snapshotProductBuild(
  directory: string,
  expected?: { readonly ortFiles: readonly string[]; readonly tr01File: string }
): BuildSnapshot & { readonly boundaryProblems: readonly string[] };
export function snapshotEvidenceBuild(directory: string): BuildSnapshot;
export function judgeBuildSeparation(builds?: {
  readonly product?: (BuildSnapshot & { readonly boundaryProblems: readonly string[] }) | null;
  readonly reference?: BuildSnapshot | null;
  readonly evidence?: BuildSnapshot | null;
  readonly dryRun?: boolean;
}): {
  readonly problems: readonly string[];
  readonly notEnforcedInDryRun: readonly string[];
  readonly status: "NOT_EXAMINED" | "REFUSED" | "DRY_RUN_NOT_EVIDENCE" | "BUILD_OUTPUTS_SEPARATED";
  readonly measuredRoute: string;
  readonly establishes: string;
};
