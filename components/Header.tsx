// components/Header.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Project } from "@/lib/data";
import { downloadExport } from "@/lib/api";

interface HeaderProps {
  project: Project;
  status: "idle" | "writing" | "error";
}

const statusConfig = {
  idle: {
    label: "준비됨",
    bg: "var(--bg-muted)",
    text: "var(--text-secondary)",
    dot: "var(--text-tertiary)",
  },
  writing: {
    label: "집필 중",
    bg: "var(--accent-info-bg)",
    text: "var(--accent-info)",
    dot: "var(--accent-info)",
  },
  error: {
    label: "오류",
    bg: "var(--accent-warning-bg)",
    text: "var(--accent-warning)",
    dot: "var(--accent-warning)",
  },
};

// §13-12-4: Word/PPT 두 다운로드 버튼 공통 스타일. busy=true 일 때 cursor·opacity 변화.
function downloadButtonStyle(busy: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    padding: "5px 14px",
    background: "var(--bg-surface)",
    border: "0.5px solid var(--border-default)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)",
    fontWeight: 500,
    cursor: busy ? "wait" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    opacity: busy ? 0.6 : 1,
  };
}

export function Header({ project, status }: HeaderProps) {
  const cfg = statusConfig[status];
  // §13-12-4: docx / pptx 둘 다 active 한 format 추적. 동시 다운로드 막음 (events 채널 충돌 회피).
  const [downloadingFormat, setDownloadingFormat] = useState<"docx" | "pptx" | null>(null);

  const handleDownload = async (format: "docx" | "pptx") => {
    if (downloadingFormat) return;
    setDownloadingFormat(format);
    try {
      await downloadExport({ kind: "report", format });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const label = format === "pptx" ? "PowerPoint" : "Word";
      alert(`${label} 다운로드 실패: ${msg}`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <header
      className="app-header"
      style={{
        background: "var(--bg-surface)",
        border: "0.5px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--accent-info-bg)",
            color: "var(--accent-info)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          B
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>Bell Agent</span>
          <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>·</span>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {project.title}
            {project.period && ` (${project.period})`}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* 전체 보고서 다운로드 — Word / PowerPoint 짝 (§13-12-4) */}
        <button
          onClick={() => handleDownload("docx")}
          disabled={!!downloadingFormat}
          style={downloadButtonStyle(!!downloadingFormat)}
          title="전체 보고서를 Word(.docx)로 다운로드. 섹션별 PDF는 본문 상단 [PDF] 버튼을 사용하세요."
        >
          {downloadingFormat === "docx" ? (
            "Word 생성 중…"
          ) : (
            <>
              <span style={{ fontSize: 11 }}>📄</span>
              전체 보고서 (Word)
            </>
          )}
        </button>
        <button
          onClick={() => handleDownload("pptx")}
          disabled={!!downloadingFormat}
          style={downloadButtonStyle(!!downloadingFormat)}
          title="전체 보고서를 PowerPoint(.pptx)로 다운로드. 약 30초 소요 — 좌측 LogPanel 헤더에서 진행 상황 확인."
        >
          {downloadingFormat === "pptx" ? (
            "PPT 생성 중…"
          ) : (
            <>
              <span style={{ fontSize: 11 }}>📊</span>
              전체 보고서 (PPT)
            </>
          )}
        </button>

        {/* 상태 배지 */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: "var(--radius-md)",
            background: cfg.bg,
            color: cfg.text,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: cfg.dot,
            }}
          />
          {cfg.label}
        </span>
        <button
          aria-label="설정"
          style={{
            width: 28,
            height: 28,
            border: "0.5px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            background: "transparent",
            color: "var(--text-secondary)",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
