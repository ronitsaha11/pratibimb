/**
 * M23.13 (OD-W) — WHAT THE TOOLBAR BUTTON DOES IN A NORMAL PRODUCT: IT OPENS THE SIDE PANEL.
 *
 * A DOM-only product has no use for a capture grant, so the click asks for none. It opens the panel for the tab it
 * was made on, and that is all: no message is sent, no offscreen document is touched, and no task is started.
 *
 * SYNCHRONOUS, ON PURPOSE. Chrome accepts `sidePanel.open` only in response to a user action, so nothing may be awaited
 * before it. This calls `open` before it returns.
 *
 * A FAILURE IS REPORTED AND GOES NO FURTHER. There is no fallback here, and in particular none to capture: if the panel
 * cannot open, the person simply does not get the panel. The keyboard shortcut (`Ctrl+Shift+Y` since M23.21) is Chrome's
 * `_execute_action`, which fires the same click event, so it takes this path too.
 */
export type SidePanelTarget = { readonly tabId: number } | { readonly windowId: number };

export function openSidePanelForToolbarClick(
  tab: { readonly id?: number | undefined; readonly windowId?: number | undefined },
  open: (target: SidePanelTarget) => Promise<unknown>,
  report: (problem: string) => void
): void {
  const target: SidePanelTarget | null = typeof tab.id === "number" ? { tabId: tab.id } : typeof tab.windowId === "number" ? { windowId: tab.windowId } : null;
  if (target === null) {
    report("NO_TAB_TO_OPEN_THE_SIDE_PANEL_FOR");
    return;
  }
  const failed = (error: unknown): void => report(`SIDE_PANEL_DID_NOT_OPEN: ${error instanceof Error ? error.message : String(error)}`);
  try {
    void open(target).catch(failed);
  } catch (error) {
    failed(error);
  }
}
