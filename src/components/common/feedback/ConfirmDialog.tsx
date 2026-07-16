import { useEffect, useRef } from "react";
import { ErpDialog } from "../ErpDialog";
import type { ConfirmationOptions } from "./types";

interface Props extends ConfirmationOptions { open: boolean; pending?: boolean; onConfirm: () => void; onCancel: () => void; }

export function ConfirmDialog({ open, pending = false, title, message, description, confirmLabel = "확인", cancelLabel = "취소", danger = false, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) queueMicrotask(() => cancelRef.current?.focus()); }, [open]);
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (!pending) onCancel(); }
      if (event.key === "Enter" && !pending && event.target instanceof HTMLButtonElement === false) { event.preventDefault(); onConfirm(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, pending, onCancel, onConfirm]);
  return <ErpDialog open={open} title={title} onClose={pending ? () => undefined : onCancel} dataTestId="confirm-dialog" footer={<><button data-testid="confirm-dialog-cancel" ref={cancelRef} type="button" onClick={onCancel} disabled={pending}>{cancelLabel}</button><button data-testid="confirm-dialog-confirm" type="button" className={danger ? "danger" : "primary"} onClick={onConfirm} disabled={pending}>{pending ? "처리 중..." : confirmLabel}</button></>}><p>{message}</p>{description && <p className="muted">{description}</p>}</ErpDialog>;
}
