import type { ReactNode } from "react";

export interface PageToolbarAction {
  dataTestId: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
  group?: "document" | "rows" | "extra";
}

interface PageToolbarProps {
  actions: readonly PageToolbarAction[];
  processing?: boolean;
}

export function PageToolbar({ actions, processing = false }: PageToolbarProps) {
  return (
    <div aria-busy={processing} className="button-bar" data-processing-state={processing ? "processing" : "idle"}>
      {actions.map((action, index) => (
        <button
          className={`${action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : ""}${index > 0 && actions[index - 1].group !== action.group ? " toolbar-group-start" : ""}`.trim() || undefined}
          data-testid={action.dataTestId}
          disabled={action.disabled}
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
