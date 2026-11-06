/**
 * M23.15 (OD-Z) — THE ACCEPTANCE DOCUMENTS AGREE WITH THE DOM-ONLY PHASE 1, AND LOSE NOTHING.
 *
 * Reads the four living documents as text. It checks that wording is accurate and that no criterion or classification has
 * moved. It says nothing about whether any criterion is met, and approves nothing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..", "..");
const doc = (name: string): string => readFileSync(join(ROOT, "docs", "acceptance", name), "utf8").replace(/\r\n/g, "\n");
const CORE = "core-product-acceptance-PROPOSED.md";
const TRACE = "traceability-matrix.md";
const SCOPE = "phase-1-architecture-scope.md";
const CHECKLIST = "release-readiness-checklist-PROPOSED.md";
const REGISTER = "owner-decisions.md";

const DISCLAIMER = "**What Phase 1 does not claim:**";

/** Every criterion and its class and status, as they stood at `b8c59a3`, before this milestone edited these documents. */
const BASELINE: Readonly<Record<string, readonly [string, string]>> = {
  "FUN-01": ["M", "PARTIAL"], "FUN-02": ["M", "PARTIAL"], "FUN-03": ["M", "PARTIAL"], "FUN-04": ["O", "PARTIAL"], "FUN-05": ["M", "NOT EVIDENCED"], "FUN-06": ["M", "PARTIAL"],
  "BRW-01": ["M", "PARTIAL"], "BRW-02": ["**OD** (OD-A)", "NOT EVIDENCED"], "BRW-03": ["**OD** (OD-A)", "NOT EVIDENCED"], "BRW-04": ["M", "PARTIAL"], "BRW-05": ["M (as written)", "PARTIAL"],
  "PRV-01": ["M", "PARTIAL"], "PRV-02": ["M", "NOT EVIDENCED"], "PRV-03": ["**OD** (OD-F)", "NOT EVIDENCED"], "PRV-04": ["M", "NOT EVIDENCED"], "PRV-05": ["M", "PARTIAL"], "PRV-06": ["M", "PARTIAL"], "PRV-07": ["M", "PARTIAL"],
  "SEC-01": ["M", "EVIDENCED (W1, CI)"], "SEC-02": ["M (decision)", "BLOCKED (owner)"], "SEC-03": ["M", "NOT EVIDENCED"], "SEC-04": ["M (frozen)", "EVIDENCED"], "SEC-05": ["M", "PARTIAL"], "SEC-06": ["M (decision)", "BLOCKED (owner)"], "SEC-07": ["M", "PARTIAL"], "SEC-08": ["M (frozen)", "EVIDENCED (as of `077f139`)"],
  "RSN-01": ["M", "PARTIAL"], "RSN-02": ["M", "PARTIAL"], "RSN-03": ["M", "PARTIAL"], "RSN-04": ["M", "PARTIAL"], "RSN-05": ["M", "EVIDENCED (A)"], "RSN-06": ["**OD**", "NOT EVIDENCED"], "RSN-07": ["M (governance)", "NOT EVIDENCED"],
  "ACT-01": ["M (frozen)", "EVIDENCED (A)"], "ACT-02": ["M", "PARTIAL"], "ACT-03": ["M", "PARTIAL"], "ACT-04": ["M", "PARTIAL"], "ACT-05": ["M", "PARTIAL"], "ACT-06": ["M", "NOT EVIDENCED"], "ACT-07": ["M", "UNKNOWN"],
  "REL-01": ["M", "NOT EVIDENCED"], "REL-02": ["M", "PARTIAL"], "REL-03": ["M", "PARTIAL"],
  "PRF-01": ["M (reporting)", "PARTIAL"], "PRF-02": ["M (reporting)", "PARTIAL"], "PRF-03": ["**OD** (OD-H)", "NOT EVIDENCED"],
  "XM-01": ["**OD** (OD-B)", "NOT EVIDENCED"], "XM-02": ["M", "UNKNOWN"], "HUM-01": ["**OD** (OD-C)", "NOT EVIDENCED"],
  "CI-01": ["M", "PARTIAL"], "CI-02": ["M", "PARTIAL"], "CI-03": ["M", "NOT EVIDENCED"],
  "GOV-01": ["M", "PROPOSED"], "GOV-02": ["M", "NOT EVIDENCED"], "GOV-03": ["M", "PROPOSED"], "GOV-04": ["M", "NOT EVIDENCED"], "GOV-05": ["M", "NOT EVIDENCED"], "GOV-06": ["M", "NOT EVIDENCED"], "GOV-07": ["M (statement)", "EVIDENCED (as recorded)"],
};

const matrix = (): string => {
  const core = doc(CORE);
  return core.slice(core.indexOf("## 5. Acceptance matrix"), core.indexOf("### 5.13 Phase 2"));
};
const criteria = (): Record<string, [string, string]> => {
  const out: Record<string, [string, string]> = {};
  for (const line of matrix().split("\n")) {
    const id = /^\| ([A-Z]+-\d+) \|/.exec(line)?.[1];
    if (!id) continue;
    const cells = line.split("|").map((c) => c.trim());
    out[id] = [cells[4]!, cells[cells.length - 2]!];
  }
  return out;
};
const rowOf = (id: string): string => matrix().split("\n").find((l) => l.startsWith(`| ${id} |`)) ?? "";

describe("nothing is lost: criteria integrity", () => {
  it("all 59 criteria are there, with the class and status they had", () => {
    expect(criteria()).toEqual(BASELINE);
    expect(Object.keys(BASELINE)).toHaveLength(59);
  });

  it("the 51 proposed-mandatory classifications are still 51, 7 still need an owner decision, and 1 is optional", () => {
    const classes = Object.values(criteria()).map(([c]) => c);
    expect(classes.filter((c) => c.startsWith("M")).length).toBe(51);
    expect(classes.filter((c) => c.startsWith("**OD**")).length).toBe(7);
    expect(classes.filter((c) => c === "O").length).toBe(1);
  });

  it("every Phase 2 entry stays, separate from the Phase 1 matrix, and not authorised", () => {
    const core = doc(CORE);
    const phase2 = core.slice(core.indexOf("### 5.13 Phase 2"), core.indexOf("### 5.14"));
    expect([...phase2.matchAll(/^\| (P2-\d+) /gm)].map((m) => m[1])).toEqual(["P2-01", "P2-02", "P2-03", "P2-04", "P2-05", "P2-06", "P2-07", "P2-08"]);
    expect(phase2).toContain("`FUTURE — NOT AUTHORISED FOR IMPLEMENTATION OR EXECUTION`");
    expect(matrix()).not.toMatch(/^\| P2-\d+ /m);
    expect(doc(CHECKLIST)).toContain("(P2-01 to P2-08)");
  });

  it("every affected criterion records its original source, its Phase 1 interpretation, its class and its evidence", () => {
    const core = doc(CORE);
    const section = core.slice(core.indexOf("### 5.14"), core.indexOf("## 6. The gates"));
    expect(section).toMatch(/\| ID \| Original source and wording \| Phase 1 interpretation \| Classification \(PROPOSED\) \| Evidence required \|/);
    for (const id of ["BRW-04", "BRW-05", "PRV-03", "PRV-04", "SEC-04", "SEC-05", "REL-03", "PRF-02", "GOV-05"]) {
      expect(section, id).toMatch(new RegExp(`^\\| ${id} \\|`, "m"));
    }
    expect(section.match(/\*\*(mandatory|deferred|unresolved)/g)?.length).toBeGreaterThanOrEqual(9);
    expect(section).toContain("PROPOSED — AWAITING OWNER APPROVAL");
  });
});

describe("BRW-04 is a DOM-only requirement", () => {
  it("says what it must", () => {
    const row = rowOf("BRW-04");
    expect(row).toContain("opens and operates in each browser accepted for Phase 1");
    expect(row).toContain("DOM-based observation");
    expect(row).toContain("structural grounding and click safety");
    expect(row).toContain("Browser-frame capture is not required for normal Phase 1 task execution");
  });

  it("the old requirement is gone from the criterion, and kept on record as its original wording", () => {
    expect(rowOf("BRW-04")).not.toContain("Gesture-authorised capture works");
    const core = doc(CORE);
    expect(core.slice(core.indexOf("### 5.14"))).toContain('"Gesture-authorised capture works in each accepted browser"');
  });

  it("claims no cross-browser acceptance, and does not count gesture evidence for it", () => {
    const row = rowOf("BRW-04");
    expect(row).toContain("No cross-browser claim is made");
    expect(row).toContain("M4 and M5 are gesture-capture evidence and **do not count here**");
    expect(row.endsWith("| PARTIAL |")).toBe(true);
  });

  it("the release checklist says the same, unticked", () => {
    const list = doc(CHECKLIST);
    expect(list).toContain("- [ ] **BRW-04:** the extension opens and operates in each browser accepted for Phase 1");
    expect(list).not.toMatch(/BRW-04[^\n]*gesture capture/);
  });
});

describe("no false Phase 1 gesture-capture claim", () => {
  it("the scope no longer says capture is gesture-authorised, and says what a normal task does", () => {
    const scope = doc(SCOPE);
    expect(scope).not.toContain("| Capture | gesture-authorised;");
    const capture = scope.split("\n").find((l) => l.startsWith("| Capture | **In normal Phase 1 tasks"));
    expect(capture).toContain("no browser-frame capture");
    expect(capture).toContain("No gesture grant is required for ordinary tasks");
    expect(capture).toContain("No T1 or TR-01 execution");
  });

  it("evidence-build capture is described separately, and labelled as not product behaviour", () => {
    const scope = doc(SCOPE);
    expect(scope).toContain("**Evidence-build diagnostics, which are not normal product behaviour.**");
    const diagnostics = scope.slice(scope.indexOf("**Evidence-build diagnostics"), scope.indexOf("**Resolved by the M23.3"));
    expect(diagnostics).toMatch(/\| Capture \| gesture-authorised \(ADR-0009\)/);
    expect(diagnostics).toContain("UNVERIFIED");
  });

  it("the core proposal's as-built table and the traceability matrix no longer present capture as what the product does", () => {
    const core = doc(CORE);
    expect(core).not.toContain("Frames **are captured and processed locally**; only frame **egress** is impossible");
    expect(core).toContain("**Normal task perception** | **DOM-based observation only (OD-R).**");
    const trace = doc(TRACE);
    expect(trace).not.toContain("is met by TR-01");
    expect(trace).not.toContain("| gesture-authorised capture (ADR-0009); structural change signal (ADR-0010) |");
    expect(trace).not.toContain("Chrome MV3; TR-01 local visual redaction");
    expect(trace).toContain("**In a normal Phase 1 task no vision model executes**");
  });
});

describe("the brief's deliverables: what is and is not fulfilled", () => {
  const mapping = (): string => {
    const trace = doc(TRACE);
    return trace.slice(trace.indexOf("## 1.6 Deliverable mapping"), trace.indexOf("## 2. The 12-stage pipeline"));
  };

  it("all four are mapped, in the five columns", () => {
    expect(mapping()).toMatch(/\| Deliverable \| What Phase 1 implements \| What Phase 1 does not fulfil \| Deferred to Phase 2 \| Still unverified \| Needs a separate owner decision \|/);
    for (const n of ["**1.**", "**2.**", "**3.**", "**4.**"]) expect(mapping(), n).toContain(n);
    expect(mapping()).toContain("PROPOSED — AWAITING OWNER APPROVAL");
  });

  it("the brief's own wording is still quoted, unchanged", () => {
    const trace = doc(TRACE);
    expect(trace).toContain("### Deliverable 1: client extension in Chrome and Firefox, with a vision model executing locally");
    expect(trace).toContain("### Deliverable 3: a server hosting an open-weight LLM or VLM, returning a UI action");
  });

  it("it says plainly what is not fulfilled", () => {
    const m = mapping();
    expect(m).toContain("**no vision model runs in a normal task.**");
    expect(m).toContain("**visual-only PII protection is not operational.**");
    expect(m).toContain("**it is not a VLM, and does no visual reasoning.**");
    expect(m).toContain("T1 is UNADOPTED. TR-01's masked frames are not consumed in a normal task.");
  });
});

describe("visual-only PII stays unverified, and no document claims otherwise", () => {
  it("PRV-03 is still an owner decision, and not evidenced", () => {
    expect(criteria()["PRV-03"]).toEqual(["**OD** (OD-F)", "NOT EVIDENCED"]);
    expect(doc(CORE)).toContain("Visual-only PII protection is **NOT VERIFIED** and is **not operational** in the product");
  });

  it("no living document makes the claims this milestone must not", () => {
    const FALSE_CLAIMS = [
      /visual-only PII (protection )?is (operational|protected|verified)/i,
      /all visual PII is (protected|redacted)/i,
      /no visual processing anywhere/i,
      /(the )?Phase 1 (LLM|reasoner|model) is a VLM/i,
      /T1 is (an )?adopted/i,
      /masked frames? (is|are) consumed (in|during) normal/i,
      /Phase 1 fulfils the (brief|original)/i,
      /exhaustively proven/i,
      /evidence builds have the same capture restrictions/i,
    ];
    for (const name of [CORE, TRACE, SCOPE, CHECKLIST]) {
      // One line lists these claims in order to disclaim them. It alone is left out, and the next test pins it.
      const text = doc(name).split("\n").filter((line) => !line.startsWith(DISCLAIMER)).join("\n");
      for (const claim of FALSE_CLAIMS) expect(text, `${name}: ${claim}`).not.toMatch(claim);
    }
  });

  it("the one line left out of that scan is a disclaimer, and it disclaims all of them", () => {
    const line = doc(CORE).split("\n").find((l) => l.startsWith(DISCLAIMER));
    expect(line).toContain("that visual-only PII protection is operational; that its LLM is a VLM; that T1 is an adopted detector (it is UNADOPTED); that TR-01's masked frames are consumed in a normal task; or that it fulfils the brief's visual-reasoning requirements.");
    expect(doc(CORE).split("\n").filter((l) => l.startsWith(DISCLAIMER))).toHaveLength(1);
  });

  it("the privacy sentence is scoped to normal tasks wherever the scope states what a task does", () => {
    expect(doc(TRACE)).toContain("normal tasks send no page image to the reasoning model");
  });
});

describe("nothing is approved or declared", () => {
  it("each document still says PROPOSED, and the core one says it approves nothing", () => {
    for (const name of [CORE, TRACE, CHECKLIST]) expect(doc(name), name).toContain("PROPOSED — AWAITING OWNER APPROVAL");
    expect(doc(SCOPE)).toContain("**PROPOSED — AWAITING OWNER APPROVAL**");
    expect(doc(CORE)).toContain("| GOV-01 | This acceptance definition approved | this document | M | — | — | the approval | — | **owner** | — | PROPOSED |");
  });

  it("every box in the release checklist is unticked, and it says this is not a release", () => {
    const list = doc(CHECKLIST);
    expect(list.match(/^- \[x\]/gim)).toBeNull();
    expect(list.match(/^- \[ \]/gm)!.length).toBeGreaterThan(20);
    expect(list).toContain("PratiBimb — Page Assistant (Development build)");
    expect(list).toContain("Nothing here declares it release-ready.");
  });

  it("OD-Y and OD-Z are recorded as implemented, and that approves no classification", () => {
    const register = doc(REGISTER);
    const latest = register.slice(register.indexOf("## M23.15"));
    expect(latest).toMatch(/^\| OD-Y \|.*\*\*M23\.15: IMPLEMENTED/m);
    expect(latest).toMatch(/^\| OD-Z \|.*\*\*M23\.15: IMPLEMENTED/m);
    expect(latest).toContain("**No classification is approved by this.**");
    expect(latest.slice(latest.indexOf("**Still awaiting the owner:**"))).toContain("**All Phase 1 acceptance criteria.**");
  });

  it("FR-01 stays deferred, B-07 blocked, and no gate signed, in the register and the checklist", () => {
    const list = doc(CHECKLIST);
    expect(list).toContain("`DEFERRED — NOT AUTHORISED FOR EXECUTION`");
    expect(list).toContain("B-07 stays `BLOCKED`");
    const register = doc(REGISTER);
    const latest = register.slice(register.indexOf("## M23.15"));
    expect(latest).toContain("FR-01 (DEFERRED)");
    expect(latest).toContain("**B-07 remains blocked.**");
    for (const pending of ["GOV-01", "OD-N", "OD-E1"]) expect(latest, pending).toContain(pending);
    expect(latest).toContain("**QG-04-S and QG-04-F are not signed.**");
  });
});
