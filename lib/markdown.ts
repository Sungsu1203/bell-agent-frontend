// lib/markdown.ts
// 백엔드 마크다운 본문 파서 — ReportCanvas와 SourcePanel 양쪽에서 공유

export interface FootnoteDef {
  marker: string;     // "1", "2" 등
  url: string;        // 원본 URL (file:// 또는 http(s))
  label: string;      // 끝 괄호 안 라벨 (예: "아이커_운영제안.pptx (4, Index: 4, Chunk 1)")
  fileName: string;   // 파일명만 추출 (예: "아이커_운영제안.pptx")
  chunkInfo: string;  // 인용 위치 정보 (예: "4, Index: 4, Chunk 1")
  isWebUrl: boolean;
  prettyUrl: string;  // file://은 디코딩된 파일명, http(s)는 도메인
  decodedPath: string; // file://에 대해 사람이 읽을 수 있게 디코딩된 전체 경로
}

export type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "ordered-list"; items: string[] }
  | { type: "unordered-list"; items: string[] }
  | { type: "hr" }
  | { type: "table"; headers: string[]; rows: string[][] };

export interface ParsedDocument {
  contentBlocks: Block[];
  footnotes: FootnoteDef[];
}

// ───── 문서 전체 파싱 ─────

export function parseDocument(text: string): ParsedDocument {
  const lines = text.split("\n");

  // 본문/참고문헌 분리: "---" 다음 줄에 "### 참고 문헌" 헤딩이 오면 그 이후를 footnote 영역으로
  let footnoteStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "---") {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next) continue;
        if (
          /^#{2,4}\s*(참고\s*문헌|각주|References|Footnotes|Sources)/.test(next)
        ) {
          footnoteStartIdx = i;
        }
        break;
      }
      if (footnoteStartIdx !== -1) break;
    }
  }

  // 첫 번째 헤딩 (## 1. ...) 은 캔버스 상단에 이미 표시되므로 제외
  let bodyStartIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^##\s+\d+\.\s+/.test(line)) {
      bodyStartIdx = i + 1;
      break;
    }
    break;
  }

  const bodyEnd = footnoteStartIdx === -1 ? lines.length : footnoteStartIdx;
  const bodyLines = lines.slice(bodyStartIdx, bodyEnd);
  const footnoteLines =
    footnoteStartIdx === -1 ? [] : lines.slice(footnoteStartIdx + 1);

  return {
    contentBlocks: parseMarkdownBlocks(bodyLines.join("\n")),
    footnotes: parseFootnotes(footnoteLines.join("\n")),
  };
}

// ───── 본문 블록 파싱 ─────

export function parseMarkdownBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let listBuffer: string[] = [];
  let listType: "ordered" | "unordered" | null = null;

  const flushBuffer = () => {
    if (buffer.length > 0) {
      blocks.push({ type: "paragraph", text: buffer.join(" ") });
      buffer = [];
    }
  };
  const flushList = () => {
    if (listBuffer.length > 0 && listType) {
      blocks.push({
        type: listType === "ordered" ? "ordered-list" : "unordered-list",
        items: listBuffer,
      });
      listBuffer = [];
      listType = null;
    }
  };

  // 표 라인 판별
  const isTableLine = (l: string) =>
    l.trim().startsWith("|") && l.trim().endsWith("|");
  // 표 구분 라인 판별 ( |---|:---:|---:| 같은 형식)
  const isTableDivider = (l: string) =>
    /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(l.trim());
  // 셀 분해
  const cellsOf = (l: string): string[] => {
    const inner = l.trim().replace(/^\|/, "").replace(/\|$/, "");
    return inner.split("|").map((s) => s.trim());
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.replace(/\s+$/, "");

    // ─── 빈 줄 ───
    if (!line.trim()) {
      flushBuffer();
      flushList();
      continue;
    }

    // ─── 구분선 ───
    if (line.trim() === "---" || line.trim() === "***") {
      flushBuffer();
      flushList();
      blocks.push({ type: "hr" });
      continue;
    }

    // ─── 표 (GFM table) ───
    if (isTableLine(line)) {
      flushBuffer();
      flushList();
      // 연속된 표 라인 모두 모음
      const tableLines: string[] = [line];
      let j = i + 1;
      while (j < lines.length && isTableLine(lines[j])) {
        tableLines.push(lines[j].replace(/\s+$/, ""));
        j++;
      }
      // 파싱
      const headers = cellsOf(tableLines[0]);
      let dataStart = 1;
      if (tableLines.length > 1 && isTableDivider(tableLines[1])) {
        dataStart = 2;
      }
      const rows = tableLines.slice(dataStart).map(cellsOf);
      blocks.push({ type: "table", headers, rows });
      // 처리한 줄들 건너뛰기
      i = j - 1;
      continue;
    }

    // ─── 헤딩 ───
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushBuffer();
      flushList();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    // ─── 순서 있는 리스트 (ordered) ───
    const olMatch = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (olMatch) {
      flushBuffer();
      // 핵심 변경: unordered 리스트가 진행 중이어도 flush 하지 않고,
      // 들여쓰기를 보고 판단
      const indent = (line.match(/^(\s*)/)?.[1] ?? "").length;
      if (indent === 0) {
        // 최상위 ordered 리스트: 기존 unordered가 있으면 닫고 새로 시작
        if (listType === "unordered") flushList();
        listType = "ordered";
        listBuffer.push(olMatch[2]);
      } else {
        // 들여쓰기된 ordered: 부모 리스트의 하위 항목으로 취급
        // 단순 처리: 현재 리스트의 마지막 항목에 이어 붙이기
        if (listBuffer.length > 0) {
          listBuffer[listBuffer.length - 1] += "\n  " + olMatch[2];
        } else {
          listType = "ordered";
          listBuffer.push(olMatch[2]);
        }
      }
      continue;
    }

    // ─── 순서 없는 리스트 (unordered) ───
    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (ulMatch) {
      flushBuffer();
      const indent = (line.match(/^(\s*)/)?.[1] ?? "").length;
      if (indent === 0) {
        // 최상위 unordered: 기존 ordered가 있으면 닫고 새로 시작
        if (listType === "ordered") flushList();
        listType = "unordered";
        listBuffer.push(ulMatch[1]);
      } else {
        // 들여쓰기된 unordered: 부모(ordered)의 하위 항목
        // 마지막 항목에 이어 붙이기
        if (listBuffer.length > 0) {
          listBuffer[listBuffer.length - 1] += "\n  • " + ulMatch[1];
        } else {
          listType = "unordered";
          listBuffer.push(ulMatch[1]);
        }
      }
      continue;
    }

    // ─── 일반 단락 ───
    flushList();
    buffer.push(line.trim());
  }
  flushBuffer();
  flushList();
  return blocks;
}

// ───── footnote 파싱 ─────

export function parseFootnotes(text: string): FootnoteDef[] {
  const lines = text.split("\n");
  const result: FootnoteDef[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) continue;

    const m = line.match(/^\[\^([^\]]+)\]:\s*(.+)$/);
    if (!m) continue;

    const marker = m[1];
    const rest = m[2].trim();

    let url = rest;
    let label = "";
    const labelMatch = rest.match(/^(.+?)\s+\((.+)\)\s*$/);
    if (labelMatch) {
      url = labelMatch[1].trim();
      label = labelMatch[2].trim();
    }

    let fileName = "";
    let chunkInfo = "";
    let isWebUrl = false;
    let prettyUrl = url;
    let decodedPath = url;

    if (url.startsWith("file://")) {
      isWebUrl = false;
      // 라벨에서 파일명 추출: "아이커_운영제안.pptx (4, Index: 4, Chunk 1)" → 파일명, 청크 정보
      const labelFileMatch = label.match(/^([^\s(]+\.[a-zA-Z0-9]+)/);
      if (labelFileMatch) {
        fileName = labelFileMatch[1];
        // 청크 정보 = 라벨에서 파일명 이후 부분
        const afterFile = label.slice(labelFileMatch[0].length).trim();
        // 첫 괄호 안 내용 (예: "(4, Index: 4, Chunk 1)" → "4, Index: 4, Chunk 1")
        const chunkMatch = afterFile.match(/^\(([^)]+)\)/);
        if (chunkMatch) {
          chunkInfo = chunkMatch[1];
        }
      } else {
        try {
          const decoded = decodeURIComponent(url);
          const segments = decoded.split(/[\\/]/);
          fileName = segments[segments.length - 1].split("#")[0] || "";
        } catch {
          fileName = "";
        }
      }
      prettyUrl = fileName;

      // 디코딩된 경로 (사람이 읽을 수 있게)
      try {
        decodedPath = decodeURIComponent(url).replace(/^file:\/+/, "");
        // # 이후 fragment 제거 (선택)
        const hashIdx = decodedPath.indexOf("#");
        const cleanPath = hashIdx >= 0 ? decodedPath.slice(0, hashIdx) : decodedPath;
        decodedPath = cleanPath.replace(/\//g, "\\"); // 윈도우 경로 표기로
      } catch {
        decodedPath = url;
      }
    } else {
      isWebUrl = true;
      try {
        const u = new URL(url);
        prettyUrl = u.hostname;
      } catch {
        prettyUrl = url;
      }
      fileName = label || prettyUrl;
      decodedPath = url;
    }

    result.push({
      marker,
      url,
      label,
      fileName,
      chunkInfo,
      isWebUrl,
      prettyUrl,
      decodedPath,
    });
  }

  return result;
}

// ───── 본문에서 쓰는 인용 토큰을 footnote와 매칭 ─────

/**
 * 인용 칩의 source 텍스트(예: "아이커_운영제안.pptx", "foodtoday.or.kr")로
 * 매칭되는 footnote를 찾는다.
 */
export function findMatchingFootnote(
  source: string,
  footnotes: FootnoteDef[]
): FootnoteDef | null {
  // 0) 마커 매칭 (§12-14): [[1]] 칩 → fn.marker === "1"
  // 백엔드 attach_marker_citations 가 본문 [[N]] ↔ footer [^N] 을 1:1 보장하므로
  // 모호성 0. 라벨/파일명 매칭보다 우선.
  for (const fn of footnotes) {
    if (fn.marker === source) {
      return fn;
    }
  }
  // 1) 정확 매칭 (파일명 또는 prettyUrl)
  for (const fn of footnotes) {
    if (fn.fileName === source || fn.prettyUrl === source) {
      return fn;
    }
  }
  // 2) 부분 매칭 (포함 관계)
  for (const fn of footnotes) {
    if (
      fn.fileName.includes(source) ||
      source.includes(fn.fileName) ||
      fn.prettyUrl.includes(source) ||
      source.includes(fn.prettyUrl)
    ) {
      return fn;
    }
  }
  return null;
}
