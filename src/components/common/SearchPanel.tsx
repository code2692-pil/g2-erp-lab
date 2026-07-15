import type { ReactNode } from "react";

interface SearchPanelProps {
  children: ReactNode;
  message: string;
}

export function SearchPanel({ children, message }: SearchPanelProps) {
  return (
    <section className="search-panel">
      {children}
      <div className="status-message"><span data-testid="status-message">{message}</span></div>
    </section>
  );
}
