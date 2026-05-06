// lib/api.ts
// 백엔드(FastAPI) 호출 함수 모음

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

// ───── 백엔드 응답 타입 정의 ─────

export interface StateResponse {
  ok: boolean;
  doc_mode: "report" | "book";
  namespace: string | null;
  pending: number;
  refs: number;
  last_saved_path: string | null;
  outline: unknown;
  flags: {
    topic_title: string;
    pending_write_title: boolean;
    requested_write_title: string;
    suppress_vector_qa: boolean;
    sections_done: number;
    sections_total: number;
    sections_seen: string;
    chapters_done: number;
    chapters_total: number;
    chapters_seen: string;
    dash_last_ts: string;
    dash_count: number;
    skip_web_search: boolean;
    debug: boolean;
    iteration_count: number;
  };
  objectives?: string[];
  phase: "idle" | "running" | "writing" | string;
  cancel_requested: boolean;
  iteration_count: number;
  updated_at: string;
}

export interface OutlineResponse {
  ok: boolean;
  items: string[];
  path: string;
  source: "topic" | "default" | "empty";
}

export interface FileMeta {
  id: string;
  name: string;
  path: string;
  mtime: number;
  size: number;
}

export interface FilesResponse {
  ok: boolean;
  mode: string;
  slug: string;
  root: "sections" | "chapters";
  files: FileMeta[];
}

export interface RunPayload {
  input: string;
  options?: Record<string, unknown>;
}

export interface RunResponse {
  ok: boolean;
  message?: string;
  error?: string;
  last_saved_path?: string | null;
  [key: string]: unknown;
}

// ───── HTTP 헬퍼 ─────

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status} ${res.statusText}`;
    try {
      const body = await res.text();
      if (body) message += ` — ${body}`;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ───── 엔드포인트 함수들 ─────

export async function fetchHealth(): Promise<{ ok: boolean }> {
  return http("/api/health");
}

export async function fetchState(): Promise<StateResponse> {
  return http("/api/state");
}

export async function fetchOutline(): Promise<OutlineResponse> {
  return http("/api/outline");
}

export async function saveOutline(items: string[]): Promise<{ ok: boolean }> {
  return http("/api/outline", {
    method: "PUT",
    body: JSON.stringify({ items }),
  });
}

export async function runCommand(payload: RunPayload): Promise<RunResponse> {
  return http("/api/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelRun(): Promise<{ ok: boolean }> {
  return http("/api/cancel", { method: "POST" });
}

export async function fetchFiles(
  kind: "artifact" | "report" | "reportlog" = "artifact",
  limit = 200
): Promise<FilesResponse> {
  return http(`/api/files?kind=${kind}&limit=${limit}`);
}

export async function fetchFileContent(fileId: string): Promise<string> {
  // §12-14: cache: 'no-store' 로 브라우저 캐시 우회.
  // 동일 fileId 의 파일이 백엔드에서 갱신돼도 캐시된 응답이 재사용되던 문제 차단.
  const url = `${API_BASE}/api/files/${encodeURIComponent(fileId)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      return String(parsed.content);
    }
    if (parsed && typeof parsed === "object" && "text" in parsed) {
      return String(parsed.text);
    }
    if (parsed && typeof parsed === "object" && "ok" in parsed) {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    /* not JSON */
  }
  return text;
}

export interface SectionRefEntry {
  marker: string;
  url: string;
  label: string;
  text: string;
  source?: string;
  title?: string;
  // §12-22: 백엔드 백그라운드 daemon 이 점진 추가. 섹션 작성 직후엔 부재 → 폴링으로 자연 채워짐.
  summary?: string;
}

export interface SectionRefsResponse {
  ok: boolean;
  id: string;
  refs: Record<string, SectionRefEntry>;
}

export async function fetchSectionRefs(fileId: string): Promise<Record<string, SectionRefEntry>> {
  // §12-16: 섹션 .md 옆 .refs.json 사이드카 조회. 파일 없으면 백엔드가 빈 맵 반환 (404 대신).
  const url = `${API_BASE}/api/section-refs/${encodeURIComponent(fileId)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as SectionRefsResponse;
  return data.refs ?? {};
}

export interface LogsResponse {
  ok: boolean;
  next_cursor: number;
  lines: { seq: number; line: string }[];
}

export async function fetchLogs(
  cursor = 0,
  limit = 200
): Promise<LogsResponse> {
  return http(`/api/logs?cursor=${cursor}&limit=${limit}`);
}

// ───── 사용자 관점 진행 이벤트 ─────

export interface EventItem {
  seq: number;
  ts: number;
  label: string;
  kind: "phase" | "start" | "done" | "error" | string;
  detail: string | null;
}

export interface EventsResponse {
  ok: boolean;
  next_cursor: number;
  events: EventItem[];
}

export async function fetchEvents(
  cursor = 0,
  limit = 200
): Promise<EventsResponse> {
  return http(`/api/events?cursor=${cursor}&limit=${limit}`);
}

// ───── Export (Word 다운로드) ─────

export interface ExportPayload {
  kind: "section" | "report";
  section_id?: number;
  format: "docx";
}

/**
 * Word(.docx) 다운로드.
 * 백엔드에서 docx 바이너리를 받아 브라우저 다운로드 트리거.
 *
 * 사용:
 *   await downloadExport({ kind: "section", section_id: 1, format: "docx" });
 *   await downloadExport({ kind: "report", format: "docx" });
 */
export async function downloadExport(payload: ExportPayload): Promise<void> {
  const url = `${API_BASE}/api/export`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = `HTTP ${res.status} ${res.statusText}`;
    try {
      const body = await res.text();
      if (body) message += ` — ${body}`;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

// Content-Disposition 헤더에서 파일명 추출
  // RFC 5987 호환: filename*=UTF-8''<인코딩된이름> 우선, 없으면 filename="..."
  const cd = res.headers.get("content-disposition") ?? "";

  let filename = payload.kind === "section"
    ? `section-${payload.section_id ?? ""}.docx`
    : "report.docx";

  // 1) filename*=UTF-8''... (한글 파일명용, 최신 표준) — 우선 시도
  const utf8Match = cd.match(/filename\*=UTF-8''([^;\n]+)/i);
  if (utf8Match) {
    try {
      filename = decodeURIComponent(utf8Match[1].trim());
    } catch {
      // 디코딩 실패 시 그대로
      filename = utf8Match[1].trim();
    }
  } else {
    // 2) filename="..." (ASCII fallback)
    const asciiMatch = cd.match(/filename="?([^";\n]+)"?/i);
    if (asciiMatch) {
      filename = asciiMatch[1].trim();
    }
  }

  // Blob → 다운로드 트리거
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 메모리 해제 (조금 늦게)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
