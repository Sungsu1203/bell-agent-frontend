// components/WorkflowStepper.tsx
"use client";

import { WorkflowState, WorkflowStep } from "@/lib/data";

interface WorkflowStepperProps {
  workflow: WorkflowState;
}

interface StepDef {
  key: WorkflowStep;
  label: string;
  /**
   * 각 단계의 하단 부연 정보.
   * workflow의 동적 값을 사용해 실제 백엔드 데이터와 연동.
   */
  getSubtext: (w: WorkflowState) => string;
  isComplete: (w: WorkflowState) => boolean;
}

const STEPS: StepDef[] = [
  {
    key: "prepare",
    label: "자료 준비",
    getSubtext: (w) =>
      w.filesLearned > 0 ? `${w.filesLearned}개 학습됨` : "자료 없음",
    isComplete: (w) => w.prepareCompleted,
  },
  {
    key: "mission",
    label: "미션 확인",
    getSubtext: (w) =>
      w.objectivesCount > 0 ? `${w.objectivesCount}개 목표` : "미설정",
    isComplete: (w) => w.missionCompleted,
  },
  {
    key: "outline",
    label: "목차 설계",
    getSubtext: (w) => `${w.sectionsTotal}개 섹션`,
    isComplete: (w) => w.outlineCompleted,
  },
  {
    key: "write",
    label: "섹션 집필",
    getSubtext: (w) => `${w.writeProgress.done} / ${w.writeProgress.total}`,
    isComplete: (w) => w.writeProgress.done === w.writeProgress.total && w.writeProgress.total > 0,
  },
  {
    key: "review",
    label: "검수·다운로드",
    getSubtext: (w) => (w.reviewCompleted ? "완료" : "대기 중"),
    isComplete: (w) => w.reviewCompleted,
  },
];

type StepState = "done" | "current" | "pending";

function getStepState(
  step: StepDef,
  index: number,
  workflow: WorkflowState
): StepState {
  if (step.isComplete(workflow)) return "done";
  if (step.key === workflow.currentStep) return "current";
  const currentIdx = STEPS.findIndex((s) => s.key === workflow.currentStep);
  if (index === currentIdx) return "current";
  return "pending";
}

export function WorkflowStepper({ workflow }: WorkflowStepperProps) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "0.5px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`,
          gap: 0,
        }}
      >
        {STEPS.map((step, idx) => {
          const state = getStepState(step, idx, workflow);
          const isFirst = idx === 0;
          const isLast = idx === STEPS.length - 1;

          let circleBg = "var(--bg-muted)";
          let circleColor = "var(--text-tertiary)";
          let circleBorder = "0.5px solid var(--border-default)";
          let circleContent: React.ReactNode = idx + 1;
          let labelColor = "var(--text-tertiary)";
          let subtextColor = "var(--text-tertiary)";
          let labelWeight = 400;

          if (state === "done") {
            circleBg = "var(--accent-success-bg)";
            circleColor = "var(--accent-success)";
            circleBorder = "none";
            circleContent = "✓";
            labelColor = "var(--text-primary)";
            subtextColor = "var(--text-secondary)";
            labelWeight = 500;
          } else if (state === "current") {
            circleBg = "var(--accent-info-bg)";
            circleColor = "var(--accent-info)";
            circleBorder = "none";
            circleContent = idx + 1;
            labelColor = "var(--accent-info)";
            subtextColor = "var(--text-secondary)";
            labelWeight = 500;
          }

          const leftLineColor =
            idx > 0 && getStepState(STEPS[idx - 1], idx - 1, workflow) === "done"
              ? "var(--border-default)"
              : "var(--border-subtle)";
          const rightLineColor =
            state === "done" ? "var(--border-default)" : "var(--border-subtle)";

          return (
            <div
              key={step.key}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "0 4px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: isFirst ? "transparent" : leftLineColor,
                  }}
                />
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: circleBg,
                    color: circleColor,
                    border: circleBorder,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 500,
                    flexShrink: 0,
                    boxShadow:
                      state === "current"
                        ? "0 0 0 3px var(--accent-info-bg)"
                        : "none",
                  }}
                >
                  {circleContent}
                </div>
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: isLast ? "transparent" : rightLineColor,
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 10,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: labelWeight,
                    color: labelColor,
                  }}
                >
                  {step.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: subtextColor,
                    marginTop: 2,
                  }}
                >
                  {step.getSubtext(workflow)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
