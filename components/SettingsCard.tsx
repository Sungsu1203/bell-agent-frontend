// components/SettingsCard.tsx
"use client";

import { useState } from "react";
import {
  PROVIDERS,
  matchActiveProvider,
  type ProviderMeta,
  type ProviderId,
} from "@/lib/providers";
import { ProviderGuideModal } from "./ProviderGuideModal";

interface SettingsCardProps {
  currentProvider?: {
    provider: string;
    model: string;
  };
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "0.5px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  padding: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-secondary)",
  fontWeight: 500,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  marginBottom: 10,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-tertiary)",
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  marginBottom: 6,
};

export function SettingsCard({ currentProvider }: SettingsCardProps) {
  const [selectedTarget, setSelectedTarget] = useState<ProviderMeta | null>(
    null
  );

  const active = matchActiveProvider(
    currentProvider?.provider,
    currentProvider?.model
  );
  const disconnected = !currentProvider;

  const handleSelect = (id: ProviderId) => {
    const target = PROVIDERS.find((p) => p.id === id);
    if (!target) return;
    if (active && target.id === active.id) return;
    setSelectedTarget(target);
  };

  return (
    <div style={cardStyle}>
      <div style={labelStyle}>설정 / Settings</div>

      {disconnected && (
        <div
          style={{
            background: "var(--accent-warning-bg)",
            color: "var(--accent-warning)",
            border: "0.5px solid var(--accent-warning)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 10px",
            fontSize: 11,
            marginBottom: 10,
            lineHeight: 1.45,
          }}
        >
          백엔드 연결 끊김 — provider 변경 중이라면 재가동 후 새로고침해주세요.
        </div>
      )}

      {/* 현재 활성 */}
      <div style={{ marginBottom: 12 }}>
        <div style={sectionLabelStyle}>현재 활성 / Active</div>
        {active ? (
          <div
            style={{
              background: "var(--bg-muted)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--accent-success)",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={active.display_name_ko}
              >
                {active.display_name_ko}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: "var(--accent-success)",
                  background: "var(--accent-success-bg)",
                  border: "0.5px solid var(--accent-success)",
                  borderRadius: 999,
                  padding: "1px 7px",
                  flexShrink: 0,
                  letterSpacing: "0.04em",
                }}
              >
                활성
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-secondary)",
                marginTop: 4,
                marginLeft: 15,
              }}
            >
              {active.label_ko} · {active.cost}
            </div>
          </div>
        ) : (
          <div
            style={{
              background: "var(--bg-muted)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 10px",
              fontSize: 11,
              color: "var(--text-secondary)",
              fontStyle: "italic",
            }}
          >
            {currentProvider
              ? `매칭 불가: ${currentProvider.provider} / ${currentProvider.model}`
              : "확인 중..."}
          </div>
        )}
      </div>

      {/* 다른 provider 선택 */}
      <div>
        <div style={sectionLabelStyle}>다른 provider 선택 / Switch</div>
        <select
          value=""
          onChange={(e) => {
            const val = e.target.value;
            if (val) {
              handleSelect(val as ProviderId);
              e.target.value = "";
            }
          }}
          disabled={disconnected}
          style={{
            width: "100%",
            fontSize: 12,
            padding: "7px 10px",
            background: disconnected ? "var(--bg-muted)" : "var(--bg-surface)",
            color: disconnected ? "var(--text-tertiary)" : "var(--text-primary)",
            border: "0.5px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            cursor: disconnected ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          <option value="">provider 선택...</option>
          {PROVIDERS.filter((p) => !active || p.id !== active.id).map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name_ko} — {p.label_ko} · {p.cost}
            </option>
          ))}
        </select>
      </div>

      {selectedTarget && (
        <ProviderGuideModal
          target={selectedTarget}
          onClose={() => setSelectedTarget(null)}
        />
      )}
    </div>
  );
}
