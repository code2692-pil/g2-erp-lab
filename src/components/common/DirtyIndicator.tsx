interface DirtyIndicatorProps {
  dataTestId: string;
  dirty: boolean;
}

export function DirtyIndicator({ dataTestId, dirty }: DirtyIndicatorProps) {
  if (!dirty) return null;

  return <span className="erp-dirty-indicator" data-testid={dataTestId}>수정됨</span>;
}
