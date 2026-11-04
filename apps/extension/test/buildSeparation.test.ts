/**
 * M23.8 — THE PRODUCT/EVIDENCE SEPARATION, RUN RATHER THAN READ, WITHOUT BUILDING ANYTHING.
 *
 * `wxt.config.ts` decides what a build contains. M23.7 pinned it by reading its text. This loads the real
 * file once per set of build flags and runs its real `build:publicAssets` hook against an empty asset
 * list, so what is asserted is the list the build would package.
 *
 * NO MODEL FILE IS OPENED. `node:fs` is replaced for this file's loads: reading any `.onnx` gets synthetic
 * bytes (TR-01) or an exception (T1), and the T1 asset is only ever a path on a list. Nothing is copied
 * and no evidence build is produced, so this says what the CONFIGURATION selects. Whether an evidence
 * build still WORKS at run time is unverified (`docs/acceptance/evidence-build-preservation-assessment.md`).
 *
 * M23.9 (OD-S): a flag read at run time cannot show what a bundler leaves out, and a real `wxt build` needs a
 * git-ignored model. So the extension's own TypeScript is also bundled here, in memory, with this
 * configuration's product flags and aliases, and the result is searched. Only ever with the product's flags:
 * no evidence variant is built, nothing is written, no asset is touched and nothing runs. It is esbuild and
 * not WXT's Rollup; an actual product build is inspected by `tests/browser/extension/inspect-product-build.mjs`.
 */
import { createHash } from "node:crypto";
import { readFileSync as readSourceFile } from "node:fs";
import { join, relative as relativePath } from "node:path";

import { build as bundle } from "esbuild";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCsp, PRODUCT_CSP, productManifestProblems, productPackageProblems } from "../../../tests/browser/support/csp-product-phase.mjs";
import { EXPECTED_PRODUCT_FILES } from "../../../tests/browser/support/product-build-inspection.mjs";
import { ORT_PIN } from "../../../packages/security/src/generated/ortPin";
import { TR01_PACKAGE } from "../host-lib/tr01-pin";

interface Asset {
  readonly absoluteSrc: string;
  readonly relativeDest: string;
}
interface LoadedConfig {
  readonly alias: Readonly<Record<string, string>>;
  readonly vite: () => { readonly define: Readonly<Record<string, string>>; readonly resolve: { readonly alias: Readonly<Record<string, string>> } };
  readonly manifest: { readonly permissions: readonly string[]; readonly host_permissions: readonly string[]; readonly content_security_policy: { readonly extension_pages: string }; readonly [key: string]: unknown };
  readonly hooks: { readonly "build:publicAssets": (wxt: unknown, assets: Asset[]) => void };
}

const FLAGS = ["TR01_PROBE", "M3_WORKER_FRAME", "STRUCTURAL_PROBE", "E6_PROBE", "EGRESS_EVIDENCE_PROBE"] as const;
type Flag = (typeof FLAGS)[number];

const ORT_FILES = [ORT_PIN.bundle.name, ORT_PIN.artifact.name, ORT_PIN.glue.name];
const TR01_FILE = TR01_PACKAGE.onnx.name;
const T1_FILE = "t1-ui-head.onnx";
const SYNTHETIC_TR01 = Buffer.from("synthetic bytes, not a model");

interface Disk {
  readonly t1: boolean;
  readonly tr01: "MATCHES_THE_PIN" | "TAMPERED" | "MISSING";
}

let touched: { t1Stats: number; t1Reads: number; tr01Reads: number };

/** The real `wxt.config.ts`, for these flags, over a disk the test describes. */
async function loadConfig(flags: readonly Flag[] = [], disk: Disk = { t1: true, tr01: "MATCHES_THE_PIN" }): Promise<LoadedConfig> {
  vi.resetModules();
  touched = { t1Stats: 0, t1Reads: 0, tr01Reads: 0 };
  for (const flag of FLAGS) vi.stubEnv(flag, flags.includes(flag) ? "1" : "");
  vi.doMock("wxt", () => ({ defineConfig: (config: unknown) => config }));
  vi.doMock("../host-lib/tr01-pin", async (original) => {
    const real = await original<typeof import("../host-lib/tr01-pin")>();
    return {
      ...real,
      // The pin of the synthetic bytes: a build that hashes them finds a match, so the refusal path is
      // reached only by a real mismatch.
      TR01_PACKAGE: { ...real.TR01_PACKAGE, onnx: { ...real.TR01_PACKAGE.onnx, sha256: createHash("sha256").update(SYNTHETIC_TR01).digest("hex"), bytes: SYNTHETIC_TR01.length } },
    };
  });
  vi.doMock("node:fs", async (original) => {
    const real = await original<typeof import("node:fs")>();
    const isT1 = (path: unknown): boolean => String(path).replace(/\\/g, "/").endsWith(`/${T1_FILE}`);
    const isTr01 = (path: unknown): boolean => String(path).replace(/\\/g, "/").endsWith(`/${TR01_PACKAGE.modelPath.split("/").pop()}`);
    const existsSync = (path: Parameters<typeof real.existsSync>[0]): boolean => {
      if (isT1(path)) {
        touched.t1Stats += 1;
        return disk.t1;
      }
      if (isTr01(path)) return disk.tr01 !== "MISSING";
      if (String(path).replace(/\\/g, "/").includes("/onnxruntime-web/dist/")) return true;
      return real.existsSync(path);
    };
    const readFileSync = (path: Parameters<typeof real.readFileSync>[0], ...rest: unknown[]): unknown => {
      if (isT1(path)) {
        touched.t1Reads += 1;
        throw new Error("the T1 model must never be read here");
      }
      if (isTr01(path)) {
        touched.tr01Reads += 1;
        return disk.tr01 === "TAMPERED" ? Buffer.from("the wrong bytes, at the right length?") : SYNTHETIC_TR01;
      }
      if (String(path).endsWith(".onnx")) throw new Error(`no model file may be read here: ${String(path)}`);
      return (real.readFileSync as (...args: unknown[]) => unknown)(path, ...rest);
    };
    return { ...real, default: { ...real, existsSync, readFileSync }, existsSync, readFileSync };
  });
  // A variable, so TypeScript does not pull the bundler's configuration types into this project.
  const CONFIG = "../wxt.config";
  return ((await import(/* @vite-ignore */ CONFIG)) as { default: LoadedConfig }).default;
}

const assetsOf = (config: LoadedConfig): readonly Asset[] => {
  const assets: Asset[] = [];
  config.hooks["build:publicAssets"](undefined, assets);
  return assets;
};
const destinations = (config: LoadedConfig): readonly string[] => assetsOf(config).map((a) => a.relativeDest);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("wxt");
  vi.doUnmock("node:fs");
  vi.doUnmock("../host-lib/tr01-pin");
  vi.resetModules();
});

describe("a product build", () => {
  it("the build-inspection tool expects exactly what the pins name", () => {
    expect([...EXPECTED_PRODUCT_FILES.ortFiles].sort()).toEqual([...ORT_FILES].sort());
    expect(EXPECTED_PRODUCT_FILES.tr01File).toBe(TR01_FILE);
  });

  it("packages ORT and TR-01, and not T1", async () => {
    const files = destinations(await loadConfig());
    expect(productPackageProblems(files, { ortFiles: ORT_FILES, tr01File: TR01_FILE })).toEqual([]);
    expect([...files].sort()).toEqual([...ORT_FILES, TR01_FILE].sort());
  });

  it("never looks at the T1 file: it neither needs it nor checks for it", async () => {
    for (const t1 of [true, false]) {
      const files = destinations(await loadConfig([], { t1, tr01: "MATCHES_THE_PIN" }));
      expect(files).not.toContain(T1_FILE);
      expect(touched.t1Stats).toBe(0);
      expect(touched.t1Reads).toBe(0);
    }
  });

  it("substitutes the flag the task path reads, as false", async () => {
    const { define } = (await loadConfig()).vite();
    expect(define.__EVIDENCE_BUILD__).toBe("false");
    expect(define.__M3_WORKER_FRAME__).toBe("false");
    expect(define.__REASONER_ENDPOINT__).toBe(JSON.stringify("http://127.0.0.1:8995/v1/chat/completions"));
  });

  it("resolves every probe alias to its empty stub", async () => {
    expect((await loadConfig()).alias).toEqual({
      "#e6-probe": "e6/absent.ts",
      "#structural-probe": "probe/structural-absent.ts",
      "#tr01-probe": "probe/tr01-absent.ts",
      "#tr01-instrument": "probe/tr01-instrument-absent.ts",
      "#egress-evidence-probe": "probe/egress-evidence-absent.ts",
    });
  });

  it("has exactly ADR-0013's policy, the same permissions including tabCapture, and loopback hosts only", async () => {
    const { manifest } = await loadConfig();
    expect(productManifestProblems(manifest)).toEqual([]);
    expect(manifest.permissions).toContain("tabCapture");
    expect(parseCsp(manifest.content_security_policy.extension_pages)?.["connect-src"]).toBe(PRODUCT_CSP["connect-src"]);
  });
});

const APP = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ENTRY_POINTS = ["host/background.ts", "host/offscreen/main.ts", "host/sidepanel/main.ts", "host/content.ts", "host/tr01-worker.ts"];

/** A regression, for the negative controls: one file's text, with one gate taken out. */
interface GateRemoved {
  readonly file: string;
  readonly gate: string;
  readonly replacement: string;
}

/** The extension's own code as `wxt.config.ts`'s product flags and aliases leave it: entry point to text. */
async function productBundle(removed?: GateRemoved): Promise<Readonly<Record<string, string>>> {
  const config = await loadConfig();
  const vite = config.vite();
  expect(vite.define.__EVIDENCE_BUILD__, "this helper builds the product's flags, and only those").toBe("false");
  const aliases: Readonly<Record<string, string>> = {
    ...Object.fromEntries(Object.entries(config.alias).map(([name, target]) => [name, join(APP, target)])),
    ...vite.resolve.alias,
  };
  const result = await bundle({
    absWorkingDir: APP,
    entryPoints: ENTRY_POINTS,
    outbase: APP,
    outdir: join(APP, "in-memory"),
    entryNames: "[dir]/[name]",
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    treeShaking: true,
    minifySyntax: true,
    logLevel: "silent",
    define: { ...vite.define },
    plugins: [
      {
        name: "wxt-aliases",
        setup(build) {
          build.onResolve({ filter: /^(#|@pratibimb\/)/ }, (args) => {
            const path = aliases[args.path];
            if (path === undefined) throw new Error(`no alias for ${args.path}`);
            return { path };
          });
          if (removed === undefined) return;
          const target = join(APP, removed.file).replace(/\\/g, "/");
          build.onLoad({ filter: /\.ts$/ }, (args) => {
            if (args.path.replace(/\\/g, "/") !== target) return undefined;
            const code = readSourceFile(args.path, "utf8").replace(/\r\n/g, "\n");
            if (!code.includes(removed.gate)) throw new Error(`the gate is not in ${removed.file}: ${removed.gate}`);
            return { contents: code.replace(removed.gate, removed.replacement), loader: "ts" };
          });
        },
      },
    ],
  });
  return Object.fromEntries(result.outputFiles.map((file) => [relativePath(join(APP, "in-memory"), file.path).replace(/\\/g, "/"), file.text]));
}

describe("M23.9 (OD-S) — the product bundle, from source: what its flags and aliases leave", () => {
  /**
   * Names, not behaviour. esbuild keeps identifiers here (`minifyIdentifiers` is off), so a function that
   * survived tree-shaking is found by its name. Comments are dropped, so a mention in one is not a match.
   */
  const ABSENT = [
    "PERCEIVE_ONCE",
    "STREAM_CONSUME",
    "perceiveOnce",
    "consumeProbe",
    "mintStreamId",
    "ticketProbe",
    "CAPTURE_FRAME",
    "CAPTURE_TICKET",
    "perceiveTab",
    "ensurePerception",
    "createPerceptionRealm",
    "chromeMediaSourceId",
    "grabFrame",
    "createTr01Host",
    "spawnTr01Worker",
    "textRegionHost",
  ];

  it("names no hook, no driver, no ticket and no capture path, in any entry point", async () => {
    const outputs = await productBundle();
    expect(Object.keys(outputs).sort()).toEqual(["host/background.js", "host/content.js", "host/offscreen/main.js", "host/sidepanel/main.js", "host/tr01-worker.js"]);
    for (const [entry, text] of Object.entries(outputs)) {
      for (const name of ABSENT) expect(text.includes(name), `${name} in ${entry}`).toBe(false);
    }
  }, 30_000);

  it("calls no `getUserMedia`: the side-effect-free surface probe only asks whether it exists", async () => {
    const offscreen = (await productBundle())["host/offscreen/main.js"]!;
    expect(offscreen).not.toMatch(/\.getUserMedia\s*\(/);
    expect(offscreen).toMatch(/typeof navigator\.mediaDevices\?\.getUserMedia/);
  }, 30_000);

  it("still carries the whole product: the task path, the panel's routes and the M13 positive control", async () => {
    const outputs = await productBundle();
    const offscreen = outputs["host/offscreen/main.js"]!;
    const worker = outputs["host/background.js"]!;
    for (const kind of ["RUN_TASK", "TASK_PREPARE", "TASK_START", "TASK_STATUS", "GRANT_DECIDE", "CONSENT_DECIDE", "CLARIFY_DECIDE", "BOUNDARY_COLLECT", "TRANSPORT_OBSERVE", "ORT_SMOKE", "REALM_PROBE", "UI_HEAD_NOT_IN_PRODUCT_BUILD"]) {
      expect(offscreen.includes(kind), kind).toBe(true);
    }
    for (const kind of ["HOST_STATUS", "TO_PAGE_BOUNDARY", "HELLO", "RELAY_ECHO", "toOffscreen", "captureState", "captureStatus"]) {
      expect(worker.includes(kind), kind).toBe(true);
    }
  }, 30_000);

  it("keeps the gesture authority: the toolbar's grant, the panel's status and `tabCapture`", async () => {
    const worker = (await productBundle())["host/background.js"]!;
    expect(worker).toMatch(/chrome\.tabCapture\.getMediaStreamId/);
    expect(worker).toContain("capture.grant(");
    expect(worker).toContain("capture.status(");
  }, 30_000);

  describe("the negative controls: take any one gate out, and the same search finds what it was keeping out", () => {
    const MAIN = "host/offscreen/main.ts";
    const WORKER = "host/background.ts";
    const CONTROLS: readonly (GateRemoved & { readonly output: string; readonly finds: string })[] = [
      { file: MAIN, gate: '__EVIDENCE_BUILD__ && msg.kind === "PERCEIVE_ONCE"', replacement: 'msg.kind === "PERCEIVE_ONCE"', output: "host/offscreen/main.js", finds: "PERCEIVE_ONCE" },
      { file: MAIN, gate: '__EVIDENCE_BUILD__ && msg.kind === "STREAM_CONSUME"', replacement: 'msg.kind === "STREAM_CONSUME"', output: "host/offscreen/main.js", finds: "STREAM_CONSUME" },
      { file: MAIN, gate: "__EVIDENCE_BUILD__ &&\n    serveTr01Probe(", replacement: "serveTr01Probe(", output: "host/offscreen/main.js", finds: "perceiveTab" },
      { file: MAIN, gate: "...(__EVIDENCE_BUILD__\n        ? taskPerception<", replacement: "...(true\n        ? taskPerception<", output: "host/offscreen/main.js", finds: "ensurePerception" },
      { file: WORKER, gate: "...(__EVIDENCE_BUILD__\n      ? {", replacement: "...(true\n      ? {", output: "host/background.js", finds: "perceiveOnce" },
      { file: WORKER, gate: '__EVIDENCE_BUILD__ && msg?.kind === "CAPTURE_FRAME"', replacement: 'msg?.kind === "CAPTURE_FRAME"', output: "host/background.js", finds: "CAPTURE_FRAME" },
    ];
    for (const control of CONTROLS) {
      it(`${control.file}: without \`${control.gate.replace(/\n\s*/g, " ")}\`, it finds ${control.finds}`, async () => {
        const outputs = await productBundle(control);
        expect(outputs[control.output]!.includes(control.finds)).toBe(true);
      }, 30_000);
    }
  });
});

describe("TR-01's integrity check is unchanged, in every build", () => {
  for (const flags of [[], ["TR01_PROBE"]] as readonly (readonly Flag[])[]) {
    const name = flags.length === 0 ? "product" : "evidence";

    it(`${name}: hashes the file, and packages it only when the hash and the size match the pin`, async () => {
      const files = destinations(await loadConfig(flags));
      expect(files).toContain(TR01_FILE);
      expect(touched.tr01Reads).toBe(1);
    });

    it(`${name}: refuses bytes that do not match`, async () => {
      const config = await loadConfig(flags, { t1: true, tr01: "TAMPERED" });
      expect(() => assetsOf(config)).toThrow(/Refusing to package it/);
    });

    it(`${name}: refuses a missing file`, async () => {
      const config = await loadConfig(flags, { t1: true, tr01: "MISSING" });
      expect(() => assetsOf(config)).toThrow(/missing/);
    });
  }
});

describe("an evidence build: what the configuration selects, for each flag", () => {
  for (const flag of FLAGS) {
    it(`${flag}=1 packages T1, by path and without opening it, with TR-01 and ORT`, async () => {
      const assets = assetsOf(await loadConfig([flag]));
      const t1 = assets.find((a) => a.relativeDest === T1_FILE);
      expect(t1?.absoluteSrc.replace(/\\/g, "/")).toMatch(/\/artifacts\/models\/t1-ui-head\/t1-ui-head\.onnx$/);
      expect(assets.map((a) => a.relativeDest).sort()).toEqual([...ORT_FILES, TR01_FILE, T1_FILE].sort());
      expect(touched.t1Reads).toBe(0);
    });

    it(`${flag}=1 substitutes the flag as true, so a task keeps its perception pass`, async () => {
      expect((await loadConfig([flag])).vite().define.__EVIDENCE_BUILD__).toBe("true");
    });

    it(`${flag}=1 still refuses to build without the T1 file, as every build did before M23.7`, async () => {
      const config = await loadConfig([flag], { t1: false, tr01: "MATCHES_THE_PIN" });
      expect(() => assetsOf(config)).toThrow(/missing .*t1-ui-head\.onnx/);
    });
  }

  it("each flag selects its own probe and no other", async () => {
    const real: Readonly<Record<Flag, readonly (readonly [string, string])[]>> = {
      TR01_PROBE: [["#tr01-probe", "probe/tr01.ts"], ["#tr01-instrument", "probe/tr01-instrument.ts"]],
      STRUCTURAL_PROBE: [["#structural-probe", "probe/structural.ts"]],
      E6_PROBE: [["#e6-probe", "e6/probe.ts"]],
      EGRESS_EVIDENCE_PROBE: [["#egress-evidence-probe", "probe/egress-evidence.ts"]],
      M3_WORKER_FRAME: [],
    };
    const stubs = (await loadConfig()).alias;
    for (const flag of FLAGS) {
      const { alias } = await loadConfig([flag]);
      expect(alias, flag).toEqual({ ...stubs, ...Object.fromEntries(real[flag]) });
    }
  });

  it("only M3_WORKER_FRAME compiles the worker-frame route in, and brings <all_urls> with it", async () => {
    for (const flag of FLAGS) {
      const config = await loadConfig([flag]);
      const worker = flag === "M3_WORKER_FRAME";
      expect(config.vite().define.__M3_WORKER_FRAME__, flag).toBe(String(worker));
      expect(config.manifest.host_permissions, flag).toEqual(worker ? ["http://127.0.0.1/*", "<all_urls>"] : ["http://127.0.0.1/*"]);
    }
  });

  it("differs from a product build's CSP in connect-src alone, and keeps the same permissions", async () => {
    const product = await loadConfig();
    const productCsp = parseCsp(product.manifest.content_security_policy.extension_pages)!;
    for (const flag of FLAGS) {
      const evidence = await loadConfig([flag]);
      const evidenceCsp = parseCsp(evidence.manifest.content_security_policy.extension_pages)!;
      expect(evidenceCsp["connect-src"], flag).toBe("'self' http://127.0.0.1:8995");
      expect({ ...evidenceCsp, "connect-src": null }, flag).toEqual({ ...productCsp, "connect-src": null });
      expect(evidence.manifest.permissions, flag).toEqual(product.manifest.permissions);
    }
  });
});
