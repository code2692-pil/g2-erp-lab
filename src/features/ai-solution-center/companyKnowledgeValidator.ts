import type { CompanyKnowledgeArticle } from "./solutionTypes";

export const companyKnowledgeFileLimit = 256 * 1024;
export const companyKnowledgeItemLimit = 100;

const allowedFields = new Set([
  "id",
  "title",
  "category",
  "keywords",
  "symptoms",
  "recommendations",
  "alternatives",
  "requiredInformation",
  "risks",
  "applicableProcesses",
  "confidenceWeight"
]);
const prohibitedFields = new Set(["sourceType", "companySpecific", "finalDecision", "riskLevel", "executableCode", "prompt", "systemPrompt", "html", "script"]);
const requiredStringFields = ["id", "title", "category"] as const;
const requiredArrayFields = ["keywords", "symptoms", "recommendations", "alternatives", "requiredInformation", "risks", "applicableProcesses"] as const;

export type CompanyKnowledgeValidation =
  | { ok: true; articles: readonly CompanyKnowledgeArticle[] }
  | { ok: false; error: string };

function itemPrefix(index: number) {
  return `항목 ${index + 1}`;
}

type StringRead = { value: string } | { error: string };

function readRequiredString(value: Record<string, unknown>, field: typeof requiredStringFields[number], index: number, maxLength: number): StringRead {
  const candidate = value[field];
  if (typeof candidate !== "string" || candidate.trim().length === 0) return { error: `${itemPrefix(index)}의 ${field} 필드는 필수 문자열입니다.` };
  const trimmed = candidate.trim();
  if (trimmed.length > maxLength) return { error: `${itemPrefix(index)}의 ${field} 필드는 ${maxLength}자를 초과할 수 없습니다.` };
  return { value: trimmed };
}

function readRequiredArray(value: Record<string, unknown>, field: typeof requiredArrayFields[number], index: number): readonly string[] | string {
  const candidate = value[field];
  if (!Array.isArray(candidate) || candidate.length === 0) return `${itemPrefix(index)}의 ${field} 필드는 비어 있지 않은 배열이어야 합니다.`;
  if (candidate.length > 30) return `${itemPrefix(index)}의 ${field} 배열은 최대 30개까지 허용됩니다.`;
  const entryLimit = field === "keywords" ? 100 : 1_000;
  const values: string[] = [];
  for (const [entryIndex, entry] of candidate.entries()) {
    if (typeof entry !== "string" || entry.trim().length === 0) return `${itemPrefix(index)}의 ${field}[${entryIndex}]는 비어 있지 않은 문자열이어야 합니다.`;
    const trimmed = entry.trim();
    if (trimmed.length > entryLimit) return `${itemPrefix(index)}의 ${field}[${entryIndex}]는 ${entryLimit}자를 초과할 수 없습니다.`;
    values.push(trimmed);
  }
  return values;
}

function isFailure(value: readonly string[] | string): value is string {
  return typeof value === "string";
}

function isStringFailure(value: StringRead): value is { error: string } {
  return "error" in value;
}

export function validateCompanyKnowledge(value: unknown): CompanyKnowledgeValidation {
  if (!Array.isArray(value)) return { ok: false, error: "최상위 JSON 구조는 지식 항목 배열이어야 합니다." };
  if (value.length === 0) return { ok: false, error: "회사 지식에는 최소 1개의 지식 항목이 필요합니다." };
  if (value.length > companyKnowledgeItemLimit) return { ok: false, error: `회사 지식은 최대 ${companyKnowledgeItemLimit}개 항목까지만 허용됩니다.` };

  const articles: CompanyKnowledgeArticle[] = [];
  const ids = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return { ok: false, error: `${itemPrefix(index)}은 객체여야 합니다.` };
    const item = candidate as Record<string, unknown>;
    for (const field of Object.keys(item)) {
      if (prohibitedFields.has(field)) return { ok: false, error: `${itemPrefix(index)}에 허용하지 않는 위험 field '${field}'가 있습니다.` };
      if (!allowedFields.has(field)) return { ok: false, error: `${itemPrefix(index)}에 허용하지 않는 field '${field}'가 있습니다.` };
    }
    for (const field of [...requiredStringFields, ...requiredArrayFields, "confidenceWeight"]) {
      if (!(field in item)) return { ok: false, error: `${itemPrefix(index)}의 필수 field '${field}'가 없습니다.` };
    }

    const id = readRequiredString(item, "id", index, 100);
    const title = readRequiredString(item, "title", index, 200);
    const category = readRequiredString(item, "category", index, 100);
    if (isStringFailure(id)) return { ok: false, error: id.error };
    if (isStringFailure(title)) return { ok: false, error: title.error };
    if (isStringFailure(category)) return { ok: false, error: category.error };
    if (ids.has(id.value)) return { ok: false, error: `${itemPrefix(index)}의 id '${id.value}'가 앞선 항목과 중복됩니다.` };
    ids.add(id.value);

    const arrays = requiredArrayFields.map((field) => ({ field, value: readRequiredArray(item, field, index) }));
    const invalidArray = arrays.find((entry) => isFailure(entry.value));
    if (invalidArray) return { ok: false, error: invalidArray.value as string };
    const confidenceWeight = item.confidenceWeight;
    if (typeof confidenceWeight !== "number" || !Number.isFinite(confidenceWeight) || confidenceWeight < 0 || confidenceWeight > 1) return { ok: false, error: `${itemPrefix(index)}의 confidenceWeight는 0 이상 1 이하의 숫자여야 합니다.` };
    const arrayValue = (field: typeof requiredArrayFields[number]) => arrays.find((entry) => entry.field === field)?.value as readonly string[];
    articles.push({
      id: id.value,
      title: title.value,
      category: category.value,
      keywords: arrayValue("keywords"),
      symptoms: arrayValue("symptoms"),
      recommendations: arrayValue("recommendations"),
      alternatives: arrayValue("alternatives"),
      requiredInformation: arrayValue("requiredInformation"),
      risks: arrayValue("risks"),
      applicableProcesses: arrayValue("applicableProcesses"),
      confidenceWeight,
      sourceType: "COMPANY",
      companySpecific: true
    });
  }
  return { ok: true, articles };
}
