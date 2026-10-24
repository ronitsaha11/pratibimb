/**
 * M20 — what the human-in-the-loop smoke test and the benchmark write, and how.
 *
 * Small and pure where it can be, so the properties the records rest on are tested without a
 * browser: a timeline is monotonic and value-free, a turn is projected to codes and times only, a
 * new record never overwrites an old one, and shutdown happens once however many signals arrive.
 */
import { writeFileSync } from "node:fs";

/** Names and codes only: upper-case identifiers, digits, `_` and `:`. Anything else is refused. */
const CODE = /^[A-Z0-9_:]+$/;

/**
 * A harness's own timeline, on the monotonic clock: milliseconds since it was created. An event is a
 * fixed name and at most a code; a free-text argument is refused, so page text cannot slip in.
 */
export function createTimeline(now = () => performance.now()) {
  const origin = now();
  const events = [];
  return {
    events,
    mark(event, code) {
      if (!CODE.test(event)) throw new Error(`timeline: "${event}" is not an event name`);
      if (code !== undefined && !CODE.test(String(code))) throw new Error(`timeline: the code for ${event} is not a code`);
      const atMs = Math.round((now() - origin) * 100) / 100;
      const last = events.at(-1);
      if (last && atMs < last.atMs) throw new Error("timeline: the clock went backwards");
      events.push({ event, atMs, ...(code === undefined ? {} : { code: String(code) }) });
    },
  };
}

/** Non-decreasing times, and every event named as an event. */
export function isOrdered(events) {
  return events.every((e, i) => CODE.test(e.event) && typeof e.atMs === "number" && (i === 0 || e.atMs >= events[i - 1].atMs));
}

/**
 * One turn of a run, reduced to what may be recorded: states, causes, classes, ids of controls the
 * page declared, the verifier's answer, the run's event trail and its measured timings. No plan
 * literal, no label, no preview, no value — fields are copied by name, never spread.
 */
export function projectTurn(turn, index) {
  const steps = Array.isArray(turn?.plan?.steps) ? turn.plan.steps : [];
  return {
    turn: index + 1,
    state: turn?.state ?? null,
    refusal: turn?.refusal ? { stage: turn.refusal.stage, cause: turn.refusal.cause } : null,
    reasonerKind: turn?.reasonerKind ?? null,
    fallback: turn?.fallback ? { fellBack: turn.fallback.fellBack === true } : null,
    planOps: steps.map((s) => ({ op: s.op, ...(typeof s.target === "string" ? { target: s.target } : {}) })),
    consents: (turn?.consents ?? []).map((c) => ({ target: c.target, piiClass: c.piiClass, outcome: c.outcome })),
    clarifications: (turn?.clarifications ?? []).map((c) => ({ target: c.target, candidates: c.candidates, outcome: c.outcome })),
    rehydrated: (turn?.rehydrated ?? []).map((r) => ({ target: r.target, piiClass: r.piiClass, inserted: r.inserted === true })),
    verification: turn?.act?.verification?.verification ?? null,
    declaredDone: turn?.declaredDone === true,
    declarationSource: turn?.declaration?.source ?? null,
    events: (turn?.events ?? []).map((e) => ({ event: e.event, atMs: e.atMs, ...(e.code === undefined ? {} : { code: e.code }) })),
    transitions: (turn?.transitions ?? []).map((t) => ({ from: t.from, to: t.to, elapsedMs: t.elapsedMs })),
    timings: Object.fromEntries(Object.entries(turn?.timings ?? {}).filter(([, v]) => typeof v === "number")),
  };
}

/** The values a record must never contain, found anywhere in it. */
export const leaksIn = (anything, values) => values.filter((v) => JSON.stringify(anything ?? null).includes(v));

/** A run id for a filename: the start time, to the second, and nothing that names a person. */
export const runIdOf = (date = new Date()) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/**
 * Write a record that does not exist yet. An existing file is history and is never replaced: the
 * write fails (`EEXIST`) instead, and the caller says so.
 */
export function writeNewRecord(path, record) {
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

/**
 * Shut down once. Ctrl+C, a closed browser and a normal finish may all ask; the first runs `work`,
 * the rest get the same promise.
 */
export function onceOnly(work) {
  let running = null;
  return (...args) => {
    running ??= Promise.resolve().then(() => work(...args));
    return running;
  };
}
