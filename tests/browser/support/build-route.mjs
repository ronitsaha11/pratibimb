/**
 * M13 (ADR-0013) — what "the evidence build's capture route is the product's" means once the two
 * builds' CSPs legitimately differ.
 *
 * Since ADR-0013 a product build's `connect-src` names the reasoner endpoint exactly, and an evidence
 * build names the whole collector origin (its test sink). Everything else in the manifest must still
 * be byte-identical, so the route hash covers the manifest with that ONE source normalised, and the
 * difference itself is recorded and checked separately — never ignored.
 *
 * M23.10 (OD-V): the worker is no longer part of what must match across those two builds. A product build has no
 * capture route, and `build-separation.mjs` holds the contract that replaced that comparison. The manifest
 * comparison here is unchanged.
 *
 * M23.17 (RD-5, RD-6): a product no longer declares `tabCapture` or `activeTab`, so the two builds' manifests cannot
 * hash alike. `manifestRouteSha` keeps its meaning, and still compares two evidence builds. `crossBuildManifestRouteSha`
 * compares a product with an evidence build, and sets aside those two names and no others. Which build must declare
 * them is judged exactly and separately (`build-separation.mjs`), so this ignores nothing.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EVIDENCE_ONLY_PERMISSIONS } from "./csp-product-phase.mjs";

const manifestOf = (ext) => JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));

/** The manifest's connect-src sources, as built. */
export function connectSrcOf(ext) {
  const csp = manifestOf(ext).content_security_policy?.extension_pages ?? "";
  return /connect-src ([^;]*)/.exec(csp)?.[1] ?? null;
}

/** SHA-256 of the manifest with the connect-src directive's sources replaced by a placeholder. */
export function manifestRouteSha(ext) {
  const m = manifestOf(ext);
  const csp = m.content_security_policy?.extension_pages;
  if (typeof csp === "string") m.content_security_policy.extension_pages = csp.replace(/connect-src [^;]*/, "connect-src <NORMALISED>");
  return createHash("sha256").update(JSON.stringify(m)).digest("hex");
}

/** `manifestRouteSha`, across a product and an evidence build: the two approved permissions are set aside, by name. */
export function crossBuildManifestRouteSha(ext) {
  const m = manifestOf(ext);
  const csp = m.content_security_policy?.extension_pages;
  if (typeof csp === "string") m.content_security_policy.extension_pages = csp.replace(/connect-src [^;]*/, "connect-src <NORMALISED>");
  if (Array.isArray(m.permissions)) m.permissions = m.permissions.filter((permission) => !EVIDENCE_ONLY_PERMISSIONS.includes(permission));
  return createHash("sha256").update(JSON.stringify(m)).digest("hex");
}
