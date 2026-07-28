import type { SensitiveCategory, SensitiveConfidence, SensitiveFinding, SensitiveRiskLevel } from "./fileAnalysisTypes.ts";

interface RedactionRule {
  category: SensitiveCategory;
  confidence: SensitiveConfidence;
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
}

const rules: readonly RedactionRule[] = [
  {
    category: "URL_TOKEN",
    confidence: "HIGH_PATTERN",
    pattern: /([?&](?:token|access_token|refresh_token|api_key|apikey|key|secret)=)[^&#\s]+/gi,
    replacement: (_match, prefix) => `${prefix}[REDACTED_TOKEN]`
  },
  {
    category: "BEARER_TOKEN",
    confidence: "HIGH_PATTERN",
    pattern: /\b(Bearer)\s+[A-Za-z0-9._~+/-]{8,}=*/gi,
    replacement: (_match, prefix) => `${prefix} [REDACTED_TOKEN]`
  },
  {
    category: "SECRET",
    confidence: "HIGH_PATTERN",
    pattern: /(["']?(?:password|passwd|pwd|access_token|refresh_token|api_key|apikey|secret|client_secret)["']?\s*[:=]\s*)["']?([^"',\s;&}]{4,})["']?/gi,
    replacement: (_match, prefix) => `${prefix}"[REDACTED_TOKEN]"`
  },
  {
    category: "AWS_ACCESS_KEY",
    confidence: "HIGH_PATTERN",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: "[REDACTED_AWS_KEY]"
  },
  {
    category: "NATIONAL_ID_PATTERN",
    confidence: "HIGH_PATTERN",
    pattern: /\b\d{6}-[1-8]\d{6}\b/g,
    replacement: "******-*******"
  },
  {
    category: "CARD_PATTERN",
    confidence: "POSSIBLE_PATTERN",
    pattern: /\b(?:\d{4}[- ]?){3}(\d{4})\b/g,
    replacement: (_match, lastFour) => `****-****-****-${lastFour}`
  },
  {
    category: "EMAIL",
    confidence: "HIGH_PATTERN",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]"
  },
  {
    category: "PHONE",
    confidence: "POSSIBLE_PATTERN",
    pattern: /\b(?:\+?82[- ]?)?(?:0?1[016789]|0[2-6][1-5]?)[- ]?\d{3,4}[- ]?\d{4}\b/g,
    replacement: "[REDACTED_PHONE]"
  },
  {
    category: "IP_ADDRESS",
    confidence: "POSSIBLE_PATTERN",
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    replacement: "[REDACTED_IP]"
  },
  {
    category: "LONG_TOKEN",
    confidence: "POSSIBLE_PATTERN",
    pattern: /\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/g,
    replacement: "[REDACTED_LONG_TOKEN]"
  }
];

export interface RedactionResult {
  redactedText: string;
  findings: readonly SensitiveFinding[];
  redactionApplied: boolean;
}

export const sensitiveCategoryLabels: Readonly<Record<SensitiveCategory, string>> = {
  EMAIL: "이메일 주소",
  PHONE: "전화번호 후보",
  IP_ADDRESS: "IP 주소",
  NATIONAL_ID_PATTERN: "주민등록번호 형태 후보",
  CARD_PATTERN: "카드번호 형태 후보",
  URL_TOKEN: "URL 인증값 후보",
  SECRET: "Secret 설정값 후보",
  BEARER_TOKEN: "Bearer 인증값 후보",
  AWS_ACCESS_KEY: "AWS Access Key 형태 후보",
  LONG_TOKEN: "긴 Token 형태 후보"
};

function replaceAndCount(value: string, rule: RedactionRule) {
  let count = 0;
  const redacted = value.replace(rule.pattern, (...args: [string, ...string[]]) => {
    count += 1;
    return typeof rule.replacement === "string" ? rule.replacement : rule.replacement(...args);
  });
  return { redacted, count };
}

export function redactSensitiveData(value: string): RedactionResult {
  let redactedText = value;
  const findings: SensitiveFinding[] = [];
  for (const rule of rules) {
    const result = replaceAndCount(redactedText, rule);
    redactedText = result.redacted;
    if (result.count > 0) findings.push({ category: rule.category, confidence: rule.confidence, count: result.count });
  }
  return { redactedText, findings, redactionApplied: findings.length > 0 };
}

export function mergeSensitiveFindings(...groups: readonly (readonly SensitiveFinding[])[]) {
  const merged = new Map<SensitiveCategory, SensitiveFinding>();
  for (const findings of groups) {
    for (const finding of findings) {
      const current = merged.get(finding.category);
      merged.set(finding.category, {
        category: finding.category,
        confidence: current?.confidence === "HIGH_PATTERN" || finding.confidence === "HIGH_PATTERN" ? "HIGH_PATTERN" : "POSSIBLE_PATTERN",
        count: (current?.count ?? 0) + finding.count
      });
    }
  }
  return [...merged.values()].sort((left, right) => left.category.localeCompare(right.category));
}

export function sensitiveRiskLevel(findings: readonly SensitiveFinding[]): SensitiveRiskLevel {
  if (findings.some((finding) => finding.confidence === "HIGH_PATTERN")) return "REVIEW_REQUIRED";
  return findings.length > 0 ? "REVIEW_RECOMMENDED" : "NONE";
}

export function safeRedactedExcerpt(value: string, maximum = 300) {
  const compact = redactSensitiveData(value).redactedText.trim().replace(/\s+/g, " ");
  if (compact.length <= maximum) return compact;
  return `${compact.slice(0, Math.max(0, maximum - 3))}...`;
}
