/**
 * Minimal host — side panel shell. Displays host status. Every control is inert except one (M17):
 * answering a "which stored value?" question a run is waiting on.
 * No settings, no history, no telemetry, no state management.
 */
import { panelAnswer, panelViewOf } from "../../host-lib/clarification-panel";

// NOT `status`: `window.status` is a DOM global of type `string`, so a module-scope `const status`
// collides with it. The build never noticed because nothing type-checked this file.
const statusEl = document.getElementById("status");
const captureEl = document.getElementById("capture");

/**
 * What a person has to do, in one line.
 *
 * ADR-0009 accepts that a fresh toolbar invocation is required after navigation, and is explicit
 * that this is "a deliberate fail-closed behavior, not a defect to be hidden". Hiding it would mean
 * a capture refusing somewhere nobody can see; this is the smallest place to say it out loud.
 */
const CAPTURE_TEXT: Record<string, string> = {
  NO_GRANT: "Not authorised. Click the toolbar button to let PratiBimb look at this tab.",
  GRANTED: "Authorised. No frame taken yet.",
  STREAM_AVAILABLE: "Authorised for the page currently open.",
  DOCUMENT_CHANGED: "The page changed. Click the toolbar button again to re-authorise.",
  REVOKED: "Authorisation ended when the tab navigated. Click the toolbar button again.",
};

async function refresh() {
  try {
    const s = (await chrome.runtime.sendMessage({ kind: "HOST_STATUS" })) as {
      captureStatus?: { lifecycle: string; requiresReauth: boolean } | null;
    };
    if (statusEl) statusEl.textContent = JSON.stringify(s, null, 2);
    if (captureEl) {
      const lifecycle = s?.captureStatus?.lifecycle ?? "NO_GRANT";
      captureEl.textContent = CAPTURE_TEXT[lifecycle] ?? lifecycle;
      captureEl.dataset.lifecycle = lifecycle;
      captureEl.dataset.requiresReauth = String(s?.captureStatus?.requiresReauth ?? true);
    }
    document.documentElement.dataset.hostStatus = "ok";
  } catch (e) {
    if (statusEl) statusEl.textContent = `status unavailable: ${e instanceof Error ? e.message : String(e)}`;
    document.documentElement.dataset.hostStatus = "error";
  }
}

void refresh();

/**
 * M17 — "WHICH STORED VALUE?", asked here and answered here.
 *
 * The offscreen document holds the question; this page reads it and sends back a typed answer built
 * by `panelAnswer` from the question's own fields and one candidate it offered. Nothing typed by
 * anyone travels: there is no text box. Every label is page text, so it is rendered with
 * `textContent` and never as markup. The answer is checked again by the orchestrator and by privacy.
 */
const clarifyBox = document.getElementById("clarify");
const clarifyQuestion = document.getElementById("clarify-question");
const clarifyOptions = document.getElementById("clarify-options");
const clarifyUse = document.getElementById("clarify-use") as HTMLButtonElement | null;
const clarifyDecline = document.getElementById("clarify-decline") as HTMLButtonElement | null;
const clarifyResult = document.getElementById("clarify-result");

let shown: { readonly raw: unknown; readonly id: string } | null = null;

const selected = (): string | null =>
  (clarifyOptions?.querySelector<HTMLInputElement>('input[name="clarify-candidate"]:checked')?.value ?? null);

function renderClarification(raw: unknown): void {
  const view = panelViewOf(raw);
  if (view === null) {
    shown = null;
    if (clarifyBox) clarifyBox.hidden = true;
    document.documentElement.dataset.clarification = "none";
    return;
  }
  if (shown?.id === view.clarificationId) return; // already on screen; keep the person's selection
  shown = { raw, id: view.clarificationId };
  if (clarifyQuestion) clarifyQuestion.textContent = view.question;
  if (clarifyOptions) {
    clarifyOptions.replaceChildren(
      ...view.options.map((option) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "clarify-candidate";
        input.value = option.candidateId;
        input.addEventListener("change", () => {
          if (clarifyUse) clarifyUse.disabled = selected() === null;
        });
        label.append(input, document.createTextNode(` ${option.text}`));
        const row = document.createElement("div");
        row.append(label);
        return row;
      })
    );
  }
  if (clarifyUse) clarifyUse.disabled = true;
  if (clarifyResult) clarifyResult.textContent = "";
  if (clarifyBox) clarifyBox.hidden = false;
  document.documentElement.dataset.clarification = "pending";
}

async function answerClarification(candidateId: string | null): Promise<void> {
  if (shown === null) return;
  const answer = panelAnswer(shown.raw, candidateId);
  if (answer === null) {
    if (clarifyResult) clarifyResult.textContent = "Choose one of the options, or decline.";
    return;
  }
  const reply = (await chrome.runtime.sendMessage({ target: "offscreen", kind: "CLARIFY_DECIDE", answer })) as {
    answered?: boolean;
    refused?: string;
  };
  if (clarifyResult) {
    clarifyResult.textContent = reply?.answered
      ? candidateId === null
        ? "Declined. Nothing was filled."
        : "Answer sent. PratiBimb will still ask before it uses the value."
      : `Not sent (${reply?.refused ?? "no reply"}).`;
  }
  document.documentElement.dataset.clarification = reply?.answered ? (candidateId === null ? "declined" : "chosen") : "refused";
  shown = null;
  if (clarifyBox) clarifyBox.hidden = true;
}

clarifyUse?.addEventListener("click", () => void answerClarification(selected()));
clarifyDecline?.addEventListener("click", () => void answerClarification(null));

async function pollClarification(): Promise<void> {
  try {
    const reply = (await chrome.runtime.sendMessage({ target: "offscreen", kind: "CLARIFY_PEEK" })) as { pending?: unknown } | undefined;
    renderClarification(reply?.pending ?? null);
  } catch {
    renderClarification(null);
  }
}

void pollClarification();
setInterval(() => void pollClarification(), 1_000);
