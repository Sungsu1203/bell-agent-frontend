// components/LogPanel.tsx
// 화면 하단 고정 로그 콘솔.
// - 접기/펼치기 토글
// - 자동 스크롤 (새 로그 오면 아래로 따라감)
// - 로그 비우기 버튼
// - INFO/WARN/ERROR 색상 구분

"use client";

import { useEffect, useRef, useState } from "react";
import { useLogs } from "@/lib/useLogs";
import { useEvents } from "@/lib/useEvents";

// 로그 한 줄을 분석해서 레벨/시간/본문으로 쪼개기
// 예: "2026-04-30 14:23:01 [INFO] outline 생성 시작"
function parseLine(raw: string): {
  level: "INFO" | "WARN" | "ERROR" | "DEBUG" | "OTHER";
  text: string;
} {
  if (/\[ERROR\]/i.test(raw)) return { level: "ERROR", text: raw };
  if (/\[WARN(ING)?\]/i.test(raw)) return { level: "WARN", text: raw };
  if (/\[DEBUG\]/i.test(raw)) return { level: "DEBUG", text: raw };
  if (/\[INFO\]/i.test(raw)) return { level: "INFO", text: raw };
  return { level: "OTHER", text: raw };
}

const LEVEL_COLORS: Record<string, string> = {
  INFO: "var(--text-secondary)",
  WARN: "var(--accent-warning)",
  ERROR: "var(--accent-warning)", // 경고와 같은 톤(테마에 error 변수 없을 수 있어 안전하게)
  DEBUG: "var(--text-muted, #888)",
  OTHER: "var(--text-secondary)",
};

export function LogPanel() {
  const [expanded, setExpanded] = useState(false);
  const { lines, clear } = useLogs(true); // 항상 폴링 ON
  const { latest } = useEvents(true);     // 사용자 관점 진행 이벤트
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // 최신 이벤트의 색상 — done/error 만 강조, 평소엔 secondary
  const phaseDot =
    latest?.kind === "error"
      ? "var(--accent-warning)"
      : latest?.kind === "done"
      ? "var(--accent-success, #2a8)"
      : latest
      ? "var(--accent-info, #4a90e2)"
      : "var(--text-muted, #aaa)";
  const phaseLabel = latest?.label ?? "대기 중";
  const phaseIsLive = latest && latest.kind !== "done" && latest.kind !== "error";

  // 새 로그가 오면 자동으로 맨 아래로 스크롤
  useEffect(() => {
    if (!expanded || !autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, expanded, autoScroll]);

  // 사용자가 위로 스크롤하면 자동 스크롤 잠시 끔, 다시 맨 아래면 켬
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(nearBottom);
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        background: "var(--bg-surface)",
        borderTop: "0.5px solid var(--border-subtle, #ddd)",
        boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
        fontSize: 12,
      }}
    >
      {/* 상단 바 (항상 보임) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
          {expanded ? "▼" : "▲"} 진행 로그
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--text-primary)",
            fontWeight: 500,
          }}
          title={latest?.detail ?? ""}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: phaseDot,
              animation: phaseIsLive
                ? "logpanel-pulse 1.4s ease-in-out infinite"
                : "none",
              flexShrink: 0,
            }}
          />
          {phaseLabel}
        </span>
        <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
          · {lines.length}줄
        </span>
        <div style={{ flex: 1 }} />
        {expanded && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              style={{
                fontSize: 11,
                padding: "3px 10px",
                background: "var(--bg-page)",
                border: "0.5px solid var(--border-subtle, #ccc)",
                borderRadius: 4,
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              비우기
            </button>
            <span
              style={{
                fontSize: 11,
                color: autoScroll
                  ? "var(--accent-success, #2a8)"
                  : "var(--text-muted, #888)",
              }}
            >
              {autoScroll ? "● 자동 스크롤" : "○ 일시정지"}
            </span>
          </>
        )}
      </div>

      <style>{`
        @keyframes logpanel-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.8); }
        }
      `}</style>

      {/* 로그 본문 (펼쳤을 때만 보임) */}
      {expanded && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            height: 240,
            overflowY: "auto",
            padding: "8px 16px 12px",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            background: "var(--bg-page)",
            borderTop: "0.5px solid var(--border-subtle, #eee)",
          }}
        >
          {lines.length === 0 ? (
            <div
              style={{
                color: "var(--text-muted, #999)",
                fontStyle: "italic",
                textAlign: "center",
                padding: "16px 0",
              }}
            >
              아직 로그가 없습니다. 작업이 시작되면 여기에 표시됩니다.
            </div>
          ) : (
            lines.map((l) => {
              const { level, text } = parseLine(l.line);
              return (
                <div
                  key={l.seq}
                  style={{
                    color: LEVEL_COLORS[level],
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    lineHeight: 1.5,
                    padding: "1px 0",
                  }}
                >
                  {text}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}