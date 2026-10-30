# M21 — decision record

**ENGINEERING DIAGNOSTIC, W1, 2026-10-30.** Not a J7 experiment; not detector adoption evidence.

| Part | Verdict | Evidence |
|---|---|---|
| Source of the "16–34%" figure | **Re-read:** detections *changed* under canvas resampling (QG-03b); kernel replaced then, 100% agreement since. Not a letterbox loss. | `../W1-QG03b-letterbox-conformance/README.md` §3, §5 |
| Letterbox loss in the shipped path, 6 shapes at 2.0 CSS px/model px, 120 DEV screens | **None measured:** 0 labels lost in projection, 0 boxes in the padding, 0 frames refused; all losses NOT_EMITTED (model) | `logs/w1-letterbox-diagnostic-20261030T144359Z.json`; repeat `…T144553Z.json`, identical |
| Inverse could end an edge box past the frame (rounding, ≤ 6.8e-13 px) | **DEFECT, FIXED** — `boundToFrame` in `projectToCapture`; 8 regression tests fail without it | `packages/perception/test/geometryRegression.test.ts` |
| Raster frame vs inverse transform mismatch | **GUARDED** — `assertRasterMatchesInverse` in the realm (defence in depth; not observed) | same test file |
| Per-stage decode/projection counts | **ADDED**, value-free, evaluation-only; `Detector` interface unchanged | `apps/extension/test/perceptionPass.test.ts` |

**Unchanged and not decided here:** the continuous-versus-raster inverse (QG-03a-C, owner decision),
`computeLetterbox`, the frozen coordinate contract and fusion threshold, decode thresholds, the
model, capture policy, CSP, manifest, permissions, endpoint, the 5-turn cap, click-only actions. T1
stays UNADOPTED; QG-03a stays OPEN. J7/B5 and D1–D4 are untouched; F-M13-1 remains open.
