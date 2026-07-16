import type { ReactNode } from "react";

export interface PageToolbarAction {
  dataTestId: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
}

interface PageToolbarProps {
  actions: readonly PageToolbarAction[];
  processing?: boolean;
}

export function PageToolbar({ actions, processing = false }: PageToolbarProps) {
  return (
    <div className="button-bar">
      {actions.map((action) => (
        <button
          className={action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : undefined}
          data-testid={action.dataTestId}
          disabled={processing || action.disabled}
          key={action.dataTestId}
          onClick={action.onClick}
          type="button"
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}
