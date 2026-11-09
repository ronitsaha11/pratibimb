# M22.1 — decision record

**Data-quality audit, W1, 2026-11-01. No detector, no TEST data, no change to `t1-ui-v1`.**

| Question | Recommendation | Basis |
|---|---|---|
| 1. Should the pinned T1 dataset remain unchanged? | **Yes.** Keep `t1-ui-v1` and every record against it as they are | it is the provenance of the shipped artifact and of every earlier gate result |
| 2. Should a new dataset version be generated? | **Yes, as a new version, if the owner wants a usable icon class or large-element coverage.** Not before the generator is fixed and the gate passes | G3, G4, G6 fail on the recipe's TRAIN and DEV |
| 3. What must change in the generator? | Explicit icon positioning; varied icon shape, size, position and count; a size schedule covering all four buckets for every class; occlusion avoided or labelled; one manifest per split | `future-dataset-spec.md` §1–§2 |
| 4. Which checks must pass before training? | G1–G8, with the owner's thresholds recorded before the build | `future-dataset-spec.md` §3 |
| 5. Exclude the icon class from the current model's claims? | **Yes.** The current T1 artifact's training data contains no observable icon; no icon detection claim should be made for it | every TRAIN and DEV icon is FULLY_OCCLUDED (FACT, regenerated recipe; INFERENCE that it matches the pinned files) |
| 6. What evidence before retraining T1? | The prerequisites in `future-dataset-spec.md` §4 — owner decision, gate pass, frozen size schedule, sealed TEST, a pre-registered evaluation | — |

**Not changed:** the model, score floor, NMS, architecture, production configuration, the
`Detector` interface, ADRs, gates and contracts. T1 stays UNADOPTED. M22's detector evaluation is
still not run.
