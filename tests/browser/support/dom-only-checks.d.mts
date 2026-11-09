/** Types for `dom-only-checks.mjs`, so the TypeScript tests can import it. The module is the source of truth. */
export const STRUCTURAL_FLOOR: { readonly backend: string; readonly tiersFired: readonly string[]; readonly scaleToCss: number };
export const APPROVED_REQUEST_FIELDS: {
  readonly body: readonly string[];
  readonly context: readonly string[];
  readonly field: readonly string[];
  readonly button: readonly string[];
  readonly reference: readonly string[];
};
export interface HandoffSummary {
  readonly backend: string | null;
  readonly tiersFired: readonly string[] | null;
  readonly scaleToCss: number | null;
  readonly elements: number;
  readonly roles: Readonly<Record<string, number>>;
  readonly sources: readonly string[];
  readonly visionOnly: number;
  readonly references: number;
}
export function summariseHandoff(handoff: unknown): HandoffSummary | null;
export function structuralRequestProblems(raw: unknown): readonly string[];
export function domOnlyTaskChecks(input?: {
  readonly perception?: unknown;
  readonly perceptionBoot?: unknown;
  readonly handoffs?: readonly unknown[];
  readonly modelRequests?: readonly unknown[];
}): Readonly<Record<string, boolean>>;
export function failedChecks(checks: Readonly<Record<string, unknown>>): readonly string[];
