/**
 * Minimal host — side panel shell. Displays host status, and has three working parts: answering a
 * "which stored value?" question a run is waiting on (M17), stating a task with what each click must
 * do (M18), and allowing — once — or denying a stored value's restoration (M19). Every other
 * control is inert.
 * No settings, no history, no telemetry, no state management.
 */
import { panelAnswer, panelViewOf } from "../../host-lib/clarification-panel";
import { consentAnswer, consentViewOf } from "../../host-lib/consent-panel";
import {
  OFFER_TEXT,
  addExpectation,
  describeExpectation,
  panelFormOf,
  summariseTask,
  taskAnswer,
  type Expectation,
  type PanelForm,
} from "../../host-lib/task-panel";

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

/**
 * M18 — THE TASK, AND WHAT EACH CLICK MUST DO, STATED BY THE PERSON.
 *
 * "Read this page" asks the offscreen document for a form: the page's controls and, for each, the
 * ADR-0007 results that are not already true. The person picks a control and a result, adds as many
 * as the task needs, and presses "Start task". The answer is built by `taskAnswer` from the form's
 * own bindings, so nothing typed here is a selector or a rule; `checkDeclaration` and then the run
 * itself decide what it is worth.
 */
const goalInput = document.getElementById("goal") as HTMLInputElement | null;
const taskRead = document.getElementById("task-read") as HTMLButtonElement | null;
const taskControls = document.getElementById("task-controls");
const taskExpect = document.getElementById("task-expect") as HTMLSelectElement | null;
const taskName = document.getElementById("task-name") as HTMLInputElement | null;
const taskAdd = document.getElementById("task-add") as HTMLButtonElement | null;
const taskDeclared = document.getElementById("task-declared");
const taskStart = document.getElementById("task-start") as HTMLButtonElement | null;
const taskStatus = document.getElementById("task-status");

let taskForm: PanelForm | null = null;
let expectations: readonly Expectation[] = [];

const say = (text: string): void => {
  if (taskStatus) taskStatus.textContent = text;
};
const chosenControl = (): string | null =>
  taskControls?.querySelector<HTMLInputElement>('input[name="task-control"]:checked')?.value ?? null;

function renderExpectOptions(): void {
  if (!taskExpect || !taskForm) return;
  const control = taskForm.controls.find((c) => c.controlId === chosenControl());
  taskExpect.replaceChildren(
    ...(control?.offers ?? []).map((offer) => {
      const option = document.createElement("option");
      option.value = offer;
      option.textContent = OFFER_TEXT[offer];
      return option;
    })
  );
  taskExpect.disabled = !control;
  if (taskAdd) taskAdd.disabled = !control;
  if (taskName) taskName.hidden = taskExpect.value !== "TARGET_RENAMED";
}

function renderDeclared(): void {
  if (!taskDeclared || !taskForm) return;
  const form = taskForm;
  taskDeclared.replaceChildren(
    ...expectations.map((e) => {
      const item = document.createElement("li");
      item.textContent = describeExpectation(form, e);
      return item;
    })
  );
  if (taskStart) taskStart.disabled = expectations.length === 0;
}

async function activeTabId(): Promise<number | null> {
  // The page the person is looking at: the active tab of the last focused ordinary window, so a
  // panel shown in its own window still names the page and not itself.
  const window = await chrome.windows.getLastFocused({ windowTypes: ["normal"], populate: true });
  return window.tabs?.find((tab) => tab.active)?.id ?? null;
}

taskRead?.addEventListener("click", () => {
  void (async () => {
    taskForm = null;
    expectations = [];
    taskControls?.replaceChildren();
    renderDeclared();
    const tabId = await activeTabId();
    if (tabId === null) return say("No page to read.");
    const reply = await chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_PREPARE", tabId });
    const form = panelFormOf(reply);
    if (form === null) return say(`Could not read the page (${(reply as { refused?: string } | undefined)?.refused ?? "no reply"}).`);
    taskForm = form;
    taskControls?.replaceChildren(
      ...form.controls.map((control) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "task-control";
        input.value = control.controlId;
        input.addEventListener("change", renderExpectOptions);
        label.append(input, document.createTextNode(` ${control.text}`));
        const row = document.createElement("div");
        row.append(label);
        return row;
      })
    );
    renderExpectOptions();
    document.documentElement.dataset.task = "form";
    say(form.controls.length === 0 ? "This page has no control PratiBimb could click." : `Read ${form.origin}. Choose a control and what clicking it should do.`);
  })();
});

taskExpect?.addEventListener("change", () => {
  if (taskName) taskName.hidden = taskExpect.value !== "TARGET_RENAMED";
});

taskAdd?.addEventListener("click", () => {
  if (!taskForm) return;
  const added = addExpectation(taskForm, expectations, chosenControl(), taskExpect?.value ?? null, taskName?.value ?? "");
  if (!added.ok) return say(added.reason);
  expectations = added.list;
  if (taskName) taskName.value = "";
  renderDeclared();
  say("Added. Add another, or start the task.");
});

taskStart?.addEventListener("click", () => {
  void (async () => {
    if (!taskForm) return;
    const answer = taskAnswer(taskForm, goalInput?.value ?? "", expectations);
    if (taskStart) taskStart.disabled = true; // one press, one answer; the desk refuses a second
    const reply = (await chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_START", answer })) as { ok?: boolean; refused?: string; at?: number } | undefined;
    if (reply?.ok) {
      document.documentElement.dataset.task = "started";
      say("Started.");
    } else {
      document.documentElement.dataset.task = "refused";
      say(`Not started: ${reply?.refused ?? "no reply"}${reply?.at === undefined ? "" : ` (expected result ${reply.at + 1})`}. Read the page again.`);
    }
  })();
});

async function pollTask(): Promise<void> {
  if (document.documentElement.dataset.task !== "started") return;
  try {
    const status = await chrome.runtime.sendMessage({ target: "offscreen", kind: "TASK_STATUS" });
    const task = (status as { task?: { state?: string } } | undefined)?.task;
    if (task && task.state !== "RUNNING") document.documentElement.dataset.task = "finished";
    say(summariseTask(status));
  } catch {
    /* the next poll will say */
  }
}

setInterval(() => void pollTask(), 1_000);

/**
 * M19 — "ALLOW PRATIBIMB TO USE YOUR …?", asked here, just before a stored value is restored.
 *
 * Shown: the site, the field's label, the kind of value, and the masked preview the page realm
 * produced — never the value, and there is no control that reveals it. Answered: "Allow once" or
 * "Deny", built by `consentAnswer` from the question's own fields. The answer covers this one
 * restoration; the orchestrator and the binder check it, and every gate after it still runs.
 */
const consentBox = document.getElementById("consent");
const consentAllow = document.getElementById("consent-allow") as HTMLButtonElement | null;
const consentDeny = document.getElementById("consent-deny") as HTMLButtonElement | null;
const consentResult = document.getElementById("consent-result");
let consentShown: { readonly raw: unknown; readonly id: string } | null = null;

const setText = (id: string, text: string): void => {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
};

function renderConsent(raw: unknown): void {
  const screen = consentViewOf(raw);
  if (screen === null) {
    consentShown = null;
    if (consentBox) consentBox.hidden = true;
    if (document.documentElement.dataset.consent === "pending") document.documentElement.dataset.consent = "none";
    return;
  }
  if (consentShown?.id === screen.consentId) return;
  consentShown = { raw, id: screen.consentId };
  setText("consent-heading", screen.heading);
  setText("consent-site", screen.site);
  setText("consent-field", screen.field);
  setText("consent-preview", screen.preview);
  setText("consent-statement", screen.statement);
  setText("consent-then", screen.then);
  if (consentResult) consentResult.textContent = "";
  if (consentAllow) consentAllow.disabled = false;
  if (consentDeny) consentDeny.disabled = false;
  if (consentBox) consentBox.hidden = false;
  document.documentElement.dataset.consent = "pending";
}

async function answerConsent(allow: boolean): Promise<void> {
  if (consentShown === null) return;
  const answer = consentAnswer(consentShown.raw, allow);
  if (answer === null) return;
  // One press, one answer: both buttons go dark until the next question.
  if (consentAllow) consentAllow.disabled = true;
  if (consentDeny) consentDeny.disabled = true;
  const reply = (await chrome.runtime.sendMessage({ target: "offscreen", kind: "CONSENT_DECIDE", answer })) as { answered?: boolean; refused?: string } | undefined;
  if (consentResult) {
    consentResult.textContent = reply?.answered
      ? allow
        ? "Allowed once. PratiBimb will check the field before restoring it."
        : "Denied. Nothing was restored."
      : `Not sent (${reply?.refused ?? "no reply"}).`;
  }
  document.documentElement.dataset.consent = reply?.answered ? (allow ? "allowed" : "denied") : "refused";
  consentShown = null;
  if (consentBox) consentBox.hidden = true;
}

consentAllow?.addEventListener("click", () => void answerConsent(true));
consentDeny?.addEventListener("click", () => void answerConsent(false));

async function pollConsent(): Promise<void> {
  try {
    const reply = (await chrome.runtime.sendMessage({ target: "offscreen", kind: "CONSENT_PEEK" })) as { pending?: unknown } | undefined;
    renderConsent(reply?.pending ?? null);
  } catch {
    renderConsent(null);
  }
}

void pollConsent();
setInterval(() => void pollConsent(), 1_000);
