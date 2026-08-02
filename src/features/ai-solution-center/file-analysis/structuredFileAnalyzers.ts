import type { AnalyzerOutput, SensitiveFinding, StructuredMetadataValue } from "./fileAnalysisTypes.ts";
import { mergeSensitiveFindings, redactSensitiveData, safeRedactedExcerpt } from "./sensitiveDataRedactor.ts";

const erpMesKeywords = ["LOT", "로트", "검사", "포장", "출하", "입고", "재고", "창고", "품목", "수량", "시리얼", "작업지시", "생산", "공정", "불량", "재작업", "설비", "MES", "ERP"];
const datePattern = /\b(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}:\d{2}(?::\d{2})?)\b/g;
const sensitiveKeyPattern = /password|passwd|pwd|access[_-]?token|refresh[_-]?token|api[_-]?key|apikey|secret|client[_-]?secret|authorization/i;

function compact(value: string, maximum = 300) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > maximum ? `${normalized.slice(0, Math.max(0, maximum - 3))}...` : normalized;
}

function keywordCounts(text: string) {
  const normalized = text.toLocaleLowerCase("ko-KR");
  return erpMesKeywords
    .map((keyword) => ({ keyword, count: normalized.split(keyword.toLocaleLowerCase("ko-KR")).length - 1 }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.keyword.localeCompare(right.keyword, "ko-KR"))
    .slice(0, 8);
}

function baseTextMetadata(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const redaction = redactSensitiveData(text);
  const keywords = keywordCounts(redaction.redactedText);
  const headings = lines
    .filter((line) => /^(?:#{1,6}\s+|[^\t]{2,80}:?$)/.test(line.trim()) && line.trim().length <= 80)
    .slice(0, 3)
    .map((line) => safeRedactedExcerpt(line.replace(/^#{1,6}\s+/, ""), 80));
  return {
    lines,
    redaction,
    keywords,
    headings,
    dateCount: text.match(datePattern)?.length ?? 0
  };
}

export function analyzeTextContent(text: string, markdown = false): AnalyzerOutput {
  const base = baseTextMetadata(text);
  const emptyLineCount = base.lines.filter((line) => line.trim().length === 0).length;
  const tabularLineCount = base.lines.filter((line) => line.split("\t").length >= 3).length;
  const markdownMetadata: Record<string, StructuredMetadataValue> = markdown ? {
    headingCount: base.lines.filter((line) => /^#{1,6}\s+/.test(line)).length,
    listItemCount: base.lines.filter((line) => /^\s*(?:[-*+]|\d+\.)\s+/.test(line)).length,
    codeFenceDetected: base.lines.some((line) => /^\s*```/.test(line))
  } : {};
  const keywordLabel = base.keywords.length > 0 ? base.keywords.map((item) => `${item.keyword} ${item.count}회`).join(", ") : "감지 없음";
  const summary = `${base.lines.length.toLocaleString()}줄 · ${text.length.toLocaleString()}자 · ERP·MES 관련 키워드 ${base.keywords.length}종 · 날짜·시간 형식 ${base.dateCount}건`;
  return {
    summary,
    structureSummary: `${markdown ? "Markdown" : "텍스트"} 구조: 빈 줄 ${emptyLineCount}개, 탭 구분 행 ${tabularLineCount}개, 주요 키워드 ${keywordLabel}`,
    structuredMetadata: {
      characterCount: text.length,
      lineCount: base.lines.length,
      emptyLineCount,
      headingCandidates: base.headings,
      erpMesKeywords: base.keywords.map((item) => item.keyword),
      dateTimePatternCount: base.dateCount,
      tabularLineCount,
      safePreview: safeRedactedExcerpt(base.redaction.redactedText, 300),
      ...markdownMetadata
    },
    redactedText: compact(base.redaction.redactedText, 4_000),
    warnings: markdownMetadata.codeFenceDetected ? ["코드 블록은 실행하지 않고 일반 텍스트로만 처리했습니다."] : [],
    sensitiveFindings: base.redaction.findings,
    analysisSucceeded: true
  };
}

export function analyzeLogContent(text: string): AnalyzerOutput {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const redaction = redactSensitiveData(text);
  const redactedLines = redaction.redactedText.replace(/\r\n/g, "\n").split("\n");
  const count = (pattern: RegExp) => lines.filter((line) => pattern.test(line)).length;
  const errorCount = count(/\bERROR\b/i);
  const warnCount = count(/\bWARN(?:ING)?\b/i);
  const infoCount = count(/\bINFO\b/i);
  const failureCandidateCount = count(/\b(?:exception|failed|timeout|deadlock|duplicate)\b/i);
  const httpStatuses = [...new Set(text.match(/\b[1-5]\d{2}\b/g) ?? [])].filter((value) => Number(value) >= 100 && Number(value) <= 599).slice(0, 10);
  const sqlErrors = [...new Set([...text.matchAll(/\b(?:SQL(?:STATE)?|error)\s*[:#]?\s*(\d{4,5})\b/gi)].map((match) => match[1]))].slice(0, 10);
  const representative = redactedLines
    .filter((line) => /\b(?:ERROR|WARN|exception|failed|timeout|deadlock|duplicate)\b/i.test(line))
    .map((line) => safeRedactedExcerpt(line, 160))
    .filter(Boolean)
    .slice(0, 5);
  const normalizedMessages = redactedLines.map((line) => line.replace(datePattern, "[TIME]").replace(/\b\d+\b/g, "#").trim()).filter(Boolean);
  const frequencies = new Map<string, number>();
  normalizedMessages.forEach((line) => frequencies.set(line, (frequencies.get(line) ?? 0) + 1));
  const repeats = [...frequencies.entries()].filter(([, value]) => value > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([message, occurrences]) => `${compact(message, 100)} (${occurrences}회)`);
  const summary = `${lines.length.toLocaleString()}줄 · ERROR ${errorCount}건 · WARN ${warnCount}건 · INFO ${infoCount}건 · 장애 키워드 후보 ${failureCandidateCount}건`;
  return {
    summary,
    structureSummary: `HTTP 상태 후보 ${httpStatuses.join(", ") || "없음"} · SQL 오류번호 후보 ${sqlErrors.join(", ") || "없음"} · 반복 메시지 후보 ${repeats.length}종`,
    structuredMetadata: {
      lineCount: lines.length,
      errorCount,
      warnCount,
      infoCount,
      failureCandidateCount,
      dateTimePatternCount: text.match(datePattern)?.length ?? 0,
      httpStatusCandidates: httpStatuses,
      sqlErrorCandidates: sqlErrors,
      repeatedMessages: repeats,
      representativeExcerpts: representative
    },
    redactedText: compact(`${summary}\n${representative.join("\n")}`, 1_500),
    warnings: ["오류 원인 확정이 아니라 컨설턴트·개발자가 우선 확인할 로그 후보입니다."],
    sensitiveFindings: redaction.findings,
    analysisSucceeded: true
  };
}

export interface CsvParseResult {
  rows: readonly (readonly string[])[];
  error?: string;
}

export function parseCsv(text: string): CsvParseResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === "\"" && text[index + 1] === "\"") { cell += "\""; index += 1; }
      else if (character === "\"") quoted = false;
      else cell += character;
      continue;
    }
    if (character === "\"") quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (quoted) return { rows, error: "닫히지 않은 큰따옴표가 있습니다." };
  if (cell.length > 0 || row.length > 0 || text.endsWith(",")) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return { rows };
}

function inferredColumnType(values: readonly string[]) {
  const filled = values.map((value) => value.trim()).filter(Boolean);
  if (filled.length === 0) return "EMPTY";
  if (filled.every((value) => /^[-+]?\d+(?:\.\d+)?$/.test(value))) return "NUMBER";
  if (filled.every((value) => /^(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{8})$/.test(value))) return "DATE";
  return "TEXT";
}

export function analyzeCsvContent(text: string): AnalyzerOutput {
  const parsed = parseCsv(text);
  if (parsed.error || parsed.rows.length === 0) {
    const fallback = analyzeTextContent(text);
    return { ...fallback, summary: `CSV 구조 오류: ${parsed.error ?? "행을 찾지 못했습니다."}`, structureSummary: "CSV 구조 분석에 실패해 일반 텍스트 요약만 제공했습니다.", warnings: [parsed.error ?? "CSV 행을 찾지 못했습니다.", ...fallback.warnings], analysisSucceeded: false, requiresUserDescription: true };
  }
  const redaction = redactSensitiveData(text);
  const header = parsed.rows[0].map((value) => safeRedactedExcerpt(value, 80));
  const dataRows = parsed.rows.slice(1);
  const widths = parsed.rows.map((row) => row.length);
  const irregular = new Set(widths).size > 1;
  const emptyRowCount = dataRows.filter((row) => row.every((cell) => cell.trim().length === 0)).length;
  const emptyColumnCount = header.filter((_value, column) => dataRows.every((row) => !row[column]?.trim())).length;
  const duplicateHeaders = header.filter((value, index) => value && header.indexOf(value) !== index);
  const types = header.map((_value, column) => inferredColumnType(dataRows.slice(0, 100).map((row) => row[column] ?? "")));
  const relevantHeaders = header.filter((value) => /lot|로트|품목|item|수량|qty|일자|date|창고|warehouse|serial|시리얼/i.test(value));
  const preview = dataRows.slice(0, 5).map((row) => row.map((cell) => safeRedactedExcerpt(cell, 80)).join(" | "));
  const warnings = irregular ? ["행별 열 개수가 일정하지 않습니다."] : [];
  const summary = `추정 ${Math.max(...widths)}열 · 데이터 ${dataRows.length.toLocaleString()}행 · Header ${header.length}개 · ERP·MES 관련 Header ${relevantHeaders.length}개`;
  return {
    summary,
    structureSummary: `Header: ${header.join(", ") || "없음"} · 열 유형 후보: ${types.join(", ")}`,
    structuredMetadata: {
      estimatedColumnCount: Math.max(...widths),
      dataRowCount: dataRows.length,
      headers: header,
      emptyRowCount,
      emptyColumnCount,
      duplicateHeaders: [...new Set(duplicateHeaders)],
      columnTypeCandidates: types,
      erpMesHeaders: relevantHeaders,
      safePreview: preview
    },
    redactedText: compact(`${summary}\nHeader: ${header.join(", ")}\nERP·MES Header: ${relevantHeaders.join(", ")}`, 1_200),
    warnings,
    sensitiveFindings: redaction.findings,
    analysisSucceeded: true
  };
}

function jsonType(value: unknown) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value === "object" ? "object" : typeof value;
}

export function analyzeJsonContent(text: string): AnalyzerOutput {
  const redaction = redactSensitiveData(text);
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch {
    const fallback = analyzeTextContent(text);
    return { ...fallback, summary: "JSON 구조 오류: JSON.parse에 실패했습니다.", structureSummary: "JSON 구조 분석에 실패해 일반 텍스트 요약만 제공했습니다.", warnings: ["JSON 형식을 확인해 주세요.", ...fallback.warnings], analysisSucceeded: false, requiresUserDescription: true };
  }

  const paths: string[] = [];
  const representativeKeys: string[] = [];
  const erpKeys: string[] = [];
  const objectKeySets: string[][] = [];
  let maximumDepth = 0;
  let nullCount = 0;
  let emptyStringCount = 0;
  let sensitiveKeyCount = 0;

  const visit = (value: unknown, path: string, depth: number) => {
    maximumDepth = Math.max(maximumDepth, depth);
    if (value === null) { nullCount += 1; return; }
    if (value === "") { emptyStringCount += 1; return; }
    if (Array.isArray(value)) {
      value.slice(0, 200).forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (!value || typeof value !== "object") return;
    const keys = Object.keys(value);
    objectKeySets.push(keys);
    for (const key of keys.slice(0, 200)) {
      const safeKey = sensitiveKeyPattern.test(key) ? "[SENSITIVE_KEY]" : key;
      if (sensitiveKeyPattern.test(key)) sensitiveKeyCount += 1;
      if (!representativeKeys.includes(safeKey)) representativeKeys.push(safeKey);
      if (/lot|로트|item|품목|qty|수량|date|일자|warehouse|창고|serial|시리얼|work|작업|inspection|검사|production|생산/i.test(key) && !erpKeys.includes(key)) erpKeys.push(key);
      const nextPath = path ? `${path}.${safeKey}` : safeKey;
      if (paths.length < 30) paths.push(nextPath);
      visit((value as Record<string, unknown>)[key], nextPath, depth + 1);
    }
  };
  visit(parsed, "", 0);
  const commonKeys = objectKeySets.length > 1
    ? objectKeySets[0].filter((key) => objectKeySets.slice(1, 20).every((keys) => keys.includes(key))).filter((key) => !sensitiveKeyPattern.test(key)).slice(0, 20)
    : [];
  const keyFinding: SensitiveFinding[] = sensitiveKeyCount > 0 ? [{ category: "SECRET", confidence: "HIGH_PATTERN", count: sensitiveKeyCount }] : [];
  const findings = mergeSensitiveFindings(redaction.findings, keyFinding);
  const topType = jsonType(parsed);
  const topKeyCount = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.keys(parsed).length : 0;
  const arrayItemCount = Array.isArray(parsed) ? parsed.length : 0;
  const summary = `최상위 ${topType} · key ${topKeyCount}개 · 배열 항목 ${arrayItemCount}개 · 최대 중첩 깊이 ${maximumDepth}`;
  return {
    summary,
    structureSummary: `대표 key ${representativeKeys.slice(0, 12).join(", ") || "없음"} · ERP·MES 관련 key ${erpKeys.slice(0, 12).join(", ") || "없음"}`,
    structuredMetadata: {
      topLevelType: topType,
      topLevelKeyCount: topKeyCount,
      arrayItemCount,
      maximumDepth,
      representativeKeys: representativeKeys.slice(0, 30),
      commonObjectKeys: commonKeys,
      nullCount,
      emptyStringCount,
      erpMesKeys: erpKeys.slice(0, 30),
      keyPaths: paths
    },
    redactedText: compact(`${summary}\n대표 key: ${representativeKeys.slice(0, 20).join(", ")}\nERP·MES key: ${erpKeys.slice(0, 20).join(", ")}`, 1_200),
    warnings: sensitiveKeyCount > 0 ? ["민감정보 가능성이 있는 key의 값은 요약에 포함하지 않았습니다."] : [],
    sensitiveFindings: findings,
    analysisSucceeded: true
  };
}

interface XmlStructure {
  valid: boolean;
  root: string;
  elementCount: number;
  maximumDepth: number;
  attributeCount: number;
  elementNames: readonly string[];
  repeatedElements: readonly string[];
  erpMesNames: readonly string[];
  paths: readonly string[];
}

function xmlStructureWithTokenizer(text: string): XmlStructure {
  const tagPattern = /<\s*(\/)?\s*([A-Za-z_][\w:.-]*)([^<>]*?)(\/)?\s*>/g;
  const stack: string[] = [];
  const names: string[] = [];
  const paths: string[] = [];
  const counts = new Map<string, number>();
  let root = "";
  let attributeCount = 0;
  let maximumDepth = 0;
  let valid = true;
  for (const match of text.matchAll(tagPattern)) {
    const closing = Boolean(match[1]);
    const name = match[2];
    const declaration = name.startsWith("?") || name.startsWith("!");
    if (declaration) continue;
    if (closing) {
      if (stack.pop() !== name) valid = false;
      continue;
    }
    if (!root) root = name;
    stack.push(name);
    names.push(name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
    attributeCount += [...match[3].matchAll(/\s+[A-Za-z_:][\w:.-]*\s*=/g)].length;
    maximumDepth = Math.max(maximumDepth, stack.length);
    if (paths.length < 30) paths.push(stack.join("/"));
    if (match[4]) stack.pop();
  }
  if (stack.length > 0 || !root) valid = false;
  const uniqueNames = [...new Set(names)];
  return {
    valid,
    root,
    elementCount: names.length,
    maximumDepth,
    attributeCount,
    elementNames: uniqueNames.slice(0, 30),
    repeatedElements: [...counts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([name]) => name),
    erpMesNames: uniqueNames.filter((name) => /lot|item|품목|qty|수량|date|warehouse|serial|work|inspection|production|검사|생산/i.test(name)).slice(0, 20),
    paths
  };
}

function xmlStructureWithDomParser(text: string): XmlStructure | undefined {
  if (typeof DOMParser === "undefined") return undefined;
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) return { ...xmlStructureWithTokenizer(text), valid: false };
  const elements = [...document.querySelectorAll("*")];
  const paths: string[] = [];
  let maximumDepth = 0;
  elements.slice(0, 5000).forEach((element) => {
    const path: string[] = [];
    let current: Element | null = element;
    while (current) { path.unshift(current.tagName); current = current.parentElement; }
    maximumDepth = Math.max(maximumDepth, path.length);
    if (paths.length < 30) paths.push(path.join("/"));
  });
  const names = elements.map((element) => element.tagName);
  const counts = new Map<string, number>();
  names.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  const uniqueNames = [...new Set(names)];
  return {
    valid: true,
    root: document.documentElement?.tagName ?? "",
    elementCount: elements.length,
    maximumDepth,
    attributeCount: elements.reduce((sum, element) => sum + element.attributes.length, 0),
    elementNames: uniqueNames.slice(0, 30),
    repeatedElements: [...counts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([name]) => name),
    erpMesNames: uniqueNames.filter((name) => /lot|item|품목|qty|수량|date|warehouse|serial|work|inspection|production|검사|생산/i.test(name)).slice(0, 20),
    paths
  };
}

export function analyzeXmlContent(text: string): AnalyzerOutput {
  const redaction = redactSensitiveData(text);
  const doctypeDetected = /<!DOCTYPE|<!ENTITY/i.test(text);
  const structure = xmlStructureWithDomParser(text) ?? xmlStructureWithTokenizer(text);
  if (!structure.valid) {
    const fallback = analyzeTextContent(text);
    return {
      ...fallback,
      summary: "XML 구조 오류: parsererror가 감지되었습니다.",
      structureSummary: "XML 구조 분석에 실패해 일반 텍스트 요약만 제공했습니다.",
      structuredMetadata: { ...fallback.structuredMetadata, parserError: true },
      warnings: ["XML 요소의 열고 닫는 구조를 확인해 주세요.", ...(doctypeDetected ? ["외부 엔터티 또는 문서 유형 선언이 포함돼 있어 외부 리소스를 불러오지 않습니다."] : []), ...fallback.warnings],
      analysisSucceeded: false,
      requiresUserDescription: true
    };
  }
  const summary = `root ${structure.root} · element ${structure.elementCount}개 · attribute ${structure.attributeCount}개 · 최대 깊이 ${structure.maximumDepth}`;
  return {
    summary,
    structureSummary: `대표 element ${structure.elementNames.slice(0, 12).join(", ") || "없음"} · 반복 element ${structure.repeatedElements.join(", ") || "없음"}`,
    structuredMetadata: {
      rootElement: structure.root,
      elementCount: structure.elementCount,
      maximumDepth: structure.maximumDepth,
      representativeElements: structure.elementNames,
      attributeCount: structure.attributeCount,
      repeatedElements: structure.repeatedElements,
      parserError: false,
      erpMesElements: structure.erpMesNames,
      elementPaths: structure.paths
    },
    redactedText: compact(`${summary}\nERP·MES element: ${structure.erpMesNames.join(", ")}`, 1_000),
    warnings: doctypeDetected ? ["외부 엔터티 또는 문서 유형 선언이 포함돼 있어 외부 리소스를 불러오지 않습니다."] : [],
    sensitiveFindings: redaction.findings,
    analysisSucceeded: true
  };
}
