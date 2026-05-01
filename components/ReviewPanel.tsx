// components/ReviewPanel.tsx
// 보고서 검토(Review) 단계 화면.
// - 코드 기반 자동 점검 결과 (완성도/인용/구조)
// - 섹션별 상세 (펼치기)
// - "AI 검토 시작" 버튼 (placeholder, 다음 단계에서 활성화)

"use client";

import { useState } from "react";
import { ReportReview, SectionReview } from "@/lib/data";

interface Props {
  review: ReportReview;
}

// 합격/불합격 점 + 색상
function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: ok
          ? "var(--accent-success, #2a8)"
          : "var(--accent-warning, #d68)",
        marginRight: 8,
      }}
    />
  );
}

// 요약 카드 (3개 항목)
function SummaryCard({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--bg-surface)",
        border: "0.5px solid var(--border-subtle, #ddd)",
        borderRadius: "var(--radius-md, 6px)",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontWeight: 600,
          fontSize: 13,
          color: "var(--text-primary)",
          marginBottom: 6,
        }}
      >
        <StatusDot ok={ok} />
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          marginLeft: 18,
        }}
      >
        {detail}
      </div>
    </div>
  );
}

// 섹션 한 개 행
function SectionRow({ s }: { s: SectionReview }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderBottom: "0.5px solid var(--border-subtle, #eee)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-primary)",
          marginBottom: 4,
        }}
      >
        <StatusDot ok={s.hasBody && s.warnings.length === 0} />
        <span>
          {s.id}. {s.title}
        </span>
      </div>
      {s.hasBody ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            marginLeft: 18,
            lineHeight: 1.6,
          }}
        >
          {s.charCount.toLocaleString()}자 ・ 인용 {s.citationCount}개
          {s.recommendationCount > 0 &&
            ` ・ 권장 ${s.recommendationCount}개`}
          {s.hasReferences ? " ・ 참고 문헌 ✓" : ""}
        </div>
      ) : (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted, #999)",
            marginLeft: 18,
            fontStyle: "italic",
          }}
        >
          아직 작성되지 않음
        </div>
      )}
      {s.warnings.length > 0 && (
        <ul
          style={{
            margin: "6px 0 0 18px",
            padding: 0,
            listStyle: "none",
            fontSize: 12,
            color: "var(--accent-warning, #c80)",
          }}
        >
          {s.warnings.map((w, i) => (
            <li key={i} style={{ padding: "2px 0" }}>
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReviewPanel({ review }: Props) {
  const [expanded, setExpanded] = useState(true);

  // 디테일 문구 만들기
  const completenessDetail = `${review.completedSections} / ${review.totalSections} 섹션 작성됨`;
  const citationsDetail = review.citationsOk
    ? `총 ${review.totalCitations}개 인용`
    : `일부 섹션에 인용 없음 (총 ${review.totalCitations}개)`;
  const structureDetail = (() => {
    if (review.completedSections === 0) return "검사할 섹션 없음";
    const missing = review.sections
      .filter((s) => s.hasBody)
      .filter((s) => s.recommendationCount === 0 || !s.hasReferences).length;
    return missing === 0
      ? "모든 섹션에 권장사항 + 참고문헌 ✓"
      : `${missing}개 섹션에 권장사항/참고문헌 보강 필요`;
  })();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "0 4px",
      }}
    >
      {/* 헤더 */}
      <div>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: 0,
            marginBottom: 4,
          }}
        >
          보고서 검토
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            margin: 0,
          }}
        >
          작성된 섹션을 자동으로 점검합니다. 빨간 점은 보강이 필요한 항목입니다.
        </p>
      </div>

      {/* 전체 경고 */}
      {review.globalWarnings.length > 0 && (
        <div
          style={{
            background: "var(--accent-warning-bg, #fff8e1)",
            color: "var(--accent-warning, #c80)",
            padding: "10px 14px",
            borderRadius: "var(--radius-md, 6px)",
            fontSize: 13,
            border: "0.5px solid var(--accent-warning, #c80)",
          }}
        >
          {review.globalWarnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      {/* 요약 카드 3개 */}
      <div style={{ display: "flex", gap: 10 }}>
        <SummaryCard
          label="완성도"
          ok={review.completenessOk}
          detail={completenessDetail}
        />
        <SummaryCard
          label="인용 품질"
          ok={review.citationsOk}
          detail={citationsDetail}
        />
        <SummaryCard
          label="구조적 완성도"
          ok={review.structureOk}
          detail={structureDetail}
        />
      </div>

      {/* 섹션별 상세 */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "0.5px solid var(--border-subtle, #ddd)",
          borderRadius: "var(--radius-md, 6px)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            cursor: "pointer",
            userSelect: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: expanded
              ? "0.5px solid var(--border-subtle, #eee)"
              : "none",
          }}
          onClick={() => setExpanded((v) => !v)}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: "var(--text-primary)",
            }}
          >
            {expanded ? "▼" : "▶"} 섹션별 상세
          </span>
          <span
            style={{ fontSize: 12, color: "var(--text-secondary)" }}
          >
            총 {review.totalCharCount.toLocaleString()}자
          </span>
        </div>
        {expanded && (
          <div>
            {review.sections.map((s) => (
              <SectionRow key={s.id} s={s} />
            ))}
          </div>
        )}
      </div>

      {/* AI 검토 버튼 (placeholder) */}
      <div
        style={{
          marginTop: 8,
          padding: "16px 18px",
          background: "var(--bg-surface)",
          border: "0.5px dashed var(--border-subtle, #ccc)",
          borderRadius: "var(--radius-md, 6px)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginBottom: 8,
          }}
        >
          더 깊은 검토가 필요하신가요?
        </div>
        <button
          disabled
          title="다음 업데이트에서 활성화됩니다"
          style={{
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 500,
            background: "var(--bg-page)",
            border: "0.5px solid var(--border-subtle, #ccc)",
            borderRadius: 4,
            color: "var(--text-muted, #999)",
            cursor: "not-allowed",
          }}
        >
          AI 심층 검토 시작 (준비 중)
        </button>
      </div>
    </div>
  );
}