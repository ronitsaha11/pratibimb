/**
 * M23.12 (OD-T) — WHAT THE NORMAL PRODUCT SAYS ABOUT ITSELF. The owner's exact wording, in one place.
 *
 * It describes the DOM-only Phase 1 (OD-P, OD-R, OD-S) and is true of a product build only: an evidence build's
 * tasks do capture when a grant exists. So the side panel shows the description and the privacy explanation in a
 * product build alone. The toolbar title is in the manifest, which the two builds must share, and it says nothing
 * about capture either way.
 *
 * The privacy explanation is about normal tasks and page images. It does not say visual-only PII is protected or
 * redacted, and nothing should be added here that does: that protection is not operational (OD-F, OD-K2).
 */
export const TOOLBAR_TITLE = "PratiBimb — Page Assistant";
/**
 * M23.15 (OD-Y): the extension's name. The same product, with what it truly is: a development build, not a release. It
 * changes only by an owner's decision to release. `sidepanel/index.html` and `offscreen/index.html` carry it in their markup.
 */
export const DEVELOPMENT_BUILD_NAME = `${TOOLBAR_TITLE} (Development build)`;
export const SIDE_PANEL_DESCRIPTION = "PratiBimb uses page structure to identify elements and assist with browser tasks.";
export const PRIVACY_EXPLANATION = "Normal tasks do not capture browser screenshots or send page images to the reasoning model.";
