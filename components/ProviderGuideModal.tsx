// components/ProviderGuideModal.tsx
"use client";

import { useState } from "react";
import {
  type ProviderMeta,
  WRITER_PROJECT_PATH,
  BACKEND_PATH,
} from "@/lib/providers";

interface ProviderGuideModalProps {
  target: ProviderMeta;
  onClose: () => void;
}

/**
 * 변경 가이드 모달 — 시나리오 C 박제 (SETTINGS_UI_FRONTEND.md §6).
 *
 * 시나리오 C: backend 부팅 시 reload_config_inplace (core/config.py:660) 가
 * .env 를 override=True 로 재로드. PowerShell $env:LLM_PROVIDER 무용 —
 * .env + .env.<provider> 양쪽 편집이 진실의 원천.
 *
 * 4단계:
 *   1. 백엔드 종료 (Ctrl+C, 사용자 수동)
 *   2. .env 편집 — LLM_PROVIDER= 줄 (사용자 수동)
 *   3. .env.<provider> 편집 — 모델 줄 (사용자 수동)
 *   4. 백엔드 재가동 (복사 가능 명령)
 */
export function ProviderGuideModal({
  target,
  onClose,
}: ProviderGuideModalProps) {
  const [copied, setCopied] = useState(false);

  // 편집 단계 박제값
  const editEnvLine = `LLM_PROVIDER=${target.provider}`;
  const editOverlayLine = `${target.env_key}=${target.model}`;
  const envPath = `${WRITER_PROJECT_PATH}\\.env`;
  const overlayPath = `${WRITER_PROJECT_PATH}\\${target.env_overlay_file}`;

  // 4단계: 재가동 명령 블록 (복사 대상)
  const venvPython = `${BACKEND_PATH}\\${target.venv_dir}\\Scripts\\python.exe`;
  const restartCommand = [
    `cd ${WRITER_PROJECT_PATH}`,
    `$env:PYTHONIOENCODING='utf-8'`,
    `& ${venvPython} app.py --serve --host 127.0.0.1 --port 8000`,
  ].join("\n");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(restartCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard 실패 시 silent
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(26, 26, 24, 0.45)",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.18)",
          maxWidth: 640,
          width: "100%",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            borderBottom: "0.5px solid var(--border-subtle)",
            padding: "18px 22px 14px 22px",
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {target.display_name_ko} 로 변경
          </h2>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            Switch to {target.display_name_en}
          </p>
        </div>

        {/* 본문 */}
        <div
          style={{
            padding: "16px 22px",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            4단계로 진행합니다. 백엔드를 종료한 뒤 두 파일을 편집하고 다시 가동합니다.
          </p>

          {/* Step 1 */}
          <Step number={1} title="백엔드 종료 / Stop backend">
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              백엔드 PowerShell 창에서{" "}
              <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd>
            </span>
          </Step>

          {/* Step 2 */}
          <Step number={2} title=".env 편집 / Edit .env">
            <FilePathLabel>{envPath}</FilePathLabel>
            <Hint>다음 줄을 찾아 수정 후 저장:</Hint>
            <CommandBox>{editEnvLine}</CommandBox>
          </Step>

          {/* Step 3 */}
          <Step number={3} title={`${target.env_overlay_file} 편집 / Edit overlay`}>
            <FilePathLabel>{overlayPath}</FilePathLabel>
            <Hint>다음 줄을 찾아 수정 후 저장:</Hint>
            <CommandBox>{editOverlayLine}</CommandBox>
          </Step>

          {/* Step 4 */}
          <Step number={4} title="백엔드 재가동 / Restart backend">
            <CommandBox>{restartCommand}</CommandBox>
          </Step>

          {/* 사전 확인 */}
          <div
            style={{
              background: "var(--bg-muted)",
              border: "0.5px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 12px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              ✓ 사전 확인 / Prerequisites
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 11,
                color: "var(--text-secondary)",
                lineHeight: 1.7,
              }}
            >
              <li>{target.venv_dir} 폴더가 backend 폴더에 생성되어 있어야 합니다</li>
              <li>
                {target.env_overlay_file} 에 해당 provider 의 API key 가 설정되어
                있어야 합니다
              </li>
            </ul>
          </div>

          {/* 새로고침 안내 */}
          <div
            style={{
              background: "var(--accent-info-bg)",
              border: "0.5px solid var(--accent-info)",
              borderRadius: "var(--radius-sm)",
              padding: "9px 12px",
              fontSize: 11,
              color: "var(--accent-info)",
              lineHeight: 1.5,
            }}
          >
            ⓘ 변경 완료 후 이 페이지를 새로고침해주세요. / Refresh this page after restart.
          </div>
        </div>

        {/* 푸터 */}
        <div
          style={{
            borderTop: "0.5px solid var(--border-subtle)",
            background: "var(--bg-muted)",
            padding: "12px 22px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            style={{
              fontSize: 12,
              padding: "7px 14px",
              background: "transparent",
              border: "0.5px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-secondary)",
              fontWeight: 500,
            }}
          >
            닫기 / Close
          </button>
          <button
            onClick={handleCopy}
            style={{
              fontSize: 12,
              padding: "7px 14px",
              background: copied
                ? "var(--accent-success-bg)"
                : "var(--text-primary)",
              border: copied
                ? "0.5px solid var(--accent-success)"
                : "0.5px solid var(--text-primary)",
              borderRadius: "var(--radius-sm)",
              color: copied ? "var(--accent-success)" : "var(--bg-surface)",
              fontWeight: 600,
            }}
          >
            {copied ? "✓ 복사됨" : "4단계 재가동 명령 복사"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "var(--text-primary)",
            color: "var(--bg-surface)",
            fontSize: 11,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {number}
        </span>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {title}
        </h3>
      </div>
      <div style={{ marginLeft: 30, display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function CommandBox({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        background: "#1f1d1a",
        color: "#f4f1e8",
        fontSize: 11.5,
        lineHeight: 1.65,
        fontFamily: "var(--font-mono)",
        padding: "10px 12px",
        borderRadius: "var(--radius-sm)",
        margin: 0,
        overflowX: "auto",
        whiteSpace: "pre",
      }}
    >
      <code>{children}</code>
    </pre>
  );
}

function FilePathLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
      파일:{" "}
      <code
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          background: "var(--bg-muted)",
          padding: "1px 5px",
          borderRadius: 3,
          color: "var(--text-primary)",
        }}
      >
        {children}
      </code>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{children}</div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        background: "var(--bg-muted)",
        border: "0.5px solid var(--border-default)",
        borderRadius: 3,
        padding: "1px 5px",
        color: "var(--text-primary)",
      }}
    >
      {children}
    </kbd>
  );
}
