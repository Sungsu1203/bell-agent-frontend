// components/ReportCanvas.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import { Section } from "@/lib/data";
import { parseDocument, Block, FootnoteDef } from "@/lib/markdown";
import { downloadExport } from "@/lib/api";

interface ReportCanvasProps {
  section: Section | undefined;
  subtitle?: string;
  bodyLoading?: boolean;
  onCitationClick?: (source: string) => void;
  onCommandSubmit?: (input: string) => void;
  onFootnotesChange?: (footnotes: FootnoteDef[]) => void;
}

export function ReportCanvas({
  section,
  subtitle,
  bodyLoading = false,
  onCitationClick,
  onCommandSubmit,
  onFootnotesChange,
}: ReportCanvasProps) {
  const [command, setCommand] = useState("");
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const parsed = useMemo(
    () => (section?.body ? parseDocument(section.body) : null),
    [section?.body]
  );

  useEffect(() => {
    onFootnotesChange?.(parsed?.footnotes ?? []);
  }, [parsed, onFootnotesChange]);

  const handleSubmit = () => {
    if (!command.trim() || !onCommandSubmit) return;
    onCommandSubmit(command);
    setCommand("");
  };

  // ───── 액션 핸들러 ─────

  const handleDownloadWord = async () => {
    if (!section || !section.body) return;
    setDownloadingDocx(true);
    try {
      await downloadExport({
        kind: "section",
        section_id: section.id,
        format: "docx",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Word 다운로드 실패: ${msg}`);
    } finally {
      setDownloadingDocx(false);
    }
  };

  const handlePrintPdf = () => {
    if (!section || !section.body) return;
    // 인쇄 시 어느 섹션인지 body에 data-* 속성으로 표시 (CSS에서 활용)
    document.body.setAttribute("data-printing-section-id", String(section.id));
    document.body.setAttribute(
      "data-printing-section-title",
      `${section.id}. ${section.title}`
    );
    window.print();
    // 인쇄 다이얼로그 후 정리 (afterprint 이벤트는 모든 브라우저 지원)
    const cleanup = () => {
      document.body.removeAttribute("data-printing-section-id");
      document.body.removeAttribute("data-printing-section-title");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
  };

  const handleCopy = async () => {
    if (!section?.body) return;
    try {
      await navigator.clipboard.writeText(section.body);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2500);
    }
  };

  if (!section) {
    return (
      <div style={canvasStyle}>
        <div style={emptyStyle}>섹션을 선택하세요.</div>
      </div>
    );
  }

  const canDownload = !!section.body && section.status === "done";

  return (
    <div style={canvasStyle} className="report-canvas">
      {/* 상단 바 */}
      <div
        className="report-canvas__topbar"
        style={{
          padding: "12px 18px",
          borderBottom: "0.5px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            현재 보기:
          </span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {section.id}. {section.title}
          </span>
          <StatusBadge status={section.status} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ActionButton
            onClick={handleDownloadWord}
            disabled={!canDownload || downloadingDocx}
            title={
              !canDownload
                ? "본문이 있는 섹션만 다운로드 가능"
                : "Word(.docx) 파일로 다운로드"
            }
          >
            {downloadingDocx ? "생성 중…" : "Word"}
          </ActionButton>
          <ActionButton
            onClick={handlePrintPdf}
            disabled={!canDownload}
            title={
              !canDownload
                ? "본문이 있는 섹션만 출력 가능"
                : "인쇄/PDF로 저장 (Ctrl+P 다이얼로그)"
            }
          >
            PDF
          </ActionButton>
          <ActionButton
            onClick={handleCopy}
            disabled={!canDownload}
            highlight={copyState !== "idle"}
            title="마크다운 텍스트를 클립보드에 복사"
          >
            {copyState === "copied" ? "복사됨 ✓" : copyState === "error" ? "실패" : "복사"}
          </ActionButton>
        </div>
      </div>

      {/* 본문 — 인쇄 영역 */}
      <div
        className="report-canvas__body"
        style={{
          padding: "32px 48px 40px 48px",
          flex: 1,
          overflowY: "auto",
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Section {String(section.id).padStart(2, "0")}
        </div>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 500,
            margin: "0 0 8px 0",
            letterSpacing: "-0.01em",
            lineHeight: 1.3,
          }}
        >
          {section.title}
        </h2>
        {subtitle && (
          <div
            className="report-canvas__subtitle"
            style={{
              fontSize: 13,
              color: "var(--text-tertiary)",
              marginBottom: 28,
              paddingBottom: 16,
              borderBottom: "0.5px solid var(--border-subtle)",
            }}
          >
            {subtitle}
          </div>
        )}

        {bodyLoading ? (
          <LoadingState />
        ) : parsed ? (
          <ReportBody
            blocks={parsed.contentBlocks}
            footnotes={parsed.footnotes}
            onCitationClick={onCitationClick}
          />
        ) : section.status === "writing" ? (
          <WritingState />
        ) : (
          <PendingState />
        )}
      </div>

      {/* 명령 입력 */}
      <div
        className="report-canvas__commandbar"
        style={{
          padding: "12px 18px",
          borderTop: "0.5px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="명령 입력 — 예: 아이커의 주원료가 뭐야?"
          style={{
            flex: 1,
            fontSize: 13,
            height: 34,
            padding: "0 12px",
            border: "0.5px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-surface)",
            outline: "none",
            color: "var(--text-primary)",
          }}
        />
        <button
          onClick={handleSubmit}
          style={{
            fontSize: 12,
            padding: "7px 18px",
            background: "var(--text-primary)",
            color: "var(--bg-surface)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            fontWeight: 500,
          }}
        >
          실행
        </button>
      </div>
    </div>
  );
}

const canvasStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "0.5px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  display: "flex",
  flexDirection: "column",
  minHeight: 600,
  height: "100%",
  overflow: "hidden",
};

const emptyStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--text-tertiary)",
  fontSize: 14,
};

function ActionButton({
  children,
  onClick,
  disabled,
  highlight,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        fontSize: 11,
        padding: "5px 12px",
        background: highlight ? "var(--accent-success-bg)" : "var(--bg-surface)",
        border: `0.5px solid ${
          highlight ? "var(--accent-success)" : "var(--border-default)"
        }`,
        borderRadius: "var(--radius-sm)",
        color: highlight ? "var(--accent-success)" : "var(--text-primary)",
        fontWeight: 500,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: Section["status"] }) {
  const cfg = {
    done: { label: "완료", bg: "var(--accent-success-bg)", color: "var(--accent-success)" },
    writing: { label: "집필 중", bg: "var(--accent-info-bg)", color: "var(--accent-info)" },
    pending: { label: "대기", bg: "var(--bg-muted)", color: "var(--text-tertiary)" },
  }[status];

  return (
    <span
      style={{
        fontSize: 10,
        padding: "2px 7px",
        background: cfg.bg,
        color: cfg.color,
        borderRadius: 4,
        fontWeight: 500,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ───── 본문 렌더링 ─────

function ReportBody({
  blocks,
  footnotes,
  onCitationClick,
}: {
  blocks: Block[];
  footnotes: FootnoteDef[];
  onCitationClick?: (source: string) => void;
}) {
  return (
    <div className="prose-report">
      {blocks.map((block, i) => renderBlock(block, i, onCitationClick))}
      {footnotes.length > 0 && (
        <FootnotesPanel
          footnotes={footnotes}
          onCitationClick={onCitationClick}
        />
      )}
    </div>
  );
}

function renderBlock(
  block: Block,
  key: number,
  onCitationClick?: (source: string) => void
): React.ReactNode {
  if (block.type === "hr") {
    return (
      <hr
        key={key}
        style={{
          border: "none",
          borderTop: "0.5px solid var(--border-default)",
          margin: "28px 0",
        }}
      />
    );
  }

  if (block.type === "heading") {
    if (block.level <= 2) {
      return (
        <h3
          key={key}
          style={{
            fontSize: 19,
            fontWeight: 600,
            margin: "32px 0 12px 0",
            letterSpacing: "-0.005em",
            color: "var(--text-primary)",
          }}
        >
          {renderInline(block.text, onCitationClick)}
        </h3>
      );
    }
    if (block.level === 3) {
      return (
        <h4
          key={key}
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: "24px 0 10px 0",
            color: "var(--text-primary)",
          }}
        >
          {renderInline(block.text, onCitationClick)}
        </h4>
      );
    }
    return (
      <h5
        key={key}
        style={{
          fontSize: 14,
          fontWeight: 600,
          margin: "18px 0 8px 0",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {renderInline(block.text, onCitationClick)}
      </h5>
    );
  }

  if (block.type === "ordered-list") {
    return (
      <ol
        key={key}
        style={{
          margin: "0 0 16px 0",
          paddingLeft: 24,
          listStyle: "decimal",
        }}
      >
        {block.items.map((item, j) => {
          const lines = item.split("\n");
          return (
            <li
              key={j}
              style={{ marginBottom: 10, paddingLeft: 4, lineHeight: 1.7 }}
            >
              {lines.map((ln, li) => {
                // 하위 항목 표시: "  • 텍스트" 또는 "  텍스트"
                const subMatch = ln.match(/^\s*•\s*(.+)$/);
                if (subMatch) {
                  return (
                    <div
                      key={li}
                      style={{
                        marginLeft: 8,
                        marginTop: 4,
                        fontSize: "0.95em",
                        color: "var(--text-secondary)",
                        display: "flex",
                        gap: 6,
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>•</span>
                      <span>{renderInline(subMatch[1], onCitationClick)}</span>
                    </div>
                  );
                }
                // 첫 줄 (또는 일반 줄)
                return (
                  <div key={li}>
                    {renderInline(ln, onCitationClick)}
                  </div>
                );
              })}
            </li>
          );
        })}
      </ol>
    );
  }

  if (block.type === "unordered-list") {
    return (
      <ul
        key={key}
        style={{
          margin: "0 0 16px 0",
          paddingLeft: 24,
          listStyle: "disc",
        }}
      >
        {block.items.map((item, j) => {
          const lines = item.split("\n");
          return (
            <li
              key={j}
              style={{ marginBottom: 8, paddingLeft: 4, lineHeight: 1.7 }}
            >
              {lines.map((ln, li) => {
                const subMatch = ln.match(/^\s*•\s*(.+)$/);
                if (subMatch) {
                  return (
                    <div
                      key={li}
                      style={{
                        marginLeft: 8,
                        marginTop: 4,
                        fontSize: "0.95em",
                        color: "var(--text-secondary)",
                        display: "flex",
                        gap: 6,
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>◦</span>
                      <span>{renderInline(subMatch[1], onCitationClick)}</span>
                    </div>
                  );
                }
                return (
                  <div key={li}>
                    {renderInline(ln, onCitationClick)}
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
    );
  }

  if (block.type === "table") {
    return (
      <div
        key={key}
        style={{
          margin: "16px 0 20px 0",
          overflowX: "auto", // 표가 넓으면 가로 스크롤
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {block.headers.length > 0 && (
            <thead>
              <tr style={{ background: "var(--bg-muted, #f5f5f5)" }}>
                {block.headers.map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      borderBottom:
                        "1px solid var(--border-default, #ccc)",
                    }}
                  >
                    {renderInline(h, onCitationClick)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {block.rows.map((row, ri) => (
              <tr
                key={ri}
                style={{
                  borderBottom:
                    "0.5px solid var(--border-subtle, #eee)",
                }}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: "8px 12px",
                      verticalAlign: "top",
                      color: "var(--text-primary)",
                    }}
                  >
                    {renderInline(cell, onCitationClick)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <p key={key} style={{ margin: "0 0 16px 0", lineHeight: 1.75 }}>
      {renderInline(block.text, onCitationClick)}
    </p>
  );
}

function renderInline(
  text: string,
  onCitationClick?: (source: string) => void
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex =
    /(\*\*[^*\n]+\*\*)|(\[\[[^\]\n]+\]\])|(\[[^\]\n]*\.[a-zA-Z0-9가-힣_-]+[^\]\n]*\])|(⚠️"[^"\n]+")/g;

  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];

    if (token.startsWith("**")) {
      parts.push(
        <strong key={key++} style={{ fontWeight: 600 }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("[[")) {
      const source = token.slice(2, -2);
      parts.push(
        <CitationChip
          key={key++}
          source={source}
          onClick={() => onCitationClick?.(source)}
        />
      );
    } else if (token.startsWith("[")) {
      const source = token.slice(1, -1);
      parts.push(
        <CitationChip
          key={key++}
          source={source}
          onClick={() => onCitationClick?.(source)}
        />
      );
    } else if (token.startsWith("⚠️")) {
      const inner = token.match(/⚠️"([^"]+)"/)?.[1] ?? "";
      parts.push(
        <span
          key={key++}
          style={{
            background: "var(--accent-warning-bg)",
            color: "var(--accent-warning)",
            padding: "1px 6px",
            borderRadius: 4,
            fontWeight: 500,
          }}
        >
          {inner}
        </span>
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <>{parts}</>;
}

function CitationChip({
  source,
  onClick,
}: {
  source: string;
  onClick?: () => void;
}) {
  const display = source.length > 30 ? source.slice(0, 28) + "…" : source;

  const ext = source.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  const icon =
    ext === "pptx" || ext === "ppt"
      ? "▦"
      : ext === "xlsx" || ext === "xls"
      ? "▤"
      : ext === "docx" || ext === "doc" || ext === "pdf"
      ? "▢"
      : "●";

  return (
    <span
      className="citation-chip"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "1px 9px 2px 8px",
        margin: "0 2px",
        fontSize: 11.5,
        background: "var(--accent-info-bg)",
        color: "var(--accent-info)",
        borderRadius: 11,
        cursor: "pointer",
        verticalAlign: "1px",
        fontWeight: 500,
        transition: "background 0.15s, transform 0.1s",
        whiteSpace: "nowrap",
      }}
      title={`출처 보기: ${source}`}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--accent-info)";
        e.currentTarget.style.color = "var(--bg-surface)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--accent-info-bg)";
        e.currentTarget.style.color = "var(--accent-info)";
      }}
    >
      <span style={{ fontSize: 9 }}>{icon}</span>
      {display}
    </span>
  );
}

function FootnotesPanel({
  footnotes,
  onCitationClick,
}: {
  footnotes: FootnoteDef[];
  onCitationClick?: (source: string) => void;
}) {
  return (
    <div
      className="footnotes-panel"
      style={{
        marginTop: 36,
        padding: "20px 22px",
        background: "var(--bg-muted)",
        border: "0.5px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.06em",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          fontWeight: 500,
          marginBottom: 14,
        }}
      >
        참고 문헌 ({footnotes.length})
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {footnotes.map((fn, i) => (
          <li
            key={i}
            onClick={() => onCitationClick?.(fn.fileName || fn.prettyUrl)}
            style={{
              display: "flex",
              gap: 10,
              padding: "8px 0",
              fontSize: 12.5,
              lineHeight: 1.55,
              borderBottom:
                i < footnotes.length - 1
                  ? "0.5px solid var(--border-subtle)"
                  : "none",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            title="자세히 보기"
          >
            <span
              style={{
                flexShrink: 0,
                width: 22,
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: 11,
                textAlign: "right",
                paddingTop: 1,
              }}
            >
              [{fn.marker}]
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 2,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                  {fn.prettyUrl}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 6px",
                    background: fn.isWebUrl
                      ? "var(--accent-info-bg)"
                      : "var(--accent-success-bg)",
                    color: fn.isWebUrl
                      ? "var(--accent-info)"
                      : "var(--accent-success)",
                    borderRadius: 3,
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {fn.isWebUrl ? "Web" : "Local"}
                </span>
              </div>
              {fn.label && (
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {fn.label}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      style={{
        padding: "48px 0",
        textAlign: "center",
        color: "var(--text-tertiary)",
        fontSize: 13,
      }}
    >
      본문을 불러오는 중…
    </div>
  );
}

function WritingState() {
  return (
    <div style={{ padding: "48px 0", textAlign: "center" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          fontSize: 14,
          padding: "10px 18px",
          background: "var(--accent-info-bg)",
          color: "var(--accent-info)",
          borderRadius: "var(--radius-md)",
          fontWeight: 500,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent-info)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
        Writer가 집필 중입니다…
      </div>
      <div
        style={{
          marginTop: 16,
          fontSize: 12,
          color: "var(--text-tertiary)",
        }}
      >
        보통 1–2분 소요됩니다. 완료되면 자동으로 본문이 표시됩니다.
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}

function PendingState() {
  return (
    <div
      style={{
        padding: "48px 0",
        textAlign: "center",
        color: "var(--text-tertiary)",
        fontSize: 14,
      }}
    >
      <div style={{ marginBottom: 8 }}>아직 집필되지 않은 섹션입니다.</div>
      <div style={{ fontSize: 12 }}>
        좌측 목차의{" "}
        <strong style={{ color: "var(--text-secondary)" }}>write</strong> 버튼을
        눌러 집필을 시작하세요.
      </div>
    </div>
  );
}
