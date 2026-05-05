// app/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { Sidebar } from "@/components/Sidebar";
import { ReportCanvas } from "@/components/ReportCanvas";
import { SourcePanel } from "@/components/SourcePanel";
import { LogPanel } from "@/components/LogPanel";
import { ReviewPanel } from "@/components/ReviewPanel";
import {
  Section,
  WorkflowState,
  Project,
  buildSections,
  buildWorkflow,
  buildProject,
  reviewReport,    // ← 추가
} from "@/lib/data";
import {
  fetchOutline,
  fetchFiles,
  fetchState,
  fetchFileContent,
  runCommand,
  StateResponse,
} from "@/lib/api";
import { FootnoteDef, findMatchingFootnote } from "@/lib/markdown";

const POLL_INTERVAL_RUNNING = 2000;
const POLL_INTERVAL_IDLE = 8000;

export default function Page() {
  const [sections, setSections] = useState<Section[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<number>(1);
  const [workflow, setWorkflow] = useState<WorkflowState>({
    currentStep: "prepare",
    prepareCompleted: false,
    missionCompleted: false,
    outlineCompleted: false,
    writeProgress: { done: 0, total: 0 },
    reviewCompleted: false,
    filesLearned: 0,
    objectivesCount: 0,
    sectionsTotal: 0,
  });
  const [project, setProject] = useState<Project>({
    title: "(불러오는 중)",
    period: "",
    filesLearned: 0,
    lastUpdated: "—",
    objectives: [],
  });
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeBody, setActiveBody] = useState<string | undefined>(undefined);
  const [bodyLoading, setBodyLoading] = useState(false);

  // ───── 출처 패널 상태 ─────
  const [footnotes, setFootnotes] = useState<FootnoteDef[]>([]);
  const [activeSource, setActiveSource] = useState<string | null>(null);

  // 사용자가 명시적으로 보고 있는 단계 (자동 계산 override)
  const [stepOverride, setStepOverride] = useState<string | null>(null);

    // 모든 섹션 본문 캐시 (검토 단계용)
  const [allBodies, setAllBodies] = useState<Record<number, string>>({});

  // 활성 섹션 바뀌면 패널 닫기
  useEffect(() => {
    setActiveSource(null);
  }, [activeSectionId]);

  const refreshAll = useCallback(async () => {
    try {
      setError(null);
      const [outlineRes, filesRes, stateRes] = await Promise.all([
        fetchOutline(),
        fetchFiles("artifact", 200),
        fetchState(),
      ]);

      const newSections = buildSections(
        outlineRes.items,
        filesRes.files,
        stateRes
      );
      setSections(newSections);
      setState(stateRes);
      setProject(buildProject(stateRes, filesRes.files.length));

      const objectivesCount = stateRes.objectives?.length ?? 0;

      setWorkflow(
        buildWorkflow(
          stateRes,
          filesRes.files.length,
          outlineRes.source,
          newSections,
          objectivesCount
        )
      );

      setActiveSectionId((prev) => {
        if (prev !== 1) return prev;
        const firstDone = newSections.find((s) => s.status === "done");
        return firstDone?.id ?? 1;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`백엔드 통신 실패: ${msg}`);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const isWorking =
      state?.phase === "running" || state?.phase === "writing";
    const interval = isWorking ? POLL_INTERVAL_RUNNING : POLL_INTERVAL_IDLE;
    const timer = setInterval(refreshAll, interval);
    return () => clearInterval(timer);
  }, [state?.phase, refreshAll]);

  useEffect(() => {
    const active = sections.find((s) => s.id === activeSectionId);
    if (!active || !active.fileId) {
      setActiveBody(undefined);
      return;
    }
    let cancelled = false;
    setBodyLoading(true);
    fetchFileContent(active.fileId)
      .then((text) => {
        if (!cancelled) setActiveBody(text);
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setActiveBody(`(본문을 불러올 수 없습니다: ${msg})`);
        }
      })
      .finally(() => {
        if (!cancelled) setBodyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSectionId, sections]);

  // 모든 섹션 본문을 한 번에 fetch (검토 단계용)
  // sections가 바뀔 때마다 실행 — 새 섹션이 작성되면 자동 갱신
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      const results: Record<number, string> = {};
      await Promise.all(
        sections
          .filter((s) => s.fileId)
          .map(async (s) => {
            try {
              const text = await fetchFileContent(s.fileId!);
              if (!cancelled) results[s.id] = text;
            } catch {
              // 개별 섹션 실패는 조용히 무시 (다른 섹션 검토는 계속)
            }
          })
      );
      if (!cancelled) setAllBodies(results);
    };
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [sections]);

  const handleWriteSection = async (id: number) => {
    setActiveSectionId(id);
    const target = sections.find((s) => s.id === id);
    if (!target) return;
    try {
      await runCommand({
        input: `write: ${target.title}`,    // ✅ fast-path 발동!
        options: {},
      });
      refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`집필 명령 실패: ${msg}`);
    }
  };

  const handleUpdateRag = async () => {
    try {
      await runCommand({
        input: "최신 자료로 RAG 업데이트",
        options: {},
      });
      refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`RAG 업데이트 실패: ${msg}`);
    }
  };

  const handleRunCommand = async (input: string) => {
    if (!input.trim()) return;
    try {
      await runCommand({ input, options: {} });
      refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`명령 실행 실패: ${msg}`);
    }
  };

  const activeSection = sections.find((s) => s.id === activeSectionId);
  const sectionWithBody: Section | undefined = activeSection
    ? { ...activeSection, body: activeBody }
    : undefined;

  // 검토 단계용: 모든 섹션 본문 맵 (현재 활성 섹션만 실제 body 있음)
  // 다른 섹션은 fileId만 있으면 검사할 수 있도록 빈 문자열로 처리
  // 검토용 bodyMap:
  //  - 활성 섹션은 최신 activeBody 우선 (실시간 반영)
  //  - 그 외 섹션은 캐시(allBodies)
  //  - 캐시도 없으면 undefined → 검토 함수가 "본문 비어있음"으로 처리
  const bodyMap: Record<number, string | undefined> = {};
  for (const s of sections) {
    if (s.id === activeSectionId && activeBody !== undefined) {
      bodyMap[s.id] = activeBody;
    } else if (allBodies[s.id]) {
      bodyMap[s.id] = allBodies[s.id];
    } else {
      bodyMap[s.id] = undefined;
    }
  }
  const review = reviewReport(sections, bodyMap);
  // 검토 단계 표시 여부:
  // - stepOverride가 있으면 그걸 우선 (사용자가 명시적으로 클릭한 경우)
  // - 없으면 자동 계산 (모든 섹션 작성 완료 시 자동 진입)
  const effectiveStep = stepOverride ?? workflow.currentStep;
  const isReviewStep = effectiveStep === "review";

  const headerStatus: "idle" | "writing" | "error" = error
    ? "error"
    : state?.phase === "running" || state?.phase === "writing"
    ? "writing"
    : "idle";

  // 출처 패널의 실제 footnote 매칭
  const matchedFootnote = activeSource
    ? findMatchingFootnote(activeSource, footnotes)
    : null;

  const isPanelOpen = activeSource !== null;

  // 푸시 레이아웃: 패널 열렸을 때 보고서 + 출처 패널이 나란히
  const mainGridCols = isPanelOpen
    ? "240px minmax(0, 1fr) 360px"
    : "240px minmax(0, 1fr)";

  return (
    <div
      style={{
        background: "var(--bg-page)",
        minHeight: "100vh",
        padding: "16px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 1600,
          margin: "0 auto",
        }}
      >
        <Header project={project} status={headerStatus} />

        {error && (
          <div
            style={{
              background: "var(--accent-warning-bg)",
              color: "var(--accent-warning)",
              padding: "10px 16px",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
              border: "0.5px solid var(--accent-warning)",
            }}
          >
            ⚠ {error}
            <button
              onClick={() => {
                setError(null);
                refreshAll();
              }}
              style={{
                marginLeft: 12,
                fontSize: 11,
                padding: "3px 10px",
                background: "var(--bg-surface)",
                border: "0.5px solid var(--accent-warning)",
                borderRadius: 4,
                color: "var(--accent-warning)",
                fontWeight: 500,
              }}
            >
              다시 시도
            </button>
          </div>
        )}

        <WorkflowStepper
          workflow={workflow}
          onStepClick={(step) => {
            // review 단계는 검토 화면, 그 외는 모두 작성 화면
            setStepOverride(step === "review" ? "review" : "write");
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: mainGridCols,
            gap: 10,
            marginTop: 4,
            transition: "grid-template-columns 0.25s ease",
          }}
        >
          <Sidebar
            project={project}
            sections={sections}
            activeSectionId={activeSectionId}
            onSelectSection={(id) => {
              setActiveSectionId(id);
              setStepOverride("write"); // 섹션 선택 시 Write 모드로
            }}
            onWriteSection={handleWriteSection}
            onUpdateRag={handleUpdateRag}
          />
          {isReviewStep ? (
            <div
              style={{
                background: "var(--bg-surface)",
                border: "0.5px solid var(--border-subtle, #ddd)",
                borderRadius: "var(--radius-md, 6px)",
                padding: "20px 24px",
                minHeight: 400,
              }}
            >
              <ReviewPanel review={review} />
            </div>
          ) : (
            <ReportCanvas
              section={sectionWithBody}
              bodyLoading={bodyLoading}
              onCitationClick={(source) => setActiveSource(source)}
              onCommandSubmit={handleRunCommand}
              onFootnotesChange={setFootnotes}
            />
          )}
          {isPanelOpen && (
            <SourcePanel
              source={activeSource!}
              footnote={matchedFootnote}
              onClose={() => setActiveSource(null)}
            />
          )}
        </div>
      </div>

      <LogPanel />  {/* ← ✨ 이 줄 추가 */}
    </div>
  );
}
