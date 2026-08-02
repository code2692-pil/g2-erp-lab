import type { AnalyzerOutput, FileAnalysisRequest, FileAnalysisResult, FileCategory, FileProcessingStatus, FileSupportLevel } from "./fileAnalysisTypes.ts";
import { redactSensitiveData } from "./sensitiveDataRedactor.ts";
import { analyzeCsvContent, analyzeJsonContent, analyzeLogContent, analyzeTextContent, analyzeXmlContent } from "./structuredFileAnalyzers.ts";
import { extractMeetingDocument } from "../meetingDocumentExtractor.ts";

export const maximumAttachmentCount = 10;
export const maximumAttachmentBytes = 50 * 1024 * 1024;
export const maximumTotalAttachmentBytes = 100 * 1024 * 1024;
export const maximumTextAnalysisBytes = 512 * 1024;
export const maximumStructuredAnalysisBytes = 2 * 1024 * 1024;
export const maximumDocumentAnalysisBytes = 20 * 1024 * 1024;

const extensionCategories: Readonly<Record<string, FileCategory>> = {
  txt: "TEXT", md: "MARKDOWN", markdown: "MARKDOWN", csv: "CSV", json: "JSON", xml: "XML", log: "LOG",
  png: "IMAGE", jpg: "IMAGE", jpeg: "IMAGE", gif: "IMAGE", webp: "IMAGE", bmp: "IMAGE", svg: "IMAGE",
  mp3: "AUDIO", wav: "AUDIO", m4a: "AUDIO", ogg: "AUDIO", flac: "AUDIO",
  mp4: "VIDEO", webm: "VIDEO", mov: "VIDEO", avi: "VIDEO", mkv: "VIDEO",
  pdf: "PDF", doc: "WORD", docx: "WORD", xls: "EXCEL", xlsx: "EXCEL", ppt: "POWERPOINT", pptx: "POWERPOINT",
  zip: "ARCHIVE", "7z": "ARCHIVE", rar: "ARCHIVE",
  exe: "EXECUTABLE", msi: "EXECUTABLE", bat: "EXECUTABLE", cmd: "EXECUTABLE", ps1: "EXECUTABLE", sh: "EXECUTABLE", dll: "EXECUTABLE", com: "EXECUTABLE", scr: "EXECUTABLE", apk: "EXECUTABLE"
};

export function extensionOf(fileName: string) {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index + 1).toLocaleLowerCase("en-US") : "";
}

export function classifyFile(fileName: string, mimeType = ""): FileCategory {
  const extension = extensionOf(fileName);
  if (extensionCategories[extension] === "EXECUTABLE") return "EXECUTABLE";
  const fromExtension = extensionCategories[extension];
  const mime = mimeType.toLocaleLowerCase("en-US");
  if (fromExtension && (!mime || mime === "application/octet-stream")) return fromExtension;
  if (mime === "text/csv") return "CSV";
  if (mime.includes("json")) return "JSON";
  if (mime.includes("xml")) return "XML";
  if (mime === "text/markdown") return "MARKDOWN";
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("text/")) return fromExtension ?? "TEXT";
  return fromExtension ?? "UNKNOWN_BINARY";
}

function supportFor(category: FileCategory): FileSupportLevel {
  if (["TEXT", "MARKDOWN", "LOG"].includes(category)) return "CONTENT_SUPPORTED";
  if (["CSV", "JSON", "XML"].includes(category)) return "STRUCTURE_SUPPORTED";
  if (["PDF", "WORD", "EXCEL", "POWERPOINT"].includes(category)) return "CONTENT_SUPPORTED";
  if (["IMAGE", "AUDIO", "VIDEO"].includes(category)) return "METADATA_ONLY";
  if (category === "EXECUTABLE") return "BLOCKED";
  return "REQUIRES_DESCRIPTION";
}

function deterministicAnalyzedAt(file: File) {
  const value = Number.isFinite(file.lastModified) && file.lastModified > 0 ? file.lastModified : 0;
  return new Date(value).toISOString();
}

function baseResult(request: FileAnalysisRequest, category: FileCategory, supportLevel: FileSupportLevel): Omit<FileAnalysisResult, "processingStatus" | "summary" | "structureSummary" | "structuredMetadata" | "redactedText" | "warnings" | "sensitiveFindings" | "requiresUserDescription" | "includeInAnalysis" | "analysisSucceeded"> {
  return {
    fileId: request.fileId,
    fileName: request.file.name,
    fileSize: request.file.size,
    mimeType: request.file.type || "알 수 없음",
    category,
    supportLevel,
    analyzedAt: deterministicAnalyzedAt(request.file)
  };
}

function resultFromOutput(request: FileAnalysisRequest, category: FileCategory, supportLevel: FileSupportLevel, output: AnalyzerOutput): FileAnalysisResult {
  const requiresUserDescription = output.requiresUserDescription ?? false;
  const includeInAnalysis = output.analysisSucceeded && !requiresUserDescription && request.includeInAnalysis;
  return {
    ...baseResult(request, category, supportLevel),
    processingStatus: requiresUserDescription ? "REQUIRES_DESCRIPTION" : output.analysisSucceeded ? (output.warnings.length > 0 ? "READY_WITH_WARNING" : "READY") : "READY_WITH_WARNING",
    summary: output.summary,
    structureSummary: output.structureSummary,
    structuredMetadata: output.structuredMetadata,
    redactedText: output.redactedText,
    warnings: output.warnings,
    sensitiveFindings: output.sensitiveFindings,
    requiresUserDescription,
    includeInAnalysis,
    analysisSucceeded: output.analysisSucceeded
  };
}

async function imageMetadata(file: File): Promise<AnalyzerOutput> {
  const fallback: AnalyzerOutput = {
    summary: `이미지 메타정보 · ${file.type || "형식 미확인"} · ${file.size.toLocaleString()} B`,
    structureSummary: "이미지 메타정보 확인에 실패했습니다.",
    structuredMetadata: { mimeType: file.type || "알 수 없음", fileSize: file.size },
    redactedText: "",
    warnings: ["이미지 크기를 확인하지 못했습니다. 사용자 메모를 입력해 주세요.", "OCR이나 장면 분석은 지원하지 않습니다."],
    sensitiveFindings: [],
    analysisSucceeded: false,
    requiresUserDescription: true
  };
  const success = (width: number, height: number): AnalyzerOutput => ({
    summary: `이미지 메타정보 · ${width}×${height} · ${file.size.toLocaleString()} B`,
    structureSummary: `가로 ${width}px · 세로 ${height}px · 비율 ${(width / Math.max(height, 1)).toFixed(2)}`,
    structuredMetadata: { mimeType: file.type || "알 수 없음", fileSize: file.size, width, height, aspectRatio: Number((width / Math.max(height, 1)).toFixed(2)) },
    redactedText: "",
    warnings: ["이미지 메타정보만 확인했습니다. OCR이나 장면 분석은 지원하지 않습니다."],
    sensitiveFindings: [],
    analysisSucceeded: true,
    requiresUserDescription: true
  });
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      return success(width, height);
    } catch {
      // Some browser codecs reject files that an HTMLImageElement can still identify.
    }
  }
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return fallback;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = document.createElement("img");
    image.decoding = "async";
    image.src = objectUrl;
    const loaded = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => { if (!settled) { settled = true; resolve(value); } };
      image.addEventListener("load", () => finish(true), { once: true });
      image.addEventListener("error", () => finish(false), { once: true });
      window.setTimeout(() => finish(false), 3_000);
    });
    if (!loaded || image.naturalWidth <= 0 || image.naturalHeight <= 0) return fallback;
    return success(image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function mediaMetadata(file: File, category: "AUDIO" | "VIDEO"): Promise<AnalyzerOutput> {
  const baseMetadata = { mimeType: file.type || "알 수 없음", fileSize: file.size };
  const failure: AnalyzerOutput = {
    summary: `${category === "AUDIO" ? "음성" : "영상"} 메타정보 · ${file.size.toLocaleString()} B`,
    structureSummary: "재생 시간 또는 화면 크기 메타정보를 확인하지 못했습니다.",
    structuredMetadata: baseMetadata,
    redactedText: "",
    warnings: ["메타정보 확인에 실패했습니다. 사용자 메모·전사문을 입력해 주세요.", category === "AUDIO" ? "음성 전사를 지원하지 않습니다." : "영상 장면·음성 분석을 지원하지 않습니다."],
    sensitiveFindings: [],
    analysisSucceeded: false,
    requiresUserDescription: true
  };
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return failure;
  const element = document.createElement(category === "AUDIO" ? "audio" : "video");
  const objectUrl = URL.createObjectURL(file);
  try {
    element.preload = "metadata";
    element.src = objectUrl;
    const loaded = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => { if (!settled) { settled = true; resolve(value); } };
      element.addEventListener("loadedmetadata", () => finish(true), { once: true });
      element.addEventListener("error", () => finish(false), { once: true });
      window.setTimeout(() => finish(false), 3_000);
    });
    if (!loaded || !Number.isFinite(element.duration)) return failure;
    const durationSeconds = Number(element.duration.toFixed(1));
    const videoMetadata = element instanceof HTMLVideoElement
      ? { width: element.videoWidth, height: element.videoHeight }
      : null;
    return {
      summary: `${category === "AUDIO" ? "음성" : "영상"} 메타정보 · 재생 시간 ${durationSeconds}초 · ${file.size.toLocaleString()} B`,
      structureSummary: videoMetadata ? `영상 ${videoMetadata.width}×${videoMetadata.height}` : "재생 시간과 파일 정보만 확인했습니다.",
      structuredMetadata: videoMetadata
        ? { ...baseMetadata, durationSeconds, width: videoMetadata.width, height: videoMetadata.height }
        : { ...baseMetadata, durationSeconds },
      redactedText: "",
      warnings: [category === "AUDIO" ? "음성 전사를 지원하지 않습니다." : "영상 장면·음성 분석을 지원하지 않습니다."],
      sensitiveFindings: [],
      analysisSucceeded: true,
      requiresUserDescription: true
    };
  } finally {
    element.removeAttribute("src");
    element.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function descriptionOnlyOutput(file: File, category: FileCategory): AnalyzerOutput {
  const labels: Partial<Record<FileCategory, string>> = {
    PDF: "PDF", WORD: "Word", EXCEL: "Excel", POWERPOINT: "PowerPoint", ARCHIVE: "압축", UNKNOWN_BINARY: "기타 바이너리"
  };
  return {
    summary: `${labels[category] ?? category} 파일 · ${file.size.toLocaleString()} B`,
    structureSummary: "파일 유형과 크기만 확인했습니다.",
    structuredMetadata: { mimeType: file.type || "알 수 없음", fileSize: file.size },
    redactedText: "",
    warnings: ["본문 자동 추출을 지원하지 않습니다. 주요 내용·전사문·요약을 입력해 주세요."],
    sensitiveFindings: [],
    analysisSucceeded: true,
    requiresUserDescription: true
  };
}

function extractedDocumentOutput(text: string, label: string, segmentCount: number): AnalyzerOutput {
  const analyzed = analyzeTextContent(text, false);
  return {
    ...analyzed,
    summary: `${label} 본문 ${segmentCount.toLocaleString()}개 구간을 추출했습니다. ${analyzed.summary}`,
    structureSummary: `${label} 본문 구간 ${segmentCount.toLocaleString()}개 · ${analyzed.structureSummary}`,
    structuredMetadata: { ...analyzed.structuredMetadata, extractedSegmentCount: segmentCount, extractor: "local-document" }
  };
}

async function officeDocumentOutput(file: File, category: "WORD" | "EXCEL" | "POWERPOINT"): Promise<AnalyzerOutput> {
  const label = category === "WORD" ? "Word" : category === "EXCEL" ? "Excel" : "PowerPoint";
  try {
    const segments = await extractMeetingDocument(file);
    const text = segments.map((segment) => `${segment.locator}: ${segment.text}`).join("\n");
    if (!text.trim()) throw new Error("읽을 수 있는 본문이 없습니다.");
    return extractedDocumentOutput(text, label, segments.length);
  } catch (caught) {
    const fallback = descriptionOnlyOutput(file, category);
    return { ...fallback, warnings: [`본문 추출 실패: ${caught instanceof Error ? caught.message : "문서를 읽을 수 없습니다."}`, ...fallback.warnings] };
  }
}

async function pdfDocumentOutput(file: File): Promise<AnalyzerOutput> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useWasm: false, stopAtErrors: true, maxImageSize: 0 });
    const document = await loadingTask.promise;
    const pages: string[] = [];
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
        if (text) pages.push(`PDF 페이지 ${pageNumber}: ${text}`);
      }
    } finally {
      await loadingTask.destroy();
    }
    if (pages.length === 0) {
      return {
        ...descriptionOnlyOutput(file, "PDF"),
        summary: "PDF에서 읽을 수 있는 텍스트 본문을 찾지 못했습니다.",
        warnings: ["이미지로 스캔된 PDF의 OCR은 지원하지 않습니다. 텍스트 PDF 또는 주요 내용 설명을 등록해 주세요."],
        analysisSucceeded: false,
        requiresUserDescription: true
      };
    }
    return extractedDocumentOutput(pages.join("\n"), "PDF", pages.length);
  } catch (caught) {
    const fallback = descriptionOnlyOutput(file, "PDF");
    return { ...fallback, warnings: [`PDF 본문 추출 실패: ${caught instanceof Error ? caught.message : "PDF를 읽을 수 없습니다."}`, ...fallback.warnings] };
  }
}

export async function analyzeFile(request: FileAnalysisRequest): Promise<FileAnalysisResult> {
  const category = classifyFile(request.file.name, request.file.type);
  const supportLevel = supportFor(category);
  if (category === "EXECUTABLE") {
    return {
      ...baseResult(request, category, supportLevel),
      processingStatus: "EXCLUDED",
      summary: "보안상 실행 가능한 파일은 분석에 사용할 수 없습니다.",
      structureSummary: "파일 내용 읽기·실행·메모 입력·추천 근거 사용을 차단했습니다.",
      structuredMetadata: { mimeType: request.file.type || "알 수 없음", fileSize: request.file.size },
      redactedText: "",
      warnings: ["실행파일은 첨부 정보만 표시합니다."],
      sensitiveFindings: [],
      requiresUserDescription: false,
      includeInAnalysis: false,
      analysisSucceeded: false
    };
  }
  if (request.file.size > maximumAttachmentBytes) {
    return {
      ...baseResult(request, category, supportLevel),
      processingStatus: "ERROR",
      summary: "개별 파일 50MB 제한을 초과했습니다.",
      structureSummary: "첨부 정보만 유지하며 내용을 읽지 않았습니다.",
      structuredMetadata: { mimeType: request.file.type || "알 수 없음", fileSize: request.file.size },
      redactedText: "",
      warnings: ["파일 크기를 줄이거나 필요한 내용을 메모로 입력해 주세요."],
      sensitiveFindings: [],
      requiresUserDescription: true,
      includeInAnalysis: false,
      analysisSucceeded: false
    };
  }

  if (category === "IMAGE") return resultFromOutput(request, category, supportLevel, await imageMetadata(request.file));
  if (category === "AUDIO" || category === "VIDEO") return resultFromOutput(request, category, supportLevel, await mediaMetadata(request.file, category));
  if (["PDF", "WORD", "EXCEL", "POWERPOINT"].includes(category) && request.file.size > maximumDocumentAnalysisBytes) return resultFromOutput(request, category, supportLevel, descriptionOnlyOutput(request.file, category));
  if (category === "PDF") return resultFromOutput(request, category, supportLevel, await pdfDocumentOutput(request.file));
  if (category === "WORD" || category === "EXCEL" || category === "POWERPOINT") return resultFromOutput(request, category, supportLevel, await officeDocumentOutput(request.file, category));
  if (["ARCHIVE", "UNKNOWN_BINARY"].includes(category)) return resultFromOutput(request, category, supportLevel, descriptionOnlyOutput(request.file, category));

  const limit = ["CSV", "JSON", "XML"].includes(category) ? maximumStructuredAnalysisBytes : maximumTextAnalysisBytes;
  if (request.file.size > limit) {
    return {
      ...baseResult(request, category, supportLevel),
      processingStatus: "REQUIRES_DESCRIPTION",
      summary: `내용 읽기 제한(${Math.round(limit / 1024)}KB)을 초과했습니다.`,
      structureSummary: "전체를 분석했다고 표시하지 않으며 사용자 설명이 필요합니다.",
      structuredMetadata: { mimeType: request.file.type || "알 수 없음", fileSize: request.file.size, analysisByteLimit: limit },
      redactedText: "",
      warnings: ["첨부 정보는 유지했습니다. 주요 내용·의사결정을 메모로 입력해 주세요."],
      sensitiveFindings: [],
      requiresUserDescription: true,
      includeInAnalysis: false,
      analysisSucceeded: false
    };
  }

  try {
    const text = await request.file.text();
    if (!text.trim()) {
      return {
        ...baseResult(request, category, supportLevel),
        processingStatus: "REQUIRES_DESCRIPTION",
        summary: "읽을 수 있는 텍스트 내용이 없습니다.",
        structureSummary: "사용자 설명이 필요합니다.",
        structuredMetadata: { fileSize: request.file.size },
        redactedText: "",
        warnings: ["주요 내용·의사결정을 메모로 입력해 주세요."],
        sensitiveFindings: [],
        requiresUserDescription: true,
        includeInAnalysis: false,
        analysisSucceeded: false
      };
    }
    const analyzer = category === "CSV" ? analyzeCsvContent
      : category === "JSON" ? analyzeJsonContent
        : category === "XML" ? analyzeXmlContent
          : category === "LOG" ? analyzeLogContent
            : (value: string) => analyzeTextContent(value, category === "MARKDOWN");
    return resultFromOutput(request, category, supportLevel, analyzer(text));
  } catch {
    const redaction = redactSensitiveData(request.userNote);
    return {
      ...baseResult(request, category, supportLevel),
      processingStatus: "ERROR",
      summary: "파일 내용을 읽지 못했습니다.",
      structureSummary: "첨부 정보는 유지했으며 사용자 설명을 입력할 수 있습니다.",
      structuredMetadata: { fileSize: request.file.size },
      redactedText: redaction.redactedText,
      warnings: ["파일을 다시 선택하거나 주요 내용을 메모로 입력해 주세요."],
      sensitiveFindings: redaction.findings,
      requiresUserDescription: true,
      includeInAnalysis: false,
      analysisSucceeded: false
    };
  }
}
