import { useEffect } from "react";
import type { Notification } from "./types";

interface Props { notification: Notification | null; onClose: () => void; duration?: number; }
export function ErpSnackbar({ notification, onClose, duration = 4000 }: Props) {
  useEffect(() => { if (!notification) return; const timer = window.setTimeout(onClose, duration); return () => window.clearTimeout(timer); }, [notification, onClose, duration]);
  if (!notification) return null;
  return <div aria-live="polite" className={`erp-snackbar erp-snackbar--${notification.kind}`} role={notification.kind === "error" ? "alert" : "status"}><div><strong>{notification.message}</strong>{notification.description && <p>{notification.description}</p>}</div><button type="button" onClick={onClose} aria-label="알림 닫기">×</button></div>;
}
