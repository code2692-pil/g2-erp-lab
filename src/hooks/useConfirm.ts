import { useCallback, useRef } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ConfirmDialog } from "../components/common/feedback/ConfirmDialog";
import type { ConfirmationOptions } from "../components/common/feedback/types";

export function useConfirm() {
  const activeConfirmation = useRef<Promise<boolean> | null>(null);
  const confirm = useCallback((options: ConfirmationOptions) => {
    if (activeConfirmation.current) return activeConfirmation.current;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let settled = false;
    const pending = new Promise<boolean>((resolve) => {
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        activeConfirmation.current = null;
        root.unmount();
        host.remove();
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
        resolve(value);
      };
      root.render(createElement(ConfirmDialog, {
        ...options,
        open: true,
        onConfirm: () => finish(true),
        onCancel: () => finish(false)
      }));
    });
    activeConfirmation.current = pending;
    return pending;
  }, []);
  return { options: null, confirm, confirmNow: () => undefined, cancel: () => undefined };
}
