import { createElement, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { ErpDialog } from "../components/common/ErpDialog";
import type { ValidationIssue } from "../components/common/validation/validation";

export function useValidationSummary() {
  const showValidationSummary = useCallback((issues: readonly ValidationIssue[]) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const close = () => { root.unmount(); host.remove(); };
    const content = createElement("div", { className: "validation-summary" },
      createElement("p", { "data-testid": "purchase-validation-count" }, `검증 오류 ${issues.length}건으로 저장이 중단되었습니다.`),
      createElement("ul", { "data-testid": "purchase-validation-list" }, issues.map((issue, index) => createElement("li", { key: `${issue.message}-${index}` }, issue.message))));
    root.render(createElement(ErpDialog, {
      open: true,
      title: "저장 전 입력값 검증",
      dataTestId: "purchase-validation-summary",
      onClose: close,
      footer: createElement("button", { type: "button", onClick: close, "data-testid": "purchase-validation-close" }, "확인"),
      children: content
    }));
  }, []);
  return { showValidationSummary };
}
