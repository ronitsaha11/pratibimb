# M22.5 — trainer compatibility and a proposed v2 adapter (DESIGN ONLY; not implemented)

> **Not implemented, not approved, not run.** This compares the trainer's interfaces with the v2
> manifests and proposes an adapter, for separate approval. The trainer and the v1 loader are
> unchanged. The v1 manifest was **not opened**: its shape below comes from the code that writes it
> (`tools/dataset/build-dataset.mjs`) and the code that reads it (`tools/detector/data.py`).

## 1. What the trainer reads today

| Code | Reads |
|---|---|
| `train.py` | `DATA = artifacts/datasets/t1-ui-v1`, hard-coded. It trains on `SplitDataset(DATA, "train")`. After export it **predicts on `dev` and `test`** (`for split in ("dev", "test")`), and writes to `artifacts/models/t1-ui-head` |
| `data.py` `load_manifest` | exactly `<root>/manifest.json`, one file holding every split |
| `data.py` `SplitDataset` | `manifest.name`, `.version`, `.hash`; samples filtered by `s["split"]` |
| `data.py` `sample_to_tensors` | `framePath`, `captureSize.{w,h}`, `viewportCss.{w,h}`; per annotation `cls`, `box.{x,y,w,h}`, `visibility` |
| Target rule | **every annotation that is not OFFSCREEN and has a known class is a target**, clipped to the letterboxed content |
| `head.py` | `CLASSES = [button, link, textbox, checkbox, radio, select, tab, icon]`, input 640, stride 8, pad value 114/255 |

## 2. v1 manifest against v2 manifests

| Item | v1 (`t1-ui-v1`, from its writer) | v2 TRAIN | v2 DEV |
|---|---|---|---|
| Files | one `manifest.json`, all splits, TEST included | `manifest-train.json` | `manifest-dev.json` |
| Top level | `name`, `version`, `createdAt`, `samples`, `hash` (`sealDataset`) | `name`, `version`, `split`, `generator`, `seedScheme`, `prng`, `meta`, `samples`, `hash` (SHA-256 of canonical JSON) | same, `split: "dev"` |
| Frames | `frames/<id>.png` | `frames-train/<id>.png` | `frames-dev/<id>.png` |
| `captureSize` | present | **absent**: the PNG is the viewport at DPR 1, and `frame.{w,h}` holds its size | **absent** |
| `dpr`, `zoom`, `scroll` | present | absent (DPR 1, zoom 1, no scroll, recorded in `meta.environment`) | absent |
| Seed | integer | 64-hex SHA-256 | 64-hex SHA-256 |
| Annotation fields | `id`, `cls`, `box`, `visibility` | adds `validity`, `hitTest`, `intent`, `positive`, `source` | same |
| **Which annotations are targets** | every non-OFFSCREEN one | **only `positive === true`**. The occlusion cases are VISIBLE by geometry but are not positives | same |
| Box semantics | CSS viewport px, `getBoundingClientRect`, top-left origin | identical (G8: rendered = declared, worst 0 px) | identical |
| Class names and order | the eight above | identical strings and order (`tools/dataset/v2/config.mjs`) | identical |
| Image | PNG | PNG, 8-bit RGB | PNG, 8-bit RGB |

## 3. What breaks if v2 is pointed at the current trainer

1. **`load_manifest` fails:** there is no `manifest.json` in a v2 build.
2. **`sample["captureSize"]` raises `KeyError`.**
3. **Occlusion cases would be trained on (the silent failure).** Were 1 and 2 patched naively, the target rule (`visibility != "OFFSCREEN"`) would take all 1,120 intentional occlusion cases as targets. Half of them are **fully occluded**: the model would be taught to find a control where none is visible.
4. **`train.py` would look for a TEST split.** It is hard-wired to `t1-ui-v1` and predicts on `test`. A v2 run must never construct a TEST dataset, so `train.py` cannot be reused as is.
5. **Model overwrite.** `train.py` writes to the shipped T1 model's directory.

## 4. Proposed adapter (for approval)

**New file `tools/detector/data_v2.py`.** `data.py`, `train.py`, `targets.py` and `head.py` stay unchanged.

**`load_v2_split(root, split)`:**
- refuses any `split` other than `"train"` or `"dev"` **before any file access**;
- opens exactly `<root>/manifest-<split>.json`;
- checks that `manifest["split"] == split` and that every sample's `split == split`.

**`adapt_sample(sample)` maps a v2 sample to the shape `sample_to_tensors` already consumes:**
- `framePath` and `viewportCss` pass through;
- `captureSize` = `{w: frame.w, h: frame.h}`, refused unless it equals `viewportCss`, since the build is DPR 1;
- `annotations` keeps **only `positive is True`**, with `cls`, `box` and `visibility`. The class must be one of `head.CLASSES` (refused otherwise, never skipped silently);
- provenance travels alongside, unused by the loss: `id`, `seed`, `specHash`, `frame.sha256`, and the source manifest hash.

**Frame integrity:** at load, `sha256(frame bytes) == sample.frame.sha256`, and the decoded size equals `captureSize`. A mismatch is refused.

**`V2SplitDataset(root, split, limit=None)`:**
- the same interface as `SplitDataset` (`name`, `version`, `hash`, `samples`, `__getitem__`);
- `__getitem__` calls the unchanged `sample_to_tensors(root, adapt_sample(s))`, so the letterbox, the CSS → capture → model conversion and the target assignment are byte-for-byte the v1 path.

**Manifest hash:**
- *Recomputing it in Python:* that would require reproducing JavaScript's canonical JSON number formatting exactly. Not proposed.
- *Proposed instead:* a run must be preceded by `node tools/dataset/v2/audit-candidate.mjs --candidate=<n>`, which recomputes the hash in the generator's own code. The run records the audited hash and refuses if the manifest's stored `hash` differs.

**A separate entry point, `tools/detector/train_v2.py`:**
- **imports:** reuses `UiHead`, `detector_loss` and `decode`;
- **TRAIN:** trains on TRAIN only;
- **DEV:** threshold sweeps and reports use DEV only;
- **TEST:** never builds one, so it has no `"test"` code path;
- **output:** writes to a new directory (for example `artifacts/models/t1-ui-head-v2-<run>`), never `artifacts/models/t1-ui-head`;
- **run record:** records the candidate, its audited manifest hashes and the adapter version.

**Tests (Python, on a tiny manifest written in a temp directory, never the candidate):**
- refusal of `"test"` before any I/O;
- `captureSize` derivation;
- positives-only filtering, with occlusion cases excluded;
- frame-hash refusal;
- class-order identity with `head.CLASSES`.

## 5. Decisions for the owner

1. **How occlusion cases enter training.** The trainer has no ignore regions.
   - *Exclude them,* as proposed: a partially occluded control's visible half is then trained as background.
   - *Add ignore-region support:* a change to the loss, needing its own review.
   - *Use them only for evaluation.*
2. **Whether to train at all,** and on which candidate. **Not this one as it stands**; see `decision.md`.
3. **Where the model is written,** and that it stays UNADOPTED until evaluated under a separate, approved plan.
