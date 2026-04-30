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

export function Header({ project, status }: HeaderProps) {
  const cfg = statusConfig[status];
  const [downloading, setDownloading] = useState(false);

  const handleDownloadAllWord = async () => {
    setDownloading(true);
    try {
      await downloadExport({ kind: "report", format: "docx" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`전체 보고서 다운로드 실패: ${msg}`);
    } finally {
      setDownloading(false);
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
        {/* 전체 보고서 Word 다운로드 (단일 액션) */}
        <button
          onClick={handleDownloadAllWord}
          disabled={downloading}
          style={{
            fontSize: 12,
            padding: "5px 14px",
            background: "var(--bg-surface)",
            border: "0.5px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontWeight: 500,
            cursor: downloading ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            opacity: downloading ? 0.6 : 1,
          }}
          title="전체 보고서를 Word(.docx)로 다운로드. 섹션별 PDF는 본문 상단 [PDF] 버튼을 사용하세요."
        >
          {downloading ? (
            "생성 중…"
          ) : (
            <>
              <span style={{ fontSize: 11 }}>📄</span>
              전체 보고서 (Word)
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
