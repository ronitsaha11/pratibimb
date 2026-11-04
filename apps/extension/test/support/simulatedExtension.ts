/**
 * M23.8 — THE EXTENSION'S OWN REALMS, IN NODE, WITH EVERY BROWSER API FAKED AND COUNTED.
 *
 * WHAT IS REAL. `host/background.ts`, `host/offscreen/main.ts`, `runExtensionTask`, the orchestrator,
 * the privacy boundary, the plan validator, the execution gate, VERIFY RESULT, the egress guard and the
 * page agent. A task reaches them the way it does in a browser: a `RUN_TASK` message, through the
 * listeners those files registered.
 *
 * WHAT IS FAKE. The `chrome` object, the page (`SimulatedDocument`, plus a small fake DOM holding
 * synthetic canaries for the privacy boundary), the model server (a `fetch` stub answering whatever
 * the test scripted), ORT (`entrypoints/ortRuntime` is replaced) and every capture and worker API.
 * `content.ts` is not run, because it needs a real DOM; `serveBoundary` below repeats its few lines.
 *
 * WHAT THIS IS NOT. A browser. It says nothing about what Chrome does: not whether `activeTab` gates
 * `getMediaStreamId`, not how a message is delivered, not whether a page can reach anything. It proves
 * what this repository's code asks for, which is the question the DOM-only boundary turns on: does
 * an ordinary product task ask for a frame, a model or a worker? Every such request lands on a counter
 * here, so "it did not ask" is an observation rather than a reading of the source.
 *
 * NO MODEL FILE IS READ. The only bytes a fake `t1-ui-head.onnx` fetch returns are three synthetic
 * ones, and no real session, worker, frame or model server exists.
 */
import { vi } from "vitest";

import {
  SimulatedDocument,
  type FixtureElement,
} from "../../../../packages/extension-transport/test/support/simulatedBrowser";
import { createPageAgent, parseAttachedNotice, TRANSPORT_PORT_NAME, type PagePoint, type StructuralEvent, type VisualRegionReading } from "@pratibimb/extension-transport";

import { createPagePrivacyBoundary, type PagePrivacyBoundary } from "../../host-lib/page-privacy-boundary";
import { type BoundaryReply, type BoundaryRequest, type CapabilityPayload } from "../../host-lib/boundary-protocol";

export const EXTENSION_ID = "pratibimb-simulated-extension";
export const EXTENSION_ROOT = `chrome-extension://${EXTENSION_ID}/`;
/** The one address a product build may reach (ADR-0013). */
export const REASONER_ENDPOINT = "http://127.0.0.1:8995/v1/chat/completions";
export const PAGE_ORIGIN = "http://127.0.0.1:8975";
export const TAB_ID = 7;
export const FRAME_ID = 0;

const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

// ── the page ──────────────────────────────────────────────────────────────────────────────────────

/** The repository's synthetic canaries (SECURITY.md §2). Named so their ABSENCE can be asserted. */
export const CANARIES = { name: "Ramesh Kumar", phone: "9000000001", otherPhone: "9000000002" } as const;

export interface InputSpec {
  readonly id: string;
  readonly value: string;
  readonly type: string;
  readonly label: string;
  readonly autocomplete?: string;
}

interface FakeInput {
  readonly tagName: "INPUT";
  readonly id: string;
  value: string;
  disabled: boolean;
  readOnly: boolean;
  readonly labels: readonly { textContent: string }[];
  getAttribute(name: string): string | null;
  dispatchEvent(): boolean;
}

const fakeInput = (spec: InputSpec): FakeInput => ({
  tagName: "INPUT",
  id: spec.id,
  value: spec.value,
  disabled: false,
  readOnly: false,
  labels: [{ textContent: spec.label }],
  getAttribute: (name) => (name === "type" ? spec.type : name === "autocomplete" ? (spec.autocomplete ?? null) : null),
  dispatchEvent: () => true,
});

/** A textbox element and the input holding its value, on one row of the fixture. */
const textbox = (id: string, name: string, row: number): FixtureElement => ({
  selector: `#${id}`,
  role: "textbox",
  name,
  box: { x: 100, y: 100 + row * 60, w: 300, h: 40 },
  enabled: true,
});

/** A control on the fixture's second column. Even sizes, so the centre a click uses is an integer. */
export const control = (id: string, name: string, row: number, onClick?: FixtureElement["onClick"], role = "button"): FixtureElement => ({
  selector: `#${id}`,
  role,
  name,
  box: { x: 500, y: 100 + row * 60, w: 120, h: 40 },
  enabled: true,
  ...(onClick ? { onClick } : {}),
});

export interface PageSpec {
  readonly elements: readonly FixtureElement[];
  readonly inputs: readonly InputSpec[];
  readonly visualRegions?: readonly VisualRegionReading[];
  /** `false`: the document has no structural observer, as a page the agent could not watch would. */
  readonly structurallyObserved?: boolean;
}

/**
 * A small registration page: a stored name, a stored number, an empty field that takes that number,
 * two working controls, a disabled one and a link. And a canvas and an image, whose geometry the page
 * agent reports exactly as it does in a browser: a visual-only region exists whether or not anyone
 * looks at it, and the task must not start looking because of one.
 */
export const registrationPage = (): PageSpec => ({
  elements: [
    textbox("name", "Full name", 0),
    textbox("mobile", "Mobile number", 1),
    textbox("mobile_confirm", "Confirm mobile number", 2),
    control("submit", "Submit", 0, (_document, element) => {
      element.enabled = false;
    }),
    control("cancel", "Cancel", 1),
    { ...control("archive", "Archive", 2), enabled: false },
    control("help", "Help", 3, undefined, "link"),
  ],
  inputs: [
    { id: "name", value: CANARIES.name, type: "text", label: "Full name", autocomplete: "name" },
    { id: "mobile", value: CANARIES.phone, type: "tel", label: "Mobile number", autocomplete: "tel" },
    { id: "mobile_confirm", value: "", type: "tel", label: "Confirm mobile number", autocomplete: "tel" },
  ],
  visualRegions: [
    { id: "img:0", kind: "img", rect: { x: 700, y: 100, w: 200, h: 120 } },
    { id: "canvas:0", kind: "canvas", rect: { x: 700, y: 260, w: 200, h: 120 } },
  ],
});

/**
 * The fixture, plus the one thing the real DOM surface has and `SimulatedDocument` does not: a
 * structural observer. Without one the freshness gate refuses every click ("an unestablished staleness
 * is not a fresh one"), which is correct and is itself asserted in the tests.
 */
export class TaskPage extends SimulatedDocument {
  private emit: ((event: StructuralEvent) => void) | null = null;
  /** Runs just after the next reading is answered: a page that moves once the client has looked. */
  afterNextMeasure: (() => void) | null = null;

  constructor(
    tabId: number,
    documentId: string,
    origin: string,
    private readonly regions: readonly VisualRegionReading[],
    private readonly observed: boolean
  ) {
    super(tabId, documentId, origin);
    // The page agent asks whether the surface HAS an observer. An unobserved page has none to call.
    if (!this.observed) Object.defineProperty(this, "watchStructure", { value: undefined });
  }
  override visualRegions(): VisualRegionReading[] {
    return this.regions.map((r) => ({ ...r, rect: { ...r.rect } }));
  }
  override measure() {
    const reading = super.measure();
    const after = this.afterNextMeasure;
    this.afterNextMeasure = null;
    if (after) void Promise.resolve().then(after);
    return reading;
  }
  watchStructure(onChange: (event: StructuralEvent) => void): () => void {
    this.emit = onChange;
    return () => {
      this.emit = null;
    };
  }
  /** What a MutationObserver would report after the page changed under the client. */
  structureChanged(): void {
    this.emit?.({ nodes: true, attributes: true, text: true, resized: false });
  }
  override prepareClick(element: FixtureElement, point: PagePoint) {
    const prepared = super.prepareClick(element, point);
    return {
      coordinatesExact: prepared.coordinatesExact,
      fire: () => {
        prepared.fire();
        this.structureChanged();
      },
    };
  }
}

// ── the rig ───────────────────────────────────────────────────────────────────────────────────────

/** The request the model server was sent, as `sendVerified` put it on the wire. */
export interface ModelRequest {
  readonly url: string;
  readonly method: string | undefined;
  readonly contentType: string | undefined;
  /** The exact string that crossed. */
  readonly raw: string;
  readonly body: {
    readonly messages: readonly { readonly role: string; readonly content: unknown }[];
    readonly response_format?: { readonly json_schema?: { readonly schema?: unknown } };
    readonly [key: string]: unknown;
  };
}

/** What the fake model answers: plan steps, or a raw HTTP body. */
export type ModelReply = readonly unknown[] | { readonly rawBody: string; readonly status?: number } | "UNAVAILABLE";
export type ModelScript = (request: ModelRequest, turn: number, page: TaskPage) => ModelReply;

export interface RigOptions {
  /** The value `wxt.config.ts` would substitute for `__EVIDENCE_BUILD__`. */
  readonly evidenceBuild: boolean;
  readonly page?: PageSpec;
  readonly model?: ModelScript;
  /**
   * A REGRESSION, on purpose: the build's gates stop gating, so a task gets its perception pass back and
   * the realm may load T1. It stands in for someone wiring perception back into a product task, so a
   * test can show the checks would catch that. Since M23.9 the gate is the flag itself, in place.
   */
  readonly reintroducePerceptionInProductTasks?: boolean;
  /** How the fake TR-01 worker answers INIT. */
  readonly tr01?: "READY" | "INIT_FAILED";
  /**
   * The fake `getUserMedia`, playing the browser's part: refuse a stream id the fake `getMediaStreamId`
   * did not mint. Off by default, and the extension's own code does not make this check (M23.8, F-4).
   * It models what M3.1 recorded of Chrome and establishes nothing about Chrome.
   */
  readonly browserHonoursOnlyMintedStreamIds?: boolean;
  /** Collects the context `host/offscreen/main.ts` hands the TR-01 probe, if it hands it any. */
  readonly tr01ProbeContexts?: unknown[];
}

export interface Sender {
  readonly id: string;
  readonly url?: string;
  readonly tab?: { readonly id: number };
  readonly frameId?: number;
  readonly documentId?: string;
  readonly origin?: string;
}

export interface VisualActivity {
  /** `CAPTURE_FRAME` messages: the perception realm asking the worker for a frame. */
  readonly captureRequests: number;
  readonly mintedStreamIds: number;
  readonly workerFrameCaptures: number;
  readonly getUserMedia: number;
  readonly grabFrame: number;
  readonly createImageBitmap: number;
  readonly canvases: number;
  readonly ortBootstraps: number;
  readonly t1Fetches: number;
  readonly inferenceSessions: number;
  readonly inferences: number;
  readonly tr01Workers: number;
  readonly tr01Inits: number;
  readonly tr01Frames: number;
}

/** What an ordinary DOM-only task must leave behind: nothing at all. */
export const NO_VISUAL_ACTIVITY: VisualActivity = Object.freeze({
  captureRequests: 0,
  mintedStreamIds: 0,
  workerFrameCaptures: 0,
  getUserMedia: 0,
  grabFrame: 0,
  createImageBitmap: 0,
  canvases: 0,
  ortBootstraps: 0,
  t1Fetches: 0,
  inferenceSessions: 0,
  inferences: 0,
  tr01Workers: 0,
  tr01Inits: 0,
  tr01Frames: 0,
});

type Listener = (message: unknown, sender: Sender, sendResponse: (reply: unknown) => void) => unknown;

interface HostControlPlane {
  readonly runTask: (request: object) => Promise<{ ok: boolean; result?: never; refused?: string }>;
  readonly grantPeek: () => Promise<{ pending: unknown }>;
  readonly grantDecide: (granted: boolean) => Promise<unknown>;
  readonly toOffscreen: (message: object) => Promise<unknown>;
  readonly captureState: () => { grants: readonly unknown[]; workerFrameEnabled: boolean };
}

/** What only an evidence build's control plane has (M23.9, OD-S). Read through `driversOf`. */
export interface EvidenceDrivers {
  readonly perceiveOnce: (tabId: number, frameId: number) => Promise<unknown>;
  readonly consumeProbe: () => Promise<unknown>;
  readonly mintStreamId: (tabId: number) => Promise<unknown>;
  readonly ticketProbe: (tabId: number, documentId?: string) => Promise<unknown>;
}

export interface Rig {
  readonly page: TaskPage;
  /** Inputs on the page, for what a restoration actually wrote. */
  readonly inputs: ReadonlyMap<string, { value: string }>;
  readonly modelRequests: ModelRequest[];
  /** Everything `fetch` was asked for, in order. */
  readonly fetched: string[];
  /** Every message kind any realm sent, in order. */
  readonly messages: string[];
  /** The stream id each `getUserMedia` was given. */
  readonly mediaSourceIds: readonly string[];
  /** Live media handed back: tracks stopped and bitmaps closed. */
  readonly released: { readonly tracks: number; readonly bitmaps: number };
  readonly host: HostControlPlane & Partial<EvidenceDrivers>;
  visualActivity(): VisualActivity;
  /** The toolbar click: a person invoking the extension on the tab. */
  clickToolbar(): void;
  /** The tab starting to load another document, which is what revokes a grant. */
  navigate(): void;
  /** Deliver a message to the offscreen listener with a sender the test chooses. */
  sendToOffscreen(message: object, sender: Sender): Promise<unknown>;
  /** Deliver a message to the service worker's listener with a sender the test chooses. */
  sendToWorker(message: object, sender: Sender): Promise<unknown>;
  /** Run a task to its end, answering every human grant with `grant`, or leaving it unanswered. */
  run(request: object, options?: { readonly grant?: boolean }): Promise<{ ok: boolean; result?: RunResultShape; refused?: string }>;
  dispose(): void;
}

/** The parts of `ExtensionRunResult` the tests read. Typed loosely: it has crossed a message. */
export interface RunResultShape {
  readonly record: TurnShape;
  readonly loop?: { readonly outcome: string; readonly maxTurns: number; readonly confirmedActions: number; readonly turns: readonly TurnShape[] };
  readonly ports: { readonly perception: readonly { ran: boolean; refusal: { code: string } | null; detector: { ran: boolean } }[]; readonly observations: number };
  readonly perceptionBoot: unknown;
  readonly egress: readonly { record?: { destination: string }; refusal?: { cause: string } }[];
  readonly grant: { readonly asked: boolean; readonly granted: boolean | null };
}

export interface TurnShape {
  readonly state: string;
  readonly refusal: { readonly stage: string; readonly cause: string } | null;
  readonly handoff: HandoffShape | null;
  readonly handoffSerialized: string | null;
  readonly plan: { readonly steps: readonly { readonly op: string; readonly target?: string }[] } | null;
  readonly reasonerKind: string | null;
  readonly fallback: unknown;
  readonly rehydrated: readonly { readonly target: string }[] | null;
  readonly declaredDone: boolean;
  readonly act: { readonly reached?: unknown; readonly verification?: { readonly verification: string } | null } | null;
  readonly fill: { readonly fillable: readonly { target: string; ref: string }[]; readonly withheld: readonly { target: string; cause: string }[] } | null;
  readonly clarifications: readonly { readonly target: string; readonly outcome: string }[];
  readonly consents: readonly { readonly target: string; readonly outcome: string }[];
}

export interface HandoffShape {
  readonly capability: { readonly backend: string; readonly tiers_fired: readonly string[] };
  readonly capture: { readonly scale_to_css: number };
  readonly elements: readonly { readonly id: string; readonly role: string; readonly name: string; readonly source: string; readonly enabled: boolean; readonly visible: boolean; readonly offscreen: boolean }[];
  readonly redactions: readonly { readonly token: string; readonly targetId: string; readonly class: string }[];
}

const asReply = (steps: readonly unknown[]): string => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ steps }) } }] });

/** Plans nothing: the safe default, so a test that forgot a script reads as a refusal, not a click. */
const silentModel: ModelScript = () => "UNAVAILABLE";

/** A flat, opaque synthetic frame at the fixture's viewport size. Never a browser frame. */
const syntheticFrame = (): { width: number; height: number; rgba: Uint8ClampedArray } => ({
  width: 1024,
  height: 768,
  rgba: new Uint8ClampedArray(1024 * 768 * 4).fill(255),
});

export async function bootSimulatedExtension(options: RigOptions): Promise<Rig> {
  vi.resetModules();

  const counters = { ...NO_VISUAL_ACTIVITY } as { -readonly [K in keyof VisualActivity]: number };
  const messages: string[] = [];
  const modelRequests: ModelRequest[] = [];
  const fetched: string[] = [];
  const mediaSourceIds: string[] = [];
  const released = { tracks: 0, bitmaps: 0 };
  const swListeners: Listener[] = [];
  const offscreenListeners: Listener[] = [];
  const connectListeners: ((port: unknown) => void)[] = [];
  const actionListeners: ((tab: { id: number }) => void)[] = [];
  const updatedListeners: ((tabId: number, change: { status?: string }) => void)[] = [];
  const mintedStreamIds = new Set<string>();
  let registering: "sw" | "offscreen" = "sw";

  const offscreenSender: Sender = { id: EXTENSION_ID, url: `${EXTENSION_ROOT}offscreen.html` };
  const workerSender: Sender = { id: EXTENSION_ID, url: `${EXTENSION_ROOT}background.js` };

  const kindOf = (message: unknown): string => {
    const m = message as { kind?: unknown; channel?: unknown } | null;
    return typeof m?.kind === "string" ? m.kind : typeof m?.channel === "string" ? "TRANSPORT" : "?";
  };

  const deliver = (listeners: readonly Listener[], message: unknown, sender: Sender): Promise<unknown> =>
    new Promise((resolve) => {
      let responded = false;
      let kept = false;
      const delivered = clone(message);
      for (const listener of listeners) {
        const result = listener(delivered, sender, (reply) => {
          responded = true;
          resolve(clone(reply));
        });
        if (result === true) kept = true;
      }
      if (!kept && !responded) resolve(undefined);
    });

  // ── the page's world ──────────────────────────────────────────────────────────────────────────
  const spec = options.page ?? registrationPage();
  const documentId = "doc-1";
  const page = new TaskPage(TAB_ID, documentId, PAGE_ORIGIN, spec.visualRegions ?? [], spec.structurallyObserved ?? true);
  page.elements = spec.elements.map((e) => ({ ...e, box: { ...e.box } }));
  const inputs = spec.inputs.map(fakeInput);
  const byId = new Map(inputs.map((element) => [`#${element.id}`, element]));
  const fakeDocument = {
    querySelectorAll: (selector: string) => (selector === "input" || selector.includes("input") ? inputs : inputs.filter((element) => `#${element.id}` === selector)),
    querySelector: (selector: string) => byId.get(selector) ?? null,
  };
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("Event", class {});
  const privacy: PagePrivacyBoundary = createPagePrivacyBoundary({ document: fakeDocument as unknown as Document });

  const contentSender: Sender = {
    id: EXTENSION_ID,
    url: `${PAGE_ORIGIN}/fixture.html`,
    tab: { id: TAB_ID },
    frameId: FRAME_ID,
    documentId,
    origin: PAGE_ORIGIN,
  };

  /** `content.ts`'s `serveBoundary`: the value-holding side of a boundary request. */
  const serveBoundary = async (request: BoundaryRequest): Promise<BoundaryReply> => {
    if (request.kind === "CLASSIFY") return privacy.classify(request.ask);
    if (request.kind === "FORGET") return privacy.forget();
    if (request.kind === "PREVIEW") return privacy.preview(request.ref, request.target);
    const collected = (await deliver(
      offscreenListeners,
      { target: "offscreen", kind: "BOUNDARY_COLLECT", nonce: request.nonce, field: request.target },
      contentSender
    )) as { released?: boolean; payload?: CapabilityPayload; refused?: string } | undefined;
    if (collected?.released !== true || collected.payload === undefined) return { ok: false, refused: collected?.refused ?? "NO_RESPONSE" };
    return collected.payload.kind === "QUESTION" ? privacy.answer(collected.payload.texts) : privacy.release(collected.payload.ask);
  };

  // ── chrome ────────────────────────────────────────────────────────────────────────────────────
  const fakeChrome = {
    runtime: {
      id: EXTENSION_ID,
      lastError: undefined,
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
      getURL: (path: string) => `${EXTENSION_ROOT}${path}`,
      getContexts: async () => [{}],
      onMessage: {
        addListener: (listener: Listener) => {
          (registering === "sw" ? swListeners : offscreenListeners).push(listener);
        },
      },
      onConnect: { addListener: (listener: (port: unknown) => void) => connectListeners.push(listener) },
      /**
       * Addressed messages go to the offscreen document, from the worker's control plane; the rest
       * go to the worker, from the offscreen document. Those are the two directions the product uses.
       * A sender a test wants to choose goes through `sendToOffscreen`.
       */
      sendMessage: (message: unknown) => {
        messages.push(kindOf(message));
        const addressed = (message as { target?: unknown } | null)?.target === "offscreen";
        return addressed ? deliver(offscreenListeners, message, workerSender) : deliver(swListeners, message, offscreenSender);
      },
    },
    offscreen: { Reason: { WORKERS: "WORKERS" }, createDocument: async () => undefined },
    action: { onClicked: { addListener: (listener: (tab: { id: number }) => void) => actionListeners.push(listener) } },
    tabCapture: {
      // A fresh handle each time, as Chrome's are: the capture authority refuses one it has seen.
      getMediaStreamId: async () => {
        counters.mintedStreamIds += 1;
        const handle = `opaque-stream-handle-${counters.mintedStreamIds}`;
        mintedStreamIds.add(handle);
        return handle;
      },
    },
    tabs: {
      onUpdated: { addListener: (listener: (tabId: number, change: { status?: string }) => void) => updatedListeners.push(listener) },
      onRemoved: { addListener: () => undefined },
      captureVisibleTab: async () => {
        counters.workerFrameCaptures += 1;
        return "data:image/png;base64,AAAA";
      },
      get: async () => ({ id: TAB_ID, width: 1024, height: 768 }),
      query: async () => [{ id: TAB_ID }],
      sendMessage: async (tabId: number, message: { kind?: string; body?: BoundaryRequest }) => {
        messages.push(`to-tab:${kindOf(message)}`);
        if (tabId !== TAB_ID) throw new Error("Could not establish connection. Receiving end does not exist.");
        if (message.kind !== "BOUNDARY" || message.body === undefined) return { refused: "UNKNOWN_KIND" };
        return clone(await serveBoundary(clone(message.body)));
      },
    },
  };
  vi.stubGlobal("chrome", fakeChrome);

  // ── what `wxt.config.ts` would have substituted, and what a page load would have defined ───────
  vi.stubGlobal("__EVIDENCE_BUILD__", options.evidenceBuild || options.reintroducePerceptionInProductTasks === true);
  vi.stubGlobal("__M3_WORKER_FRAME__", false);
  vi.stubGlobal("__REASONER_ENDPOINT__", REASONER_ENDPOINT);
  vi.stubGlobal("defineBackground", (main: () => void) => {
    main();
    return {};
  });
  vi.stubGlobal("self", { location: { href: `${EXTENSION_ROOT}offscreen.html` } });
  // `ort.all.min.js` is a classic script in offscreen.html, so the global exists in every build.
  vi.stubGlobal("ort", { Tensor: class {}, env: { wasm: {} } });

  // ── every way to get a pixel, a model or a worker: counted, and synthetic ──────────────────────
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async (constraints: { video?: { mandatory?: { chromeMediaSourceId?: string } } }) => {
        counters.getUserMedia += 1;
        const streamId = constraints.video?.mandatory?.chromeMediaSourceId ?? "";
        mediaSourceIds.push(streamId);
        if (options.browserHonoursOnlyMintedStreamIds && !mintedStreamIds.has(streamId)) {
          throw Object.assign(new Error("a stream id the browser did not mint"), { name: "NotAllowedError" });
        }
        return {
          getVideoTracks: () => [
            {
              stop: () => {
                released.tracks += 1;
              },
              getSettings: () => ({ width: 1024, height: 768 }),
            },
          ],
        };
      },
    },
  });
  vi.stubGlobal(
    "ImageCapture",
    class {
      async grabFrame() {
        counters.grabFrame += 1;
        return {
          width: 1024,
          height: 768,
          close: () => {
            released.bitmaps += 1;
          },
        };
      }
    }
  );
  vi.stubGlobal("createImageBitmap", async () => {
    counters.createImageBitmap += 1;
    return { width: 1024, height: 768, close: () => undefined };
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor() {
        counters.canvases += 1;
      }
      getContext() {
        return { drawImage: () => undefined, getImageData: () => ({ data: syntheticFrame().rgba }) };
      }
    }
  );
  const tr01Mode = options.tr01 ?? "READY";
  vi.stubGlobal(
    "Worker",
    class {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onmessageerror: ((event: unknown) => void) | null = null;
      constructor() {
        counters.tr01Workers += 1;
      }
      terminate() {
        /* nothing runs */
      }
      postMessage(message: { type: string; runId?: number }) {
        const reply =
          message.type === "TR01_INIT"
            ? (counters.tr01Inits += 1,
              tr01Mode === "READY"
                ? { type: "TR01_READY", protocol: 1, model: { sha256: "0".repeat(64), bytes: 3 }, ms: { runtime: 0, model: 0, session: 0 } }
                : { type: "TR01_INIT_FAILED", protocol: 1, code: "MODEL_UNAVAILABLE", detail: "synthetic", observed: { sha256: null, bytes: null } })
            : (counters.tr01Frames += 1,
              { type: "TR01_RESULT", protocol: 1, runId: message.runId, detections: [], ms: { preprocess: 0, infer: 0, postprocess: 0 } });
        void Promise.resolve().then(() => this.onmessage?.({ data: reply }));
      }
    }
  );

  const model = options.model ?? silentModel;
  let turn = 0;
  vi.stubGlobal("fetch", async (input: unknown, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const url = String(input);
    fetched.push(url);
    if (url.endsWith("t1-ui-head.onnx")) {
      counters.t1Fetches += 1;
      return new Response(new Uint8Array([1, 2, 3]));
    }
    if (url !== REASONER_ENDPOINT) throw new Error(`the rig has no service at ${url}`);
    const raw = init?.body ?? "";
    const request: ModelRequest = { url, method: init?.method, contentType: init?.headers?.["content-type"], raw, body: JSON.parse(raw) as ModelRequest["body"] };
    modelRequests.push(request);
    turn += 1;
    const reply = model(request, turn, page);
    if (reply === "UNAVAILABLE") throw new TypeError("connection refused");
    if ("rawBody" in reply) return new Response(reply.rawBody, { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
    return new Response(asReply(reply as readonly unknown[]), { status: 200, headers: { "content-type": "application/json" } });
  });

  vi.doMock("../../entrypoints/ortRuntime", () => ({
    resolvePackagedAsset: (name: string) => `${EXTENSION_ROOT}${name}`,
    bootstrapOrtRealm: async (context: string) => {
      counters.ortBootstraps += 1;
      return { context, pin: { synthetic: true }, capability: { synthetic: true } };
    },
    createPinnedInferenceSession: async () => {
      counters.inferenceSessions += 1;
      return {
        inputNames: ["images"],
        outputNames: ["output0"],
        run: async () => {
          counters.inferences += 1;
          return { output0: { data: new Float32Array(12 * 10), dims: [1, 12, 10] } };
        },
      };
    },
  }));
  // A product build's aliases (`wxt.config.ts`): the probes are absent. See the tests for the map itself.
  vi.doMock("#structural-probe", async () => import("../../probe/structural-absent"));
  vi.doMock("#tr01-probe", async () => {
    const absent = await import("../../probe/tr01-absent");
    const sink = options.tr01ProbeContexts;
    if (!sink) return absent;
    // Still takes nothing, as the stub does. It only records what it was handed.
    return {
      ...absent,
      serveTr01Probe: (_message: unknown, _sender: unknown, _sendResponse: unknown, context: unknown) => {
        sink.push(context);
        return false;
      },
    };
  });
  vi.doMock("#egress-evidence-probe", async () => import("../../probe/egress-evidence-absent"));

  // ── boot both realms, then open the page's port the way `connectPageTransport` does ────────────
  registering = "sw";
  await import("../../host/background");
  registering = "offscreen";
  await import("../../host/offscreen/main");

  const agent = createPageAgent(page);
  const swPortListeners: ((message: unknown) => void)[] = [];
  const port = {
    name: TRANSPORT_PORT_NAME,
    sender: contentSender,
    postMessage: (message: unknown) => {
      const delivered = clone(message);
      if (parseAttachedNotice(delivered)) return;
      void Promise.resolve().then(() => {
        const reply = agent.handle(delivered);
        if (reply !== null) for (const listener of swPortListeners) listener(clone(reply));
      });
    },
    disconnect: () => undefined,
    onMessage: { addListener: (listener: (message: unknown) => void) => swPortListeners.push(listener) },
    onDisconnect: { addListener: () => undefined },
  };
  for (const listener of connectListeners) listener(port);

  // `CAPTURE_FRAME` is counted where it arrives, so a request that was refused still counts.
  swListeners.unshift((message) => {
    if ((message as { kind?: unknown } | null)?.kind === "CAPTURE_FRAME") counters.captureRequests += 1;
    return false;
  });

  const host = (globalThis as unknown as { __host: HostControlPlane }).__host;

  return {
    page,
    inputs: byId,
    modelRequests,
    fetched,
    messages,
    mediaSourceIds,
    released,
    host,
    visualActivity: () => ({ ...counters }),
    clickToolbar: () => {
      for (const listener of actionListeners) listener({ id: TAB_ID });
    },
    navigate: () => {
      for (const listener of updatedListeners) listener(TAB_ID, { status: "loading" });
    },
    sendToOffscreen: (message, sender) => {
      messages.push(kindOf(message));
      return deliver(offscreenListeners, { target: "offscreen", ...message }, sender);
    },
    sendToWorker: (message, sender) => {
      messages.push(kindOf(message));
      return deliver(swListeners, message, sender);
    },
    async run(request, runOptions = {}) {
      let done = false;
      const answering =
        runOptions.grant === undefined
          ? Promise.resolve()
          : (async () => {
              while (!done) {
                const peek = await host.grantPeek();
                if (peek?.pending) await host.grantDecide(runOptions.grant!);
                await new Promise((resolve) => setTimeout(resolve, 1));
              }
            })();
      try {
        return (await host.runTask(request)) as { ok: boolean; result?: RunResultShape; refused?: string };
      } finally {
        done = true;
        await answering;
      }
    },
    dispose() {
      vi.unstubAllGlobals();
      vi.doUnmock("../../entrypoints/ortRuntime");
      vi.doUnmock("#structural-probe");
      vi.doUnmock("#tr01-probe");
      vi.doUnmock("#egress-evidence-probe");
      vi.resetModules();
    },
  };
}

/** The drivers only an evidence build has, for tests that booted one. In a product build they are undefined. */
export const driversOf = (rig: Rig): EvidenceDrivers => rig.host as unknown as EvidenceDrivers;

/** A task request, with the postcondition the fixture's `#submit` satisfies. */
export const taskRequest = (over: Record<string, unknown> = {}): object => ({
  tabId: TAB_ID,
  frameId: FRAME_ID,
  goal: "Submit the registration form",
  act: "SUCCESS",
  endpoint: REASONER_ENDPOINT,
  sessionId: "session-1",
  requestId: "request-1",
  postconditions: { "#submit": { kind: "TARGET_ENABLED", expected: false } },
  ...over,
});

/** The sanitized context the model was shown: the last user message, parsed. */
export const contextOf = (request: ModelRequest): Record<string, unknown> => {
  const last = request.body.messages[request.body.messages.length - 1];
  return JSON.parse(String(last?.content)) as Record<string, unknown>;
};

/** The worker's sender and the offscreen document's, for tests that need to name one. */
export const SENDERS = {
  worker: { id: EXTENSION_ID, url: `${EXTENSION_ROOT}background.js` } satisfies Sender,
  sidePanel: { id: EXTENSION_ID, url: `${EXTENSION_ROOT}sidepanel.html` } satisfies Sender,
  offscreen: { id: EXTENSION_ID, url: `${EXTENSION_ROOT}offscreen.html` } satisfies Sender,
  contentScript: { id: EXTENSION_ID, url: `${PAGE_ORIGIN}/fixture.html`, tab: { id: TAB_ID }, frameId: FRAME_ID, documentId: "doc-1", origin: PAGE_ORIGIN } satisfies Sender,
  otherExtension: { id: "some-other-extension", url: "chrome-extension://some-other-extension/background.js" } satisfies Sender,
};
