// components/ChatResponsePanel.tsx
// 명령 입력창에서 보낸 질의의 응답을 우측에 띄우는 패널.
// SourcePanel 과 같은 슬롯/스타일을 공유한다.

"use client";

import { useEffect } from "react";

export type ChatStatus = "loading" | "ok" | "error";

interface ChatResponsePanelProps {
  query: string;
  status: ChatStatus;
  message?: string;  // status="ok"
  error?: string;    // status="error"
  onClose: () => void;
}

export function ChatResponsePanel({
  query,
  status,
  message,
  error,
  onClose,
}: ChatResponsePanelProps) {
  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
          응답
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
        {/* 사용자 질의 */}
        <div style={{ marginBottom: 18 }}>
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
            질의
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--text-primary)",
              lineHeight: 1.5,
              padding: "10px 12px",
              background: "var(--bg-muted)",
              borderRadius: 6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {query}
          </div>
        </div>

        {/* 상태별 응답 */}
        {status === "loading" && <LoadingBody />}
        {status === "ok" && <OkBody message={message ?? ""} />}
        {status === "error" && <ErrorBody error={error ?? "알 수 없는 오류"} />}
      </div>
    </aside>
  );
}

function LoadingBody() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "32px 0",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
          padding: "8px 16px",
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
            animation: "chat-pulse 1.5s ease-in-out infinite",
          }}
        />
        응답 생성 중…
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        에이전트가 처리 중입니다.<br />
        진행 로그는 하단 패널에서 확인할 수 있습니다.
      </div>
      <style>{`
        @keyframes chat-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}

function OkBody({ message }: { message: string }) {
  return (
    <div>
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
        답
      </div>
      <div
        style={{
          fontSize: 13.5,
          color: "var(--text-primary)",
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {message || "(빈 응답)"}
      </div>
    </div>
  );
}

function ErrorBody({ error }: { error: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "var(--accent-warning)",
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        오류
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--text-primary)",
          lineHeight: 1.6,
          padding: "10px 12px",
          background: "var(--accent-warning-bg)",
          border: "0.5px solid var(--accent-warning)",
          borderRadius: 6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {error}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          marginTop: 10,
          lineHeight: 1.5,
        }}
      >
        하단 진행 로그에서 자세한 trace 를 확인할 수 있습니다.
      </div>
    </div>
  );
}
