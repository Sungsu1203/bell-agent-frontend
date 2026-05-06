// components/SourcePanel.tsx
"use client";

import { useState, useEffect } from "react";
import { FootnoteDef } from "@/lib/markdown";
import { SectionRefEntry } from "@/lib/api";

interface SourcePanelProps {
  source: string;          // 클릭한 칩의 텍스트 (예: "아이커_운영제안.pptx")
  footnote: FootnoteDef | null;
  // §12-16: 사이드카 .refs.json 의 marker 항목 — chunk 원본 텍스트를 패널에 표시.
  // null/undefined 면 chunk 영역 숨김 (옛 섹션 호환).
  refEntry?: SectionRefEntry | null;
  onClose: () => void;
}

export function SourcePanel({ source, footnote, refEntry, onClose }: SourcePanelProps) {
  const [copied, setCopied] = useState(false);
  const [showRawChunk, setShowRawChunk] = useState(false);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleCopyPath = async () => {
    if (!footnote) return;
    try {
      await navigator.clipboard.writeText(footnote.decodedPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한 없을 때 fallback
      alert(`경로:\n${footnote.decodedPath}`);
    }
  };

  // 파일 확장자별 아이콘
  const ext = (footnote?.fileName || source).match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  const icon =
    ext === "pptx" || ext === "ppt"
      ? "▦"
      : ext === "xlsx" || ext === "xls"
      ? "▤"
      : ext === "docx" || ext === "doc" || ext === "pdf"
      ? "▢"
      : footnote?.isWebUrl
      ? "◐"
      : "●";

  return (
    <aside
      style={{
        background: "var(--bg-surface)",
        border: "0.5px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 600,
        overflow: "hidden",
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "0.5px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          출처 상세
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          style={{
            width: 24,
            height: 24,
            border: "none",
            borderRadius: 4,
            background: "transparent",
            color: "var(--text-secondary)",
            fontSize: 16,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          }}
          title="닫기 (ESC)"
        >
          ×
        </button>
      </div>

      {/* 본문 */}
      <div
        style={{
          padding: "20px 18px",
          flex: 1,
          overflowY: "auto",
        }}
      >
        {!footnote ? (
          <NoMatchState source={source} />
        ) : (
          <>
            {/* 출처 식별 헤더 */}
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: footnote.isWebUrl
                      ? "var(--accent-info-bg)"
                      : "var(--accent-success-bg)",
                    color: footnote.isWebUrl
                      ? "var(--accent-info)"
                      : "var(--accent-success)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 7px",
                    background: footnote.isWebUrl
                      ? "var(--accent-info-bg)"
                      : "var(--accent-success-bg)",
                    color: footnote.isWebUrl
                      ? "var(--accent-info)"
                      : "var(--accent-success)",
                    borderRadius: 3,
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {footnote.isWebUrl ? "Web" : "Local"}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 7px",
                    background: "var(--bg-muted)",
                    color: "var(--text-secondary)",
                    borderRadius: 3,
                    fontWeight: 500,
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  [{footnote.marker}]
                </span>
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  wordBreak: "break-all",
                  lineHeight: 1.3,
                }}
              >
                {footnote.prettyUrl}
              </div>
              {footnote.label && footnote.label !== footnote.prettyUrl && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  {footnote.label}
                </div>
              )}
            </div>

            {/* 인용 위치 */}
            {footnote.chunkInfo && (
              <Field label="인용 위치">
                <code
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 12,
                    background: "var(--bg-muted)",
                    padding: "3px 8px",
                    borderRadius: 4,
                    color: "var(--text-primary)",
                    wordBreak: "break-all",
                  }}
                >
                  {footnote.chunkInfo}
                </code>
              </Field>
            )}

            {/* §12-16/§12-17: 인용 내용 — summary 가 primary, raw chunk 는 토글로 펼침 */}
            {(refEntry?.summary || refEntry?.text) && (
              <Field label="인용 내용">
                {refEntry?.summary ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-primary)",
                      lineHeight: 1.6,
                      background: "var(--bg-muted)",
                      padding: "12px 14px",
                      borderRadius: "var(--radius-sm)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      border: "0.5px solid var(--border-subtle)",
                    }}
                  >
                    {refEntry.summary}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                      fontStyle: "italic",
                      padding: "10px 14px",
                      background: "var(--bg-muted)",
                      borderRadius: "var(--radius-sm)",
                      border: "0.5px dashed var(--border-subtle)",
                    }}
                  >
                    요약 생성 중… 잠시 후 자동으로 갱신됩니다.
                  </div>
                )}
                {refEntry?.text && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowRawChunk((v) => !v)}
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        background: "transparent",
                        border: "none",
                        padding: "4px 0",
                        cursor: "pointer",
                        textDecoration: "underline",
                        textUnderlineOffset: 2,
                      }}
                    >
                      {showRawChunk ? "원본 chunk 숨기기 ▴" : "원본 chunk 보기 ▾"}
                    </button>
                    {showRawChunk && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          lineHeight: 1.55,
                          background: "var(--bg-muted)",
                          padding: "10px 12px",
                          borderRadius: "var(--radius-sm)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          maxHeight: 240,
                          overflowY: "auto",
                          border: "0.5px solid var(--border-subtle)",
                        }}
                      >
                        {refEntry.text}
                      </div>
                    )}
                  </>
                )}
              </Field>
            )}

            {/* 경로 또는 URL */}
            <Field label={footnote.isWebUrl ? "URL" : "파일 경로"}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  wordBreak: "break-all",
                  lineHeight: 1.5,
                  fontFamily: footnote.isWebUrl
                    ? "inherit"
                    : "var(--font-mono, monospace)",
                  background: "var(--bg-muted)",
                  padding: "8px 10px",
                  borderRadius: 4,
                  marginTop: 4,
                }}
              >
                {footnote.decodedPath}
              </div>
            </Field>

            {/* 액션 버튼들 */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 18,
                flexWrap: "wrap",
              }}
            >
              {footnote.isWebUrl ? (
                <a
                  href={footnote.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12,
                    padding: "8px 14px",
                    background: "var(--text-primary)",
                    color: "var(--bg-surface)",
                    borderRadius: "var(--radius-sm)",
                    fontWeight: 500,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  새 탭에서 열기 ↗
                </a>
              ) : (
                <button
                  onClick={handleCopyPath}
                  style={{
                    fontSize: 12,
                    padding: "8px 14px",
                    background: copied
                      ? "var(--accent-success)"
                      : "var(--text-primary)",
                    color: "var(--bg-surface)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  {copied ? "복사됨 ✓" : "경로 복사"}
                </button>
              )}
            </div>

            {!footnote.isWebUrl && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  marginTop: 12,
                  lineHeight: 1.5,
                }}
              >
                💡 경로를 복사하여 파일 탐색기에 붙여넣으면 원본 파일이 열립니다.
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

// 필드 라벨 + 값 컴포넌트
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function NoMatchState({ source }: { source: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 14,
          color: "var(--text-primary)",
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        {source}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          lineHeight: 1.6,
          padding: "12px 0",
        }}
      >
        이 출처에 대응하는 참고문헌 정보를 찾을 수 없습니다.
        <br />
        본문의 인용 표기와 참고문헌 섹션의 파일명이 정확히 일치하지 않을 수 있어요.
      </div>
    </div>
  );
}
