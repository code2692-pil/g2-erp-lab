import type { ValidationIssue } from "./validation/validation";

interface ErpValidationSummaryProps {
  issues: readonly ValidationIssue[];
  dataTestId: string;
  onFocusFirst: () => void;
}

/** A compact, inline entry point to the first user-correctable validation error. */
export function ErpValidationSummary({ issues, dataTestId, onFocusFirst }: ErpValidationSummaryProps) {
  if (issues.length === 0) return null;

  return (
    <button
      aria-label={`입력 오류 ${issues.length}건. 첫 번째 오류로 이동`}
      className="erp-validation-summary"
      data-testid={dataTestId}
      onClick={onFocusFirst}
      type="button"
    >
      <strong data-testid={`${dataTestId}-count`}>입력 오류 {issues.length}건</strong>
      <span data-testid={`${dataTestId}-first-message`}>{issues[0].message}</span>
    </button>
  );
}
