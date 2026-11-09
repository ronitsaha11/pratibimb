/**
 * M23.8 — WHAT A DOM-ONLY PRODUCT TASK MUST SHOW, IN ONE PLACE.
 *
 * WHY THIS EXISTS. `run-consent-task.mjs` and `run-declared-task.mjs` asserted
 * `perception.every((p) => p.ran === false && p.refusal === "NO_ACTIVE_TAB_GRANT")`. Since M23.7 a
 * product task takes no perception pass, so that array is empty and `every` holds for ANY run,
 * including one that observed nothing at all. An assertion that cannot fail is not evidence.
 *
 * WHAT REPLACES IT. Two kinds of claim, and neither can pass on an empty run:
 *   - the visual tier stayed out: no perception pass, no perception realm;
 *   - the structural path really ran: the first turn has a handoff, with DOM elements in it, declaring
 *     the structural floor, and every model request carried the approved structural fields only.
 *
 * Pure and browser-free, so the assertions themselves are tested on every `npm test`
 * (`dom-only-checks.test.mjs`, and against real task records in
 * `apps/extension/test/domOnlyTaskPath.test.ts`). Value-free: a summary holds counts, roles and
 * declarations, never an accessible name, and a request is reported by what is wrong with it.
 */

/** `buildHandoffDraft`'s floor: structure and sanitization, and no claim of pixel evidence. */
export const STRUCTURAL_FLOOR = Object.freeze({ backend: "none", tiersFired: Object.freeze(["T0", "T2"]), scaleToCss: 1 });

/** Everything the model may be shown (`contextFor`, `packages/reasoner/src/localModel.ts`). */
export const APPROVED_REQUEST_FIELDS = Object.freeze({
  body: Object.freeze(["max_tokens", "messages", "model", "response_format", "temperature"]),
  context: Object.freeze(["buttons", "fields", "goal", "references"]),
  field: Object.freeze(["empty", "id", "name"]),
  button: Object.freeze(["enabled", "id", "name"]),
  reference: Object.freeze(["class", "hint", "token"]),
});

const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

/** A handoff as counts and declarations. `null` for a turn that produced none, stated rather than hidden. */
export function summariseHandoff(handoff) {
  if (!isRecord(handoff)) return null;
  const elements = Array.isArray(handoff.elements) ? handoff.elements : [];
  const roles = {};
  for (const e of elements) roles[e?.role] = (roles[e?.role] ?? 0) + 1;
  return {
    backend: handoff.capability?.backend ?? null,
    tiersFired: handoff.capability?.tiers_fired ?? null,
    scaleToCss: handoff.capture?.scale_to_css ?? null,
    elements: elements.length,
    roles,
    sources: [...new Set(elements.map((e) => e?.source))].sort(),
    visionOnly: elements.filter((e) => e?.source === "vision").length,
    references: Array.isArray(handoff.redactions) ? handoff.redactions.filter((r) => r?.token !== "").length : 0,
  };
}

/** Markers of image bytes in a text body: PNG and RIFF/WebP base64, data URLs, multipart image parts. */
const IMAGE_MARKERS = [
  ["DATA_URL", /data:image/i],
  ["PNG_BASE64", /iVBORw0KGgo/],
  ["RIFF_BASE64", /UklGR/],
  ["IMAGE_PART", /"(image_url|input_image|image)"\s*:/],
  ["LONG_BASE64_RUN", /[A-Za-z0-9+/]{200,}/],
];

const unexpectedKeys = (record, allowed) => Object.keys(record).filter((k) => !allowed.includes(k));

/**
 * What is wrong with one model request, as codes. An empty list is the only passing answer. Allow-lists,
 * not deny-lists: a new field is a problem until someone decides it is not.
 */
export function structuralRequestProblems(raw) {
  if (typeof raw !== "string" || raw.length === 0) return ["NO_REQUEST_BODY"];
  const problems = [];
  for (const [code, pattern] of IMAGE_MARKERS) if (pattern.test(raw)) problems.push(code);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return [...problems, "NOT_JSON"];
  }
  if (!isRecord(body)) return [...problems, "NOT_AN_OBJECT"];
  for (const key of unexpectedKeys(body, APPROVED_REQUEST_FIELDS.body)) problems.push(`BODY_KEY:${key}`);
  if (!Array.isArray(body.messages) || body.messages.length === 0) return [...problems, "NO_MESSAGES"];

  for (const message of body.messages) {
    if (!isRecord(message) || typeof message.content !== "string") {
      problems.push("MESSAGE_CONTENT_NOT_TEXT");
      continue;
    }
    if (message.role !== "user") continue;
    let context;
    try {
      context = JSON.parse(message.content);
    } catch {
      problems.push("USER_MESSAGE_NOT_JSON");
      continue;
    }
    if (!isRecord(context)) {
      problems.push("USER_MESSAGE_NOT_AN_OBJECT");
      continue;
    }
    for (const key of unexpectedKeys(context, APPROVED_REQUEST_FIELDS.context)) problems.push(`CONTEXT_KEY:${key}`);
    for (const required of APPROVED_REQUEST_FIELDS.context) if (!(required in context)) problems.push(`CONTEXT_MISSING:${required}`);
    const lists = [
      ["fields", APPROVED_REQUEST_FIELDS.field],
      ["buttons", APPROVED_REQUEST_FIELDS.button],
      ["references", APPROVED_REQUEST_FIELDS.reference],
    ];
    for (const [name, allowed] of lists) {
      if (!Array.isArray(context[name])) {
        problems.push(`${name.toUpperCase()}_NOT_A_LIST`);
        continue;
      }
      for (const entry of context[name]) {
        if (!isRecord(entry)) problems.push(`${name.toUpperCase()}_ENTRY_NOT_AN_OBJECT`);
        else for (const key of unexpectedKeys(entry, allowed)) problems.push(`${name.toUpperCase()}_KEY:${key}`);
      }
    }
  }
  return [...new Set(problems)];
}

/**
 * The claims one DOM-only product task may make. Every value is a boolean, so a harness can spread this
 * into its own `judged` object. A missing input is a failed claim, never a skipped one.
 *
 * @param perception     `result.ports.perception`
 * @param perceptionBoot `result.perceptionBoot`
 * @param handoffs       each turn's handoff, or its `summariseHandoff`, in order; `null` for a turn with none
 * @param modelRequests  the raw body of each request the model server received
 */
export function domOnlyTaskChecks({ perception, perceptionBoot, handoffs, modelRequests } = {}) {
  const summaries = (Array.isArray(handoffs) ? handoffs : []).map((h) => (isRecord(h) && "elements" in h && !Array.isArray(h.elements) ? h : summariseHandoff(h)));
  const present = summaries.filter((s) => s !== null);
  const requests = Array.isArray(modelRequests) ? modelRequests : [];
  return {
    // The visual tier stayed out.
    noPerceptionPassRan: Array.isArray(perception) && perception.length === 0,
    noPerceptionRealmWasBuilt: perceptionBoot === null,
    // The structural path really ran. These are what make the two above mean something.
    theFirstTurnObservedThePage: (summaries[0]?.elements ?? 0) > 0,
    everyHandoffNamedDomElements: present.length > 0 && present.every((s) => s.elements > 0),
    // And it said so accurately.
    backendDeclaresTheStructuralFloor: present.length > 0 && present.every((s) => s.backend === STRUCTURAL_FLOOR.backend),
    tiersDeclareTheStructuralFloor: present.length > 0 && present.every((s) => sameList(s.tiersFired, STRUCTURAL_FLOOR.tiersFired)),
    scaleDeclaresNoCapture: present.length > 0 && present.every((s) => s.scaleToCss === STRUCTURAL_FLOOR.scaleToCss),
    everyElementIsDomSourced: present.length > 0 && present.every((s) => sameList(s.sources, ["dom"])),
    noVisionOnlyElementEnteredAHandoff: present.length > 0 && present.every((s) => s.visionOnly === 0),
    // The reasoner boundary.
    theModelWasAsked: requests.length > 0,
    everyModelRequestWasStructural: requests.length > 0 && requests.every((raw) => structuralRequestProblems(raw).length === 0),
  };
}

/** The names of the claims that failed. */
export const failedChecks = (checks) => Object.entries(checks).filter(([, held]) => held !== true).map(([name]) => name);
