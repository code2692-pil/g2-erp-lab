import { type ChangeEvent, useState } from "react";
import { FileJson, Trash2 } from "lucide-react";
import { reviewerRoleLabels, reviewStatusLabels, validateReviewPackage } from "./reviewPackage";
import type { ReviewPackage } from "./solutionTypes";

const maximumPackageSize = 256 * 1024;

export function ReviewPackageImportPanel() {
  const [loadedPackage, setLoadedPackage] = useState<ReviewPackage>();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("분석 결과 파일을 선택하면 현재 분석과 분리된 요약으로 확인합니다.");
  const [processing, setProcessing] = useState(false);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > maximumPackageSize) { setError("분석 결과 파일은 최대 256KB까지 불러올 수 있습니다."); return; }
    if (!file.name.toLocaleLowerCase("ko-KR").endsWith(".json") && file.type !== "application/json") { setError("JSON 파일만 불러올 수 있습니다."); return; }
    setProcessing(true); setError("");
    try {
      const raw = await file.text();
      const parsed: unknown = JSON.parse(raw);
      const validation = validateReviewPackage(parsed);
      if (!validation.success) { setError(`분석 결과 파일을 불러오지 않았습니다: ${validation.error}`); return; }
      setLoadedPackage(validation.value);
      setStatus("분석 결과 파일을 현재 분석과 분리된 요약으로 불러왔습니다.");
    } catch {
      setError("분석 결과 파일을 불러오지 않았습니다: UTF-8 JSON 형식을 확인해 주세요.");
    } finally { setProcessing(false); }
  };

  const review = loadedPackage?.case;
  return <section className="ai-solution-center__review-package-import" data-testid="review-package-import" aria-busy={processing} aria-labelledby="review-package-import-heading">
    <div><h2 id="review-package-import-heading">분석 결과 확인</h2><p>불러온 파일은 현재 분석 입력이나 결과를 자동으로 변경하지 않습니다.</p></div>
    <label className="ai-solution-center__file-label" htmlFor="review-package-input"><FileJson size={16} />분석 결과 불러오기<input id="review-package-input" data-testid="review-package-input" type="file" accept=".json,application/json" onChange={(event) => void handleFile(event)} /></label>
    <p className="ai-solution-center__file-status" data-testid="review-package-import-status" role="status" aria-live="polite">{status}</p>
    {error && <p className="ai-solution-center__error" data-testid="review-package-import-error" role="alert" aria-live="assertive">{error}</p>}
    {review && <section className="ai-solution-center__loaded-review" data-testid="loaded-review-package"><div className="ai-solution-center__loaded-review-heading"><div><h3>{review.caseTitle}</h3><p>{reviewStatusLabels[review.reviewStatus]} · 추천 1순위: {review.recommendedOption}</p></div><button data-testid="review-package-remove" type="button" onClick={() => { setLoadedPackage(undefined); setStatus("불러온 분석 결과를 제거했습니다. 현재 분석은 유지됩니다."); }}><Trash2 size={15} />제거</button></div><dl><div><dt>생성 시각</dt><dd>{review.createdAt}</dd></div><div><dt>수정 시각</dt><dd>{review.updatedAt}</dd></div><div><dt>검토자 역할</dt><dd>{review.reviewerRole ? reviewerRoleLabels[review.reviewerRole] : "선택 안 함"}</dd></div><div><dt>체크리스트</dt><dd>{Object.values(review.checklist).filter(Boolean).length}개 확인</dd></div><div><dt>컨설턴트 의견</dt><dd>{review.consultantReview || "없음"}</dd></div><div><dt>개발 의견</dt><dd>{review.developerReview || "없음"}</dd></div><div><dt>결정 사유</dt><dd>{review.decisionReason || "없음"}</dd></div><div><dt>제한사항</dt><dd>{review.limitations.join(" / ")}</dd></div></dl></section>}
  </section>;
}
