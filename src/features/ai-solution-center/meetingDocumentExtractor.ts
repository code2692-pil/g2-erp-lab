export interface MeetingSourceSegment {
  id: string;
  fileName: string;
  locator: string;
  text: string;
}

const allowedExtensions = new Set(["txt", "md", "docx", "xlsx", "pptx"]);
export const meetingFileAccept = ".txt,.md,.docx,.xlsx,.pptx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const maximumMeetingFileBytes = 20 * 1024 * 1024;

function extensionOf(fileName: string) {
  return fileName.slice(fileName.lastIndexOf(".") + 1).toLocaleLowerCase("en-US");
}

function safeFileName(fileName: string) {
  return fileName.length > 0 && fileName.length <= 180 && !fileName.includes("/") && !fileName.includes("\\") && fileName !== "." && fileName !== "..";
}

function segmentId(fileName: string, index: number) {
  return `${fileName.replace(/[^a-zA-Z0-9가-힣._-]/g, "_")}-${index + 1}`;
}

function xmlDocument(xml: string) {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  if (parsed.querySelector("parsererror")) throw new Error("문서 XML을 읽을 수 없습니다.");
  return parsed;
}

function elementsByLocalName(root: ParentNode, localName: string) {
  return Array.from(root.querySelectorAll("*")).filter((element) => element.localName === localName);
}

function textFromDescendants(root: ParentNode, localName = "t") {
  return elementsByLocalName(root, localName).map((element) => element.textContent ?? "").join("").trim();
}

async function inflateRaw(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEntries(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let endOffset = -1;
  for (let offset = Math.max(0, bytes.length - 65_557); offset <= bytes.length - 22; offset += 1) {
    if (view.getUint32(offset, true) === 0x06054b50) endOffset = offset;
  }
  if (endOffset < 0) throw new Error("OOXML ZIP 끝 정보를 찾을 수 없습니다.");
  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const entries = new Map<string, Uint8Array>();
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("OOXML ZIP 디렉터리가 손상되었습니다.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
    if (method === 0) entries.set(name, compressed);
    else if (method === 8) entries.set(name, await inflateRaw(compressed));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function entryText(entries: Map<string, Uint8Array>, path: string) {
  const value = entries.get(path);
  if (!value) throw new Error(`문서 구성요소 ${path}을 찾을 수 없습니다.`);
  return new TextDecoder("utf-8").decode(value);
}

function docxSegments(fileName: string, entries: Map<string, Uint8Array>) {
  const document = xmlDocument(entryText(entries, "word/document.xml"));
  const paragraphs = elementsByLocalName(document, "p");
  return paragraphs.map((paragraph, index) => ({ id: segmentId(fileName, index), fileName, locator: `DOCX 문단 ${index + 1}`, text: textFromDescendants(paragraph) })).filter((segment) => segment.text);
}

function xlsxSegments(fileName: string, entries: Map<string, Uint8Array>) {
  const sharedEntry = entries.get("xl/sharedStrings.xml");
  const sharedStrings = sharedEntry ? elementsByLocalName(xmlDocument(new TextDecoder("utf-8").decode(sharedEntry)), "si").map((item) => textFromDescendants(item)) : [];
  const sheetPaths = Array.from(entries.keys()).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const segments: MeetingSourceSegment[] = [];
  sheetPaths.forEach((path, sheetIndex) => {
    const document = xmlDocument(entryText(entries, path));
    elementsByLocalName(document, "c").forEach((cell) => {
      const reference = cell.getAttribute("r") ?? `CELL-${segments.length + 1}`;
      const value = elementsByLocalName(cell, "v")[0]?.textContent ?? textFromDescendants(cell);
      const text = cell.getAttribute("t") === "s" ? sharedStrings[Number(value)] ?? "" : value.trim();
      if (text) segments.push({ id: segmentId(fileName, segments.length), fileName, locator: `XLSX Sheet${sheetIndex + 1}!${reference}`, text });
    });
  });
  return segments;
}

function pptxSegments(fileName: string, entries: Map<string, Uint8Array>) {
  const slidePaths = Array.from(entries.keys()).filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const segments: MeetingSourceSegment[] = [];
  slidePaths.forEach((path, slideIndex) => {
    const document = xmlDocument(entryText(entries, path));
    elementsByLocalName(document, "p").forEach((paragraph, paragraphIndex) => {
      const text = textFromDescendants(paragraph);
      if (text) segments.push({ id: segmentId(fileName, segments.length), fileName, locator: `PPTX 슬라이드 ${slideIndex + 1} / 문단 ${paragraphIndex + 1}`, text });
    });
  });
  return segments;
}

export async function extractMeetingDocument(file: File): Promise<MeetingSourceSegment[]> {
  if (!safeFileName(file.name)) throw new Error("안전하지 않은 파일명입니다. 경로 문자를 제거해 주세요.");
  if (file.size > maximumMeetingFileBytes) throw new Error("개별 파일 20MB 제한을 초과했습니다.");
  const extension = extensionOf(file.name);
  if (!allowedExtensions.has(extension)) throw new Error("TXT, MD, DOCX, XLSX, PPTX 파일만 등록할 수 있습니다.");
  if (extension === "txt" || extension === "md") {
    const text = await file.text();
    return text.split(/\r?\n/).map((line, index) => ({ id: segmentId(file.name, index), fileName: file.name, locator: `${extension.toUpperCase()} 줄 ${index + 1}`, text: line.trim() })).filter((segment) => segment.text);
  }
  const entries = await unzipEntries(await file.arrayBuffer());
  if (extension === "docx") return docxSegments(file.name, entries);
  if (extension === "xlsx") return xlsxSegments(file.name, entries);
  return pptxSegments(file.name, entries);
}
