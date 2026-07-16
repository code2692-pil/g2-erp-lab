export type NotificationKind = "success" | "info" | "warning" | "error";

export interface ConfirmationOptions {
  title: string;
  message: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface Notification {
  id: string;
  kind: NotificationKind;
  message: string;
  description?: string;
}
