#!/usr/bin/env node
/**
 * M23.8 — REPORT WHAT AN ALREADY-BUILT PRODUCT EXTENSION CONTAINS.
 *
 * It does not build, start a browser, or open a model: see `../support/product-build-inspection.mjs`. It
 * reads whatever is in `.output/chrome-mv3`, so the record says which commit is checked out and when the
 * manifest was written, and what it reports is only as current as that build. A build that was not made
 * from this commit is not this commit's evidence.
 *
 * Exit 0: no boundary problem. Exit 1: a problem, listed. Exit 2: no build to inspect.
 *
 * M23.9: `--label` names the record, so a later milestone's does not take an earlier one's name.
 *
 * Usage: node tests/browser/extension/inspect-product-build.mjs [--record <directory> [--label <name>]]
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_PRODUCT_FILES, inspectProductBuild } from "../support/product-build-inspection.mjs";
import { assertOwnEvidencePath, evidenceFileName, resolveWorkstation } from "../support/workstation.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const BUILD = join(ROOT, "apps", "extension", ".output", "chrome-mv3");

if (!existsSync(join(BUILD, "manifest.json"))) {
  console.log("no build at apps/extension/.output/chrome-mv3; this tool inspects one and never makes one");
  process.exit(2);
}

const report = inspectProductBuild(BUILD, EXPECTED_PRODUCT_FILES);
const workstation = resolveWorkstation();
const git = (args) => execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8" }).trim();
const record = {
  what: "static inspection of an existing product build: manifest, file names and JavaScript text. No model file was opened, nothing was built, and no browser was started",
  workstation: workstation.id,
  gitHead: git("rev-parse HEAD"),
  buildManifestWrittenAt: statSync(join(BUILD, "manifest.json")).mtime.toISOString(),
  recordedAt: new Date().toISOString(),
  ...report,
};
console.log(JSON.stringify(record, null, 2));

const at = process.argv.indexOf("--record");
if (at !== -1) {
  const directory = resolve(process.argv[at + 1] ?? ".");
  const labelAt = process.argv.indexOf("--label");
  const label = labelAt === -1 ? "current" : (process.argv[labelAt + 1] ?? "current");
  mkdirSync(directory, { recursive: true });
  const target = assertOwnEvidencePath(join(directory, evidenceFileName(workstation, `${label}-product-build-inspection.json`)), workstation);
  writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  console.log(`written: ${target.slice(ROOT.length + 1).replace(/\\/g, "/")}`);
}
process.exit(report.problems.length === 0 ? 0 : 1);
