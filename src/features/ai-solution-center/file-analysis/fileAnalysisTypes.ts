export const fileCategories = [
  "TEXT",
  "MARKDOWN",
  "CSV",
  "JSON",
  "XML",
  "LOG",
  "IMAGE",
  "AUDIO",
  "VIDEO",
  "PDF",
  "WORD",
  "EXCEL",
  "POWERPOINT",
  "ARCHIVE",
  "EXECUTABLE",
  "UNKNOWN_BINARY"
] as const;

export type FileCategory = (typeof fileCategories)[number];

export const fileSupportLevels = [
  "CONTENT_SUPPORTED",
  "STRUCTURE_SUPPORTED",
  "METADATA_ONLY",
  "REQUIRES_DESCRIPTION",
  "BLOCKED"
] as const;

export type FileSupportLevel = (typeof fileSupportLevels)[number];

export const fileProcessingStatuses = [
  "ATTACHED",
  "PROCESSING",
  "READY",
  "READY_WITH_WARNING",
  "REQUIRES_DESCRIPTION",
  "EXCLUDED",
  "ERROR"
] as const;

export type FileProcessingStatus = (typeof fileProcessingStatuses)[number];

export const sensitiveCategories = [
  "EMAIL",
  "PHONE",
  "IP_ADDRESS",
  "NATIONAL_ID_PATTERN",
  "CARD_PATTERN",
  "URL_TOKEN",
  "SECRET",
  "BEARER_TOKEN",
  "AWS_ACCESS_KEY",
  "LONG_TOKEN"
] as const;

export type SensitiveCategory = (typeof sensitiveCategories)[number];
export type SensitiveConfidence = "HIGH_PATTERN" | "POSSIBLE_PATTERN";
export type SensitiveRiskLevel = "NONE" | "REVIEW_RECOMMENDED" | "REVIEW_REQUIRED";

export interface SensitiveFinding {
  category: SensitiveCategory;
  confidence: SensitiveConfidence;
  count: number;
}

export type StructuredMetadataValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[];

export interface FileAnalysisRequest {
  file: File;
  fileId: string;
  userNote: string;
  includeInAnalysis: boolean;
}

export interface FileAnalysisResult {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  category: FileCategory;
  supportLevel: FileSupportLevel;
  processingStatus: FileProcessingStatus;
  summary: string;
  structureSummary: string;
  structuredMetadata: Readonly<Record<string, StructuredMetadataValue>>;
  extractedText?: string;
  redactedText: string;
  warnings: readonly string[];
  sensitiveFindings: readonly SensitiveFinding[];
  requiresUserDescription: boolean;
  includeInAnalysis: boolean;
  analysisSucceeded: boolean;
  analyzedAt: string;
}

export interface FileProcessingSummary {
  fileId: string;
  displayName: string;
  category: FileCategory;
  supportLevel: FileSupportLevel;
  processingStatus: FileProcessingStatus;
  includeInAnalysis: boolean;
  summary: string;
  structureSummary: string;
  warnings: readonly string[];
  sensitiveCategories: readonly SensitiveCategory[];
  sensitiveFindingCount: number;
  redactionApplied: boolean;
  userDescriptionUsed: boolean;
  requiresUserDescription: boolean;
}

export interface FileAnalysisAttachment extends FileAnalysisResult {
  note: string;
  baseProcessingStatus: FileProcessingStatus;
  inclusionTouched: boolean;
}

export interface AnalyzerOutput {
  summary: string;
  structureSummary: string;
  structuredMetadata: Readonly<Record<string, StructuredMetadataValue>>;
  redactedText: string;
  warnings: readonly string[];
  sensitiveFindings: readonly SensitiveFinding[];
  analysisSucceeded: boolean;
  requiresUserDescription?: boolean;
}
