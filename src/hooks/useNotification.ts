import { useCallback } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ErpSnackbar } from "../components/common/feedback/ErpSnackbar";
import type { Notification, NotificationKind } from "../components/common/feedback/types";

let openNotification: { key: string; close: () => void } | null = null;

export function useNotification() {
  const notify = useCallback((kind: NotificationKind, message: string, description?: string) => {
    const key = `${kind}:${message}:${description ?? ""}`;
    if (openNotification?.key === key) return;
    openNotification?.close();
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const close = () => {
      root.unmount();
      host.remove();
      if (openNotification?.key === key) openNotification = null;
    };
    const notification: Notification = { id: `${Date.now()}-${message}`, kind, message, description };
    root.render(createElement(ErpSnackbar, { notification, onClose: close }));
    openNotification = { key, close };
  }, []);
  return { notification: null, notify, close: () => undefined };
}
