"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ApiState = {
  doc_mode?: string | null;
  last_saved_path?: string | null;
  refs?: number | null;
  flags?: Record<string, any>;
  updated_at?: string;
  phase?: "running" | "idle";
};


type ApiStateError = { ok: false; error: string };
type ApiStateResp = ApiState | ApiStateError;

type FileItem = {
  id: string;     // sections/<slug>/<file>.md or chapters/<slug>/<file>.md
  name: string;
  mtime?: number;
  size?: number;
};

type FilesResp = {
  ok: boolean;
  mode?: string;
  slug?: string;
  root?: string; // sections|chapters
  files?: FileItem[];
  error?: string;
};

type OutlineResp = {
  ok: boolean;
  items?: string[];
  path?: string;
  source?: string;
  error?: string;
};

type LogsLine = { seq: number; line: string };
type LogsResp = { ok: boolean; next_cursor: number; lines: LogsLine[]; error?: string };

function encodePath(path: string) {
  // 한글 파일명 + path param을 안전하게 전달
  return path.split("/").map(encodeURIComponent).join("/");
}

export default function Home() {
  const API_BASE = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000",
    []
  );

  // ---- UI state
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [state, setState] = useState<ApiState>({});
  const [command, setCommand] = useState<string>("목차 보여줘");
  const [lastMessage, setLastMessage] = useState<string>("");

  // ---- Run 취소/타임아웃 제어
  const runAbortRef = useRef<AbortController | null>(null);
  const runTimeoutRef = useRef<number | null>(null);
  const runAbortReasonRef = useRef<"timeout" | "user" | null>(null);


  // files filter: artifacts(sections/chapters) vs reports
  const [filesKind, setFilesKind] = useState<"artifact" | "reports">("artifact");

  // files: search/sort + auto-switch tab
  const [filesQuery, setFilesQuery] = useState<string>("");
  const [filesSort, setFilesSort] = useState<"mtime_desc" | "name_asc">("mtime_desc");
  const [autoFilesKindFromLastSaved, setAutoFilesKindFromLastSaved] = useState<boolean>(true);

  // preview (md/text)
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [previewText, setPreviewText] = useState<string>("");
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [previewError, setPreviewError] = useState<string>("");
  const previewBoxRef = useRef<HTMLPreElement | null>(null);

  // preview tools: find/copy/auto-preview
  const [findQuery, setFindQuery] = useState<string>("");
  const [findIndex, setFindIndex] = useState<number>(0);
  const [autoPreviewLastSaved, setAutoPreviewLastSaved] = useState<boolean>(true);

  // outline
  const [outline, setOutline] = useState<string[]>([]);
  const [outlinePath, setOutlinePath] = useState<string>("");
  const [outlineSource, setOutlineSource] = useState<string>("");

  // files
  const [filesInfo, setFilesInfo] = useState<FilesResp>({ ok: true, files: [] });

  // logs
  const [logs, setLogs] = useState<string[]>([]);
  const [logCursor, setLogCursor] = useState<number>(0);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const logsRef = useRef<HTMLDivElement | null>(null);
  const logCursorRef = useRef<number>(0);
  const logsInFlightRef = useRef<boolean>(false);

  // files highlight/scroll
  const lastSavedRef = useRef<HTMLLIElement | null>(null);
  const lastSavedIdRef = useRef<string>("");

  // ---- helpers
  function _extractErrorMessage(data: any, fallback: string) {
    // FastAPI: {"detail":[...]} or {"detail":"..."}
    const detail = data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0];
      const msg =
        first?.msg ||
        first?.message ||
        (typeof first === "string" ? first : "");
      if (msg) return String(msg);
    }
    if (typeof data?.error === "string" && data.error.trim()) return data.error.trim();
    if (typeof data?.message === "string" && data.message.trim()) return data.message.trim();
    return fallback;
  }

  async function _parseResponse(res: Response) {
    const text = await res.text();
    const contentType = (res.headers.get("content-type") || "").toLowerCase();

    let data: any = null;
    if (contentType.includes("application/json")) {
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
    } else {
      // JSON이 아니면 텍스트만 보관 (디버깅용)
      data = text;
    }

    return { text, data, contentType };
  }


  async function apiGet<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    const { text, data } = await _parseResponse(res);
    if (!res.ok) {
      const msg = _extractErrorMessage(
        typeof data === "object" && data !== null ? data : null,
        text || `HTTP ${res.status}`
      );
      throw new Error(msg);
    }
    return (typeof data === "string" ? ({} as any) : data) as T;
  }

  async function apiPut<T>(path: string, body: any): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const { text, data } = await _parseResponse(res);
    if (!res.ok) {
      const msg = _extractErrorMessage(
        typeof data === "object" && data !== null ? data : null,
        text || `HTTP ${res.status}`
      );
      throw new Error(msg);
    }
    return (typeof data === "string" ? ({} as any) : data) as T;
  }

  async function apiPost<T>(path: string, body: any, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const { text, data } = await _parseResponse(res);
    if (!res.ok) {
      const msg = _extractErrorMessage(
        typeof data === "object" && data !== null ? data : null,
        text || `HTTP ${res.status}`
      );
      throw new Error(msg);
    }
    return (typeof data === "string" ? ({} as any) : data) as T;
  }

  // ---- file/text fetch helper (for /api/files/{id} preview/download control)
  async function apiGetText(path: string): Promise<string> {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      // 서버가 JSON 에러를 주는 경우도 있어 최대한 메시지 살리기
      try {
        const j = JSON.parse(text);
        const msg =
          j?.error ||
          (typeof j?.detail === "string" ? j.detail : "") ||
          (Array.isArray(j?.detail) && j.detail[0]?.msg ? j.detail[0].msg : "") ||
          text ||
          `HTTP ${res.status}`;
        throw new Error(String(msg));
      } catch {
        throw new Error(text || `HTTP ${res.status}`);
      }
    }
    return text;
  }


  async function refreshState() {
    try {
      const st = await apiGet<ApiStateResp>("/api/state");
      if ((st as any)?.ok === false) {
        const err = (st as ApiStateError).error || "unknown";
        // state는 덮어쓰지 않고 메시지만 표시(초기화 지연/재기동 대응)
        setLastMessage(`state 오류: ${err}`);
        return;
      }
      const s = (st as ApiState) || {};
      setState(s);
      // ✅ 백엔드 phase를 신뢰해서 status를 동기화 (error 상태는 유지)
      if (s.phase === "running") setStatus("running");
      else if (status !== "error") setStatus("idle");
    } catch (e: any) {
      setStatus("error");
      setLastMessage(`state 불러오기 실패: ${String(e?.message || e)}`);
    }
  }

  async function cancelRun() {
    // 1) 프론트 요청 즉시 중단
    runAbortReasonRef.current = "user";
    try { runAbortRef.current?.abort(); } catch {}

    // 2) 백엔드에도 cancel flag set (실패해도 UX에 치명적이지 않게 best-effort)
    try {
      await fetch(`${API_BASE}/api/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      // ignore
    }

    // UI 메시지는 catch에서 AbortError로 잡히며 갱신되지만,
    // 사용자가 즉시 피드백 받도록 한 줄 남겨도 OK(원치 않으면 제거)
    setLastMessage("취소 요청을 전송했습니다(프론트 Abort + 서버 cancel flag).");
  }

  function normalizeLastSavedId(lastSavedPath: string | null | undefined): string {
    // state.last_saved_path(절대경로) → files[].id 형식(sections/<slug>/<file>.md)으로 정규화
    const p = String(lastSavedPath || "").replaceAll("\\", "/").trim();
    if (!p) return "";
    const m = p.match(/\/(sections|chapters|reports)\/(.+?)\/([^\/]+)$/i);
    if (!m) return "";
    const root = m[1];
    const slug = m[2];
    const file = m[3];
    return `${root}/${slug}/${file}`;
  }

  function rootFromFileId(fileId: string): "reports" | "artifact" | "" {
    const root = String(fileId || "").split("/", 1)[0];
    if (root === "reports") return "reports";
    if (root === "sections" || root === "chapters") return "artifact";
    return "";
  }

  async function loadOutline() {
    const r = await apiGet<OutlineResp>("/api/outline");
    if (!r.ok) {
      setLastMessage(`outline 불러오기 실패: ${r.error || "unknown"}`);
      return;
    }
    setOutline(r.items || []);
    setOutlinePath(r.path || "");
    setOutlineSource(r.source || "");
    setLastMessage(`목차 로드 OK (${(r.items || []).length}줄)`);
  }

  async function saveOutline() {
    const r = await apiPut<{ ok: boolean; path?: string; count?: number; error?: string }>(
      "/api/outline",
      { items: outline }
    );
    if (!r.ok) {
      setLastMessage(`outline 저장 실패: ${r.error || "unknown"}`);
      return;
    }
    setLastMessage(`목차 저장 OK (${r.count}줄) → ${r.path}`);
    await refreshState();
  }

  async function loadFiles(kind: "artifact" | "reports" = filesKind) {
    const q = kind === "reports" ? "reports" : "artifact";
    const r = await apiGet<FilesResp>(`/api/files?kind=${encodeURIComponent(q)}`);
    setFilesInfo(r);
  }

  function scrollToLastSaved() {
    // 새로 저장된 파일로 부드럽게 스크롤(동일 항목 반복 스크롤 방지)
    const id = lastSavedId;
    if (!id) return;
    if (lastSavedIdRef.current === id) return;
    const el = lastSavedRef.current;
    if (!el) return;
    lastSavedIdRef.current = id;
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      // 일부 브라우저/환경 폴백
      el.scrollIntoView();
    }
  }

  async function runCommand(text: string) {
    // ✅ 실행 중 중복 요청 방지 (백엔드에서도 lock이 있지만 UX 위해 프론트에서 선차단)
    if (status === "running") return;
    const input = (text || "").trim();
    if (!input) return;

    setStatus("running");
    setLastMessage("");

    try {
      // 이전 실행 흔적 정리(중복 실행/유령 타임아웃 방지)
      if (runTimeoutRef.current) {
        clearTimeout(runTimeoutRef.current);
        runTimeoutRef.current = null;
      }
      if (runAbortRef.current) {
        try { runAbortRef.current.abort(); } catch {}
        runAbortRef.current = null;
      }
      runAbortReasonRef.current = null;

      // ✅ controller를 ref에 저장해서 Cancel 버튼에서 abort 가능
      const controller = new AbortController();
      runAbortRef.current = controller;

      // ✅ 10분 타임아웃: abort reason을 timeout으로 마킹
      const t = window.setTimeout(() => {
        runAbortReasonRef.current = "timeout";
        try { controller.abort(); } catch {}
      }, 10 * 60 * 1000);
      runTimeoutRef.current = t;

      const res = await fetch(`${API_BASE}/api/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });

      clearTimeout(t);
      runTimeoutRef.current = null;

      const textBody = await res.text();
      let r: any = null;
      try {
        r = textBody ? JSON.parse(textBody) : null;
      } catch {
        r = null;
      }

      if (!res.ok) {
        const msg =
          r?.error ||
          (typeof r?.detail === "string" ? r.detail : "") ||
          (Array.isArray(r?.detail) && r.detail[0]?.msg ? r.detail[0].msg : "") ||
          textBody ||
          `HTTP ${res.status}`;
        throw new Error(String(msg));
      }

      if (!r || r.ok === false) {
        setStatus("error");
        setLastMessage(`실행 실패: ${(r && (r.error || r.message)) || "unknown"}`);
        return;
      }

      if (!r.ok) {
        setStatus("error");
        setLastMessage(`실행 실패: ${r.error || "unknown"}`);
        return;
      }
      setLastMessage(r.message || "OK");
      // ✅ 성공 후에는 refreshState()에서 phase 기준으로 idle/running을 정렬하되,
      // 여기서는 낙관적으로 idle로 복귀
      setStatus("idle");

      // 실행 후 화면 갱신(상태/파일/로그)
      await refreshState();
      await loadFiles();
    } catch (e: any) {
      const msg = String(e?.message || e);
      // AbortController로 끊긴 경우: 프론트만 중단, 서버는 계속 실행 중일 수 있음
      if (msg.includes("aborted") || msg.includes("AbortError")) {
        setStatus("error");
        if (runAbortReasonRef.current === "user") {
          setLastMessage(
            `사용자가 실행을 취소했습니다(프론트 Abort). 서버 작업은 계속 진행 중일 수 있으니 로그/상태를 확인하세요.`
          );
        } else {
          setLastMessage(
            `실행 시간이 길어 요청을 중단했습니다(10분 타임아웃). 서버 작업은 계속 진행 중일 수 있으니 로그/상태를 확인하세요.`
          );
        }
      } else {
        setStatus("error");
        setLastMessage(`실행 오류: ${msg}`);
      }
      // timeout/에러 후에도 상태/로그/파일은 최신으로 갱신 시도
      try { await refreshState(); } catch { }
      try { await loadFiles(); } catch { }
    } finally {
      // 마지막 정리(남은 타임아웃/컨트롤러 제거)
      if (runTimeoutRef.current) {
        clearTimeout(runTimeoutRef.current);
        runTimeoutRef.current = null;
      }
      runAbortRef.current = null;
      runAbortReasonRef.current = null;
    }
  }

  // function cancelRun() {
  //   if (!runAbortRef.current) return;
  //   runAbortReasonRef.current = "user";
  //   try { runAbortRef.current.abort(); } catch {}
  // }

  async function previewFile(f: FileItem) {
    setSelectedFile(f);
    setPreviewStatus("loading");
    setPreviewError("");
    setPreviewText("");
    try {
      const text = await apiGetText(`/api/files/${encodePath(f.id)}`);
      setPreviewText(text);
      setPreviewStatus("idle");
    } catch (e: any) {
      setPreviewStatus("error");
      setPreviewError(String(e?.message || e));
    }
  }

  async function downloadFileControlled(f: FileItem) {
    // fetch로 제어(권한/404 등 UI 처리 가능)
    setLastMessage("");
    try {
      const text = await apiGetText(`/api/files/${encodePath(f.id)}`);
      const blob = new Blob([text], { type: "text/markdown; charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name || "artifact.md";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setLastMessage(`다운로드 OK: ${f.name}`);
    } catch (e: any) {
      setLastMessage(`다운로드 실패: ${String(e?.message || e)}`);
    }
  }


  // ---- 5 buttons actions
  const actions = {
    run: () => runCommand(command),
    ragUpdate: () => runCommand("최신 자료로 RAG 업데이트"),
    outlineLoad: () => loadOutline(),
    outlineSave: () => saveOutline(),
    refresh: async () => {
      await refreshState();
      await loadFiles(filesKind);
    },
  };

  // ---- logs polling
  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        if (logsInFlightRef.current) return;
        logsInFlightRef.current = true;

        const cursor = logCursorRef.current || 0;
        const r = await apiGet<LogsResp>(`/api/logs?cursor=${cursor}&limit=200`);
        if (!alive) return;
        if (r.ok && r.lines?.length) {
          const newLines = r.lines.map((x) => x.line);
          setLogs((prev) => {
            const merged = [...prev, ...newLines];
            // 너무 길어지면 잘라내기
            return merged.slice(-2000);
          });
          setLogCursor(r.next_cursor);
          logCursorRef.current = r.next_cursor;
        }
      } catch {
        // 로그 폴링 실패는 치명적이지 않게 무시(상태로만 간접 확인 가능)
      } finally {
        logsInFlightRef.current = false;
      }
    }

    const t = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // logCursor는 poll에서 갱신되지만, setInterval 방식이므로 의존성으로 넣지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE]);

  // logCursor state를 ref와 동기화 (수동 reset/초기화에도 안전)
  useEffect(() => {
    logCursorRef.current = logCursor || 0;
  }, [logCursor]);

  // autoscroll logs
  useEffect(() => {
    if (!autoScroll) return;
    const el = logsRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs, autoScroll]);

  // initial load
  useEffect(() => {
    actions.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- state polling
  // - idle  : 2s
  // - running: 700ms (진행 상태/완료 감지 부드럽게)
  useEffect(() => {
    let alive = true;

    async function tick() {
      if (!alive) return;
      await refreshState();
    }

    // 즉시 1회
    tick();

    const intervalMs = state?.phase === "running" ? 700 : 2000;
    const t = setInterval(tick, intervalMs);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [state?.phase]); // phase 변화 시 주기 재설정


  // ---- UI helpers
  const mode = (filesInfo.mode || state?.doc_mode || "report") as string;
  const slug = (filesInfo.slug || (state?.flags?.topic_slug as string) || "") as string;
  const lastSavedId = useMemo(
    () => normalizeLastSavedId(state?.last_saved_path),
    [state?.last_saved_path]
  );


  // ✅ files filter/search/sort 적용된 "표시용 리스트"
  const displayedFiles = useMemo(() => {
    const list = (filesInfo.files || []) as FileItem[];
    const q = (filesQuery || "").trim().toLowerCase();

    let out = list;
    if (q) {
      out = out.filter((f) => {
        const name = String(f.name || "").toLowerCase();
        const id = String(f.id || "").toLowerCase();
        return name.includes(q) || id.includes(q);
      });
    }

    const sorted = [...out];
    if (filesSort === "name_asc") {
      sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
    } else {
      // default: 최신순(없으면 0)
      sorted.sort((a, b) => (Number(b.mtime || 0) - Number(a.mtime || 0)));
    }
    return sorted;
  }, [filesInfo.files, filesQuery, filesSort]);

  // Find matches (simple)
  const findMatches = useMemo(() => {
    const q = (findQuery || "").trim();
    if (!q) return [];
    const text = previewText || "";
    const out: number[] = [];
    let idx = 0;
    const qLower = q.toLowerCase();
    const tLower = text.toLowerCase();
    while (true) {
      const at = tLower.indexOf(qLower, idx);
      if (at === -1) break;
      out.push(at);
      idx = at + Math.max(1, q.length);
      if (out.length > 2000) break; // safety cap
    }
    return out;
  }, [findQuery, previewText]);


  // progress 표시(7/6 같은 초과 케이스를 UI에서 자연스럽게 보정)
  const progressText = useMemo(() => {
    const f: any = state?.flags || {};
    const doneRaw = (mode === "book") ? f.chapters_done : f.sections_done;
    const totalRaw = (mode === "book") ? f.chapters_total : f.sections_total;
    const done = Number.isFinite(Number(doneRaw)) ? Number(doneRaw) : 0;
    const total = Number.isFinite(Number(totalRaw)) ? Number(totalRaw) : 0;
    if (!total) return "";
    if (done <= total) return `${done} / ${total}`;
    const extra = done - total;
    return `${total} / ${total} (+${extra})`;
  }, [state?.flags, mode]);

// filesInfo/state 갱신 후, 마지막 저장 파일이 목록에 있으면 자동 스크롤
useEffect(() => {
  if (!lastSavedId) return;
  const t = setTimeout(() => scrollToLastSaved(), 50);
  return () => clearTimeout(t);
}, [lastSavedId]);

// filesKind 변경 시 목록 다시 로드
useEffect(() => {
  loadFiles(filesKind);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [filesKind]);

// ✅ last_saved_path의 root가 reports면 자동으로 reports 탭으로 전환 (옵션)
useEffect(() => {
  if (!autoFilesKindFromLastSaved) return;
  if (!lastSavedId) return;
  const desired = rootFromFileId(lastSavedId);
  if (!desired) return;
  if (desired === filesKind) return;
  setFilesKind(desired);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [autoFilesKindFromLastSaved, lastSavedId]);


// 마지막 저장 파일 자동 미리보기
useEffect(() => {
  if (!autoPreviewLastSaved) return;
  if (!lastSavedId) return;

  const list = filesInfo.files || [];
  const f = list.find((x) => x.id === lastSavedId);
  if (!f) return;

  // 이미 같은 파일 미리보는 중이면 스킵
  if (selectedFile?.id === f.id) return;

  previewFile(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [autoPreviewLastSaved, lastSavedId, filesInfo.files, selectedFile?.id]);

// ✅ Find "active match"로 자동 스크롤 (별도 useEffect로 분리!)
useEffect(() => {
  const q = (findQuery || "").trim();
  if (!q) return;
  if (!findMatches.length) return;

  const box = previewBoxRef.current;
  if (!box) return;

  const raf = requestAnimationFrame(() => {
    const el = box.querySelector('[data-active="1"]') as HTMLElement | null;
    if (!el) return;
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      el.scrollIntoView();
    }
  });

  return () => cancelAnimationFrame(raf);
}, [findQuery, findIndex, findMatches.length, selectedFile?.id, previewText]);


    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-900">
        {/* TOP */}
        <header className="sticky top-0 z-10 border-b bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div className="flex flex-col">
              <div className="text-lg font-semibold">Bell Agent UI</div>
              <div className="text-xs text-zinc-600">
                API: {API_BASE} · mode: <span className="font-mono">{mode}</span>
                {filesInfo.root ? ` · root: ${filesInfo.root}` : ""}
                {filesInfo.slug ? ` · slug: ${filesInfo.slug}` : ""}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${status === "running"
                    ? "bg-amber-100 text-amber-800"
                    : status === "error"
                      ? "bg-red-100 text-red-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
              >
                {status.toUpperCase()}
              </span>
              <button
                onClick={actions.refresh}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50"
              >
                새로고침
              </button>
            </div>
          </div>
        </header>

        {/* MIDDLE */}
        <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-4 md:grid-cols-12">
          {/* Left */}
          <section className="md:col-span-3 rounded-xl border bg-white p-4">
            <div className="mb-3 text-sm font-semibold">빠른 실행</div>

            <div className="flex flex-col gap-2">
              <button
                onClick={actions.ragUpdate}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
              >
                최신자료 RAG 업데이트
              </button>

              <button
                onClick={actions.outlineLoad}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50"
              >
                목차 불러오기
              </button>

              <button
                onClick={actions.outlineSave}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50"
              >
                목차 저장
              </button>
            </div>

            <hr className="my-4" />

            <div className="text-xs text-zinc-600 space-y-1">
              <div>
                progress: <span className="font-mono">{progressText || "-"}</span>
              </div>
              <div>
                last_saved_path:{" "}
                <span className="break-all font-mono">{state?.last_saved_path || "-"}</span>
              </div>
              <div>outline: <span className="font-mono">{outlineSource || "-"}</span></div>
              <div>outline_path: <span className="break-all font-mono">{outlinePath || "-"}</span></div>
            </div>
          </section>

          {/* Center */}
          <section className="md:col-span-6 rounded-xl border bg-white p-4">
            <div className="mb-3 text-sm font-semibold">명령 실행</div>

            <div className="flex gap-2">
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") actions.run(); }}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="예: 목차 생성 / 최신 자료로 RAG 업데이트 / write: 서론"
              />
              <button
                onClick={actions.run}
                disabled={status === "running"}
                className={`rounded-lg px-4 py-2 text-sm text-white ${status === "running" ? "bg-blue-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500"
                  }`}
              >
                {status === "running" ? "Running..." : "Run"}
              </button>
              <button
                onClick={cancelRun}
                disabled={status !== "running"}
                className={`rounded-lg px-4 py-2 text-sm text-white ${
                  status !== "running" ? "bg-zinc-300 cursor-not-allowed" : "bg-zinc-900 hover:bg-zinc-800"
                }`}
                title="현재 실행을 취소합니다(프론트 Abort + 백엔드 cancel flag)"
              >
                Cancel
              </button>
              <button
                onClick={cancelRun}
                disabled={status !== "running"}
                className={`rounded-lg px-4 py-2 text-sm text-white ${
                  status !== "running" ? "bg-zinc-300 cursor-not-allowed" : "bg-zinc-900 hover:bg-zinc-800"
                }`}
                title="현재 실행 요청을 취소합니다(프론트 Abort)"
              >
                Cancel
              </button>
            </div>

            <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm">
              <div className="mb-1 text-xs font-semibold text-zinc-600">마지막 응답</div>
              <pre className="whitespace-pre-wrap break-words">{lastMessage || "—"}</pre>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-zinc-600">산출물(중요): {filesInfo.root || "-"}</div>

              {/* Files filter tabs */}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="inline-flex rounded-lg border bg-white p-1">
                  <button
                    onClick={() => setFilesKind("artifact")}
                    className={`rounded-md px-3 py-1 text-xs ${filesKind === "artifact" ? "bg-zinc-900 text-white" : "hover:bg-zinc-50"
                      }`}
                    title="sections/chapters 목록"
                  >
                    sections
                  </button>
                  <button
                    onClick={() => setFilesKind("reports")}
                    className={`rounded-md px-3 py-1 text-xs ${filesKind === "reports" ? "bg-zinc-900 text-white" : "hover:bg-zinc-50"
                      }`}
                    title="reports 스냅샷 목록"
                  >
                    reports
                  </button>
                </div>

              <div className="flex flex-col items-end gap-1">
                <label className="flex items-center gap-2 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={autoFilesKindFromLastSaved}
                    onChange={(e) => setAutoFilesKindFromLastSaved(e.target.checked)}
                  />
                  마지막 저장 탭 자동 전환
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={autoPreviewLastSaved}
                    onChange={(e) => setAutoPreviewLastSaved(e.target.checked)}
                  />
                  마지막 저장 자동 미리보기
                </label>
              </div>
              </div>

            {/* Search + Sort */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                value={filesQuery}
                onChange={(e) => setFilesQuery(e.target.value)}
                className="w-full md:w-auto flex-1 rounded-md border px-2 py-1 text-xs"
                placeholder="파일 검색 (이름/경로)"
              />
              <button
                onClick={() => setFilesSort((prev) => (prev === "mtime_desc" ? "name_asc" : "mtime_desc"))}
                className="rounded-md border px-2 py-1 text-xs hover:bg-white"
                title="정렬 토글"
              >
                {filesSort === "mtime_desc" ? "최신순" : "이름순"}
              </button>
              {filesQuery.trim() ? (
                <button
                  onClick={() => setFilesQuery("")}
                  className="rounded-md border px-2 py-1 text-xs hover:bg-white"
                  title="검색어 지우기"
                >
                  지우기
                </button>
              ) : null}
              <div className="ml-auto text-xs text-zinc-500 font-mono">
                {displayedFiles.length} / {(filesInfo.files || []).length}
              </div>
            </div>

              <div className="max-h-56 overflow-auto rounded-lg border">
              {displayedFiles.length === 0 ? (
                  <div className="p-3 text-sm text-zinc-500">파일이 없습니다.</div>
                ) : (
                  <ul className="divide-y">
                  {displayedFiles.map((f) => {
                      const isLast = !!lastSavedId && f.id === lastSavedId;
                      return (
                        <li
                          key={f.id}
                          ref={isLast ? lastSavedRef : null}
                          className={`flex items-center justify-between p-3 text-sm ${isLast ? "bg-amber-50" : ""
                            }`}
                          title={isLast ? "마지막 저장 파일" : undefined}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{f.name}</div>
                            <div className="text-xs text-zinc-500 font-mono truncate">{f.id}</div>
                          </div>
                          <div className="shrink-0 flex gap-2">
                            <button
                              onClick={() => previewFile(f)}
                              className="rounded-md border px-3 py-1 text-xs hover:bg-zinc-50"
                            >
                              미리보기
                            </button>
                            <button
                              onClick={() => downloadFileControlled(f)}
                              className="rounded-md border px-3 py-1 text-xs hover:bg-zinc-50"
                            >
                              다운로드
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {lastSavedId ? (
                <div className="mt-2 text-xs text-zinc-600">
                  마지막 저장 파일: <span className="font-mono">{lastSavedId}</span>
                </div>
              ) : null}
            </div>

            {/* Preview */}
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-zinc-600">미리보기</div>
              <div className="rounded-lg border bg-zinc-50 p-3 text-sm">
                {!selectedFile ? (
                  <div className="text-zinc-500">파일에서 “미리보기”를 눌러 내용을 확인하세요.</div>
                ) : (
                  <>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{selectedFile.name}</div>
                        <div className="truncate text-xs font-mono text-zinc-500">{selectedFile.id}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(previewText || "");
                              setLastMessage("미리보기 내용 복사 완료");
                            } catch (e: any) {
                              setLastMessage(`복사 실패: ${String(e?.message || e)}`);
                            }
                          }}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-white"
                          title="클립보드로 복사"
                        >
                          복사
                        </button>
                        <button
                          onClick={() => { setSelectedFile(null); setPreviewText(""); setPreviewError(""); setPreviewStatus("idle"); setFindQuery(""); setFindIndex(0); }}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-white"
                        >
                          닫기
                        </button>
                      </div>
                    </div>

                    {/* Find toolbar */}
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <input
                        value={findQuery}
                        onChange={(e) => { setFindQuery(e.target.value); setFindIndex(0); }}
                        className="w-full md:w-auto flex-1 rounded-md border px-2 py-1 text-xs"
                        placeholder="Find… (미리보기에서 검색)"
                      />
                      <div className="text-xs text-zinc-600 font-mono">
                        {findQuery.trim() ? `${Math.min(findIndex + 1, Math.max(1, findMatches.length))} / ${findMatches.length}` : "-"}
                      </div>
                      <button
                        onClick={() => {
                          if (!findMatches.length) return;
                          setFindIndex((prev) => (prev - 1 + findMatches.length) % findMatches.length);
                        }}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-white"
                        title="이전"
                      >
                        ◀
                      </button>
                      <button
                        onClick={() => {
                          if (!findMatches.length) return;
                          setFindIndex((prev) => (prev + 1) % findMatches.length);
                        }}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-white"
                        title="다음"
                      >
                        ▶
                      </button>
                    </div>

                    {previewStatus === "loading" ? (
                      <div className="text-zinc-500">불러오는 중…</div>
                    ) : previewStatus === "error" ? (
                      <div className="whitespace-pre-wrap text-red-700">미리보기 실패: {previewError}</div>
                    ) : (
                      <pre
                        ref={previewBoxRef}
                        className="max-h-72 overflow-auto whitespace-pre-wrap break-words"
                      >
                        {(() => {
                          const q = (findQuery || "").trim();
                          const text = previewText || "";
                          if (!q) return text || "—";

                          // simple highlight: wrap matches with <mark>
                          const qLower = q.toLowerCase();
                          const tLower = text.toLowerCase();
                          const parts: any[] = [];
                          let i = 0;
                          let matchNo = 0;
                          while (true) {
                            const at = tLower.indexOf(qLower, i);
                            if (at === -1) break;
                            if (at > i) parts.push(text.slice(i, at));
                            const hit = text.slice(at, at + q.length);
                            const isActive = (matchNo === findIndex);
                            parts.push(
                              <mark
                                key={`${at}-${matchNo}`}
                                data-active={isActive ? "1" : "0"}
                                className={isActive ? "bg-amber-300" : "bg-amber-100"}
                                style={{ scrollMarginTop: 12, scrollMarginBottom: 12 }}
                              >
                                {hit}
                              </mark>
                            );
                            matchNo += 1;
                            i = at + Math.max(1, q.length);
                            if (matchNo > 2000) break;
                          }
                          parts.push(text.slice(i));
                          return parts.length ? parts : (text || "—");
                        })()}
                      </pre>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Right */}
          <section className="md:col-span-3 rounded-xl border bg-white p-4">
            <div className="mb-3 text-sm font-semibold">목차 편집</div>

            <div className="mb-2 text-xs text-zinc-600">
              (GET/PUT: /api/outline) — 각 줄을 편집하고 저장하세요.
            </div>

            <div className="max-h-[520px] overflow-auto rounded-lg border">
              {outline.length === 0 ? (
                <div className="p-3 text-sm text-zinc-500">목차가 비어 있습니다. “목차 불러오기”를 눌러주세요.</div>
              ) : (
                <ul className="divide-y">
                  {outline.map((line, idx) => (
                    <li key={idx} className="p-2">
                      <input
                        value={line}
                        onChange={(e) => {
                          const v = e.target.value;
                          setOutline((prev) => {
                            const next = [...prev];
                            next[idx] = v;
                            return next;
                          });
                        }}
                        className="w-full rounded-md border px-2 py-1 text-sm"
                      />
                      <div className="mt-1 flex gap-2">
                        <button
                          onClick={() => runCommand(`write: ${line}`)}
                          className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-white hover:bg-zinc-800"
                        >
                          write
                        </button>
                        <button
                          onClick={() => {
                            setOutline((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-zinc-50"
                        >
                          삭제
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              onClick={() => setOutline((prev) => [...prev, ""])}
              className="mt-3 w-full rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50"
            >
              줄 추가
            </button>
          </section>
        </main>

        {/* BOTTOM */}
        <footer className="mx-auto max-w-6xl px-4 pb-6">
          <div className="rounded-xl border bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">로그</div>
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                />
                자동 스크롤
              </label>
            </div>
            <div
              ref={logsRef}
              className="h-56 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-100"
            >
              {logs.length === 0 ? (
                <div className="text-zinc-400">로그가 아직 없습니다. 실행 후 2초마다 갱신됩니다.</div>
              ) : (
                logs.map((ln, i) => <div key={i}>{ln}</div>)
              )}
            </div>
          </div>
        </footer>
      </div>
    );
  }