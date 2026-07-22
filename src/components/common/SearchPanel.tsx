import type { ReactNode } from "react";

interface SearchPanelProps {
  children: ReactNode;
  message: string;
  statusAddon?: ReactNode;
}

export function SearchPanel({ children, message, statusAddon }: SearchPanelProps) {
  return (
    <section className="search-panel">
      {children}
      <div className="status-message"><span data-testid="status-message">{message}</span>{statusAddon}</div>
    </section>
  );
}
