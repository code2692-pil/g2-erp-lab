import { useEffect, useId, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ErpDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number | string;
  height?: number | string;
  dataTestId?: string;
}

export function ErpDialog({
  open,
  title,
  children,
  footer,
  onClose,
  width,
  height,
  dataTestId
}: ErpDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const focusIsOutside = !dialogRef.current.contains(document.activeElement);

      if (event.shiftKey && (document.activeElement === firstElement || focusIsOutside)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (document.activeElement === lastElement || focusIsOutside)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocusedElement?.isConnected) previouslyFocusedElement.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const dialogStyle: CSSProperties = {
    width,
    height,
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "calc(100vh - 32px)"
  };

  return createPortal(
    <div
      className="erp-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="erp-dialog"
        data-testid={dataTestId}
        ref={dialogRef}
        role="dialog"
        style={dialogStyle}
        tabIndex={-1}
      >
        <header className="erp-dialog__header">
          <h2 className="erp-dialog__title" id={titleId}>
            {title}
          </h2>
          <button
            aria-label={`${title} 닫기`}
            className="erp-dialog__close-button"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="erp-dialog__body">{children}</div>
        {footer !== undefined && <footer className="erp-dialog__footer">{footer}</footer>}
      </section>
    </div>,
    document.body
  );
}
