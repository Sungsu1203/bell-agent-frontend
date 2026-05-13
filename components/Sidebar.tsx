// components/Sidebar.tsx
"use client";

import { Project, Section } from "@/lib/data";
import { SettingsCard } from "./SettingsCard";

interface SidebarProps {
  project: Project;
  sections: Section[];
  activeSectionId: number;
  onSelectSection: (id: number) => void;
  onWriteSection: (id: number) => void;
  onUpdateRag: () => void;
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

export function Sidebar({
  project,
  sections,
  activeSectionId,
  onSelectSection,
  onWriteSection,
  onUpdateRag,
  currentProvider,
}: SidebarProps) {
  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* 자료 카드 */}
      <div style={cardStyle}>
        <div style={labelStyle}>자료</div>
        <div style={{ fontSize: 13, marginBottom: 10 }}>
          <span style={{ fontWeight: 500 }}>{project.filesLearned}개</span>
          <span style={{ color: "var(--text-secondary)" }}> 파일 학습됨</span>
        </div>
        <button
          onClick={onUpdateRag}
          style={{
            width: "100%",
            fontSize: 12,
            padding: "7px 10px",
            background: "var(--bg-muted)",
            border: "0.5px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontWeight: 500,
          }}
        >
          최신 자료 갱신
        </button>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginTop: 8,
          }}
        >
          {project.lastUpdated} 갱신
        </div>
      </div>

      {/* 목차 카드 */}
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div style={labelStyle}>목차</div>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {sections.length}개
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {sections.map((s) => (
            <SectionRow
              key={s.id}
              section={s}
              isActive={s.id === activeSectionId}
              onSelect={() => onSelectSection(s.id)}
              onWrite={() => onWriteSection(s.id)}
            />
          ))}
        </div>
      </div>

      {/* 미션 카드 */}
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div style={labelStyle}>미션</div>
          {project.objectives.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {project.objectives.length}개
            </span>
          )}
        </div>

        {project.objectives.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              fontStyle: "italic",
              padding: "4px 0",
            }}
          >
            미션이 설정되지 않았습니다.
          </div>
        ) : (
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {project.objectives.map((obj, idx) => (
              <ObjectiveItem key={idx} index={idx + 1} text={obj} />
            ))}
          </ol>
        )}
      </div>

      {/* 설정 카드 — 미션 카드 아래 */}
      <SettingsCard currentProvider={currentProvider} />
    </aside>
  );
}

// ───── Objective 항목 ─────
// 긴 텍스트(50~70자)를 사이드바 240px 안에 보기 좋게 표시.
// 핵심 키워드(첫 명사구)만 보이도록 줄임 + 전체 텍스트는 hover 시 title 툴팁.

function ObjectiveItem({ index, text }: { index: number; text: string }) {
  // 핵심 부분만 추출: 첫 콜론(:) 또는 처음 ~28자
  const summary = summarize(text);

  return (
    <li
      style={{
        display: "flex",
        gap: 8,
        fontSize: 12,
        lineHeight: 1.5,
        color: "var(--text-secondary)",
        cursor: "default",
      }}
      title={text}
    >
      <span
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          borderRadius: 4,
          background: "var(--bg-muted)",
          color: "var(--text-secondary)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 600,
          marginTop: 1,
        }}
      >
        {index}
      </span>
      <span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          lineClamp: 2,
        }}
      >
        {summary}
      </span>
    </li>
  );
}

/**
 * 긴 미션 텍스트 → 짧은 요약.
 * 예: "아이커·아이클타임 등 키성장 건기식 주요 브랜드의 2025~2026년 핵심 성분/메시지/타깃(포지셔닝) 및 시장 동향 비교"
 *  → "주요 브랜드의 핵심 성분/메시지/타깃 비교"
 *
 * 단순 길이 자르기보다 의미 있는 단어를 살리는 휴리스틱.
 */
function summarize(text: string): string {
  // 괄호 안 부연(...등, ...현상, (포지셔닝))은 제거하면 더 깔끔
  let s = text.replace(/\([^)]*\)/g, "").trim();
  // 다중 공백 정리
  s = s.replace(/\s+/g, " ");
  // 너무 길면 앞에서 자름 (보통 끝에 결론 키워드가 있어서 끝은 보존)
  // hover 시 전체 텍스트 보이니까 OK
  if (s.length > 60) {
    s = s.slice(0, 58) + "…";
  }
  return s;
}

// ───── 목차 항목 ─────

interface SectionRowProps {
  section: Section;
  isActive: boolean;
  onSelect: () => void;
  onWrite: () => void;
}

function SectionRow({ section, isActive, onSelect, onWrite }: SectionRowProps) {
  let bg = "transparent";
  let borderLeft = "2px solid transparent";
  let icon: React.ReactNode = (
    <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>○</span>
  );
  let titleColor = "var(--text-secondary)";
  let titleWeight = 400;

  if (section.status === "done") {
    bg = "var(--accent-success-bg)";
    borderLeft = "2px solid var(--accent-success)";
    icon = (
      <span
        style={{
          color: "var(--accent-success)",
          fontSize: 11,
          fontWeight: 500,
        }}
      >
        ✓
      </span>
    );
    titleColor = "var(--text-primary)";
  } else if (section.status === "writing") {
    bg = "var(--accent-info-bg)";
    borderLeft = "2px solid var(--accent-info)";
    icon = (
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "var(--accent-info)",
          display: "inline-block",
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
    );
    titleColor = "var(--accent-info)";
    titleWeight = 500;
  }

  if (isActive && section.status !== "writing") {
    borderLeft = "2px solid var(--text-primary)";
  }

  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: "var(--radius-sm)",
        background: bg,
        borderLeft,
        cursor: "pointer",
        transition: "background 0.15s",
      }}
    >
      <span
        style={{
          width: 12,
          display: "inline-flex",
          justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: 12,
          flex: 1,
          color: titleColor,
          fontWeight: titleWeight,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={section.title}
      >
        {section.id}. {section.title}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onWrite();
        }}
        style={{
          fontSize: 10,
          padding: "2px 7px",
          border: "0.5px solid var(--border-default)",
          borderRadius: 4,
          background: "var(--bg-surface)",
          color: "var(--text-secondary)",
          fontWeight: 500,
        }}
        title="이 섹션 집필"
      >
        write
      </button>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
