// app/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { Sidebar } from "@/components/Sidebar";
import { ReportCanvas } from "@/components/ReportCanvas";
import { SourcePanel } from "@/components/SourcePanel";
import { LogPanel } from "@/components/LogPanel";
import {
  Section,
  WorkflowState,
  Project,
  SECTION_SUBTITLES,
  buildSections,
  buildWorkflow,
  buildProject,
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

        <WorkflowStepper workflow={workflow} />

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
            onSelectSection={setActiveSectionId}
            onWriteSection={handleWriteSection}
            onUpdateRag={handleUpdateRag}
          />
          <ReportCanvas
            section={sectionWithBody}
            subtitle={SECTION_SUBTITLES[activeSectionId]}
            bodyLoading={bodyLoading}
            onCitationClick={(source) => setActiveSource(source)}
            onCommandSubmit={handleRunCommand}
            onFootnotesChange={setFootnotes}
          />
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
