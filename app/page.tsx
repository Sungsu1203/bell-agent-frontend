// app/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { Sidebar } from "@/components/Sidebar";
import { ReportCanvas } from "@/components/ReportCanvas";
import { SourcePanel } from "@/components/SourcePanel";
import { ChatResponsePanel, ChatStatus } from "@/components/ChatResponsePanel";
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
  fetchSectionRefs,
  runCommand,
  SectionRefEntry,
  StateResponse,
} from "@/lib/api";
import { FootnoteDef, findMatchingFootnote } from "@/lib/markdown";

const POLL_INTERVAL_RUNNING = 3000;
const POLL_INTERVAL_IDLE = 15000;

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
  // §12-16: 활성 섹션의 marker → chunk 메타 (사이드카 .refs.json)
  const [activeRefs, setActiveRefs] = useState<Record<string, SectionRefEntry>>({});

  // 사용자가 명시적으로 보고 있는 단계 (자동 계산 override)
  const [stepOverride, setStepOverride] = useState<string | null>(null);

  // ───── 명령 응답 패널 상태 ─────
  // 명령 실행 시 우측 슬롯에 응답을 띄움. null 이면 닫힘.
  const [activeChat, setActiveChat] = useState<{
    query: string;
    status: ChatStatus;
    message?: string;
    error?: string;
  } | null>(null);

    // 모든 섹션 본문 캐시 (검토 단계용)
  const [allBodies, setAllBodies] = useState<Record<number, string>>({});

  // 활성 섹션 / 파일 ID — effect dep 안정화용
  // sections 배열은 폴링마다 새 ref라 그대로 dep로 쓰면 effect가 매번 재실행됨
  const activeSection = sections.find((s) => s.id === activeSectionId);
  const activeFileId = activeSection?.fileId;
  const activeStatus = activeSection?.status;
  // §12-14: 동일 fileId 라도 백엔드 파일 갱신 시 mtime 변화 → 본문 재fetch 트리거.
  const activeFileMtime = activeSection?.fileMtime;

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
    if (!activeFileId) {
      setActiveBody(undefined);
      return;
    }
    let cancelled = false;
    setBodyLoading(true);
    // setActiveBody(undefined) 호출하지 않음 — fetch 완료 전까지 기존 본문 유지해 깜빡임 방지
    fetchFileContent(activeFileId)
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
  }, [activeSectionId, activeFileId, activeStatus, activeFileMtime]);

  // §12-16: 활성 섹션의 사이드카 .refs.json fetch — 본문 fetch 와 같은 dep 시그니처 사용.
  // §12-17: summary 가 백그라운드로 채워지므로 모든 marker 가 summary 갖출 때까지 short-poll (4s).
  // 모든 summary 완료되면 자동 종료. 사이드카 부재(옛 섹션)는 빈 맵으로 즉시 종료.
  useEffect(() => {
    if (!activeFileId) {
      setActiveRefs({});
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const refs = await fetchSectionRefs(activeFileId);
        if (cancelled) return;
        setActiveRefs(refs);
        const entries = Object.values(refs);
        const allDone =
          entries.length === 0 || entries.every((e) => Boolean(e.summary));
        if (!allDone) {
          timer = setTimeout(tick, 4000);
        }
      } catch {
        if (!cancelled) setActiveRefs({});
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeSectionId, activeFileId, activeStatus, activeFileMtime]);

  // 모든 섹션 본문을 한 번에 fetch (검토 단계용)
  // fileId+mtime 시그니처가 바뀔 때만 재실행 — sections ref 변동에 흔들리지 않음
  // §12-14: mtime 포함 → 동일 fileId 라도 백엔드 파일 갱신 시 캐시 갱신.
  const fileIdSig = sections
    .map((s) => `${s.id}:${s.fileId ?? ""}:${s.fileMtime ?? ""}`)
    .join("|");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileIdSig]);

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
    const query = input.trim();
    if (!query) return;
    // 명령 응답 패널을 우측에 띄우기 위해 출처 패널은 닫고 로딩으로 시작
    setActiveSource(null);
    setActiveChat({ query, status: "loading" });
    try {
      const res = await runCommand({ input: query, options: {} });
      setActiveChat({
        query,
        status: "ok",
        message: res?.message ?? "(빈 응답)",
      });
      refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setActiveChat({ query, status: "error", error: msg });
    }
  };

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

  // 우측 슬롯은 한 번에 하나만: chat 가 출처보다 우선 (명령 실행이 더 최근 상호작용)
  const isChatOpen = activeChat !== null;
  const isSourceOpen = activeSource !== null && !isChatOpen;
  const isPanelOpen = isChatOpen || isSourceOpen;

  // 푸시 레이아웃: 패널 열렸을 때 보고서 + 우측 패널이 나란히
  const mainGridCols = isPanelOpen
    ? "240px minmax(0, 1fr) 360px"
    : "240px minmax(0, 1fr)";

  return (
    <div
      style={{
        background: "var(--bg-page)",
        height: "100vh",
        padding: "16px 20px 44px 20px",  // bottom: LogPanel(접힘) 높이 확보
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 1600,
          margin: "0 auto",
          width: "100%",
          flex: 1,
          minHeight: 0,
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
            flex: 1,
            minHeight: 0,
          }}
        >
          <div style={{ overflow: "auto", minHeight: 0 }}>
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
              currentProvider={state?.current_provider}
            />
          </div>
          {isReviewStep ? (
            <div
              style={{
                background: "var(--bg-surface)",
                border: "0.5px solid var(--border-subtle, #ddd)",
                borderRadius: "var(--radius-md, 6px)",
                padding: "20px 24px",
                overflow: "auto",
                minHeight: 0,
              }}
            >
              <ReviewPanel review={review} />
            </div>
          ) : (
            <ReportCanvas
              section={sectionWithBody}
              bodyLoading={bodyLoading}
              onCitationClick={(source) => {
                // 인용 칩 클릭 시 chat 패널은 닫고 출처 패널 표시
                setActiveChat(null);
                setActiveSource(source);
              }}
              onCommandSubmit={handleRunCommand}
              onFootnotesChange={setFootnotes}
            />
          )}
          {isPanelOpen && (
            <div style={{ overflow: "auto", minHeight: 0 }}>
              {isChatOpen ? (
                <ChatResponsePanel
                  query={activeChat!.query}
                  status={activeChat!.status}
                  message={activeChat!.message}
                  error={activeChat!.error}
                  onClose={() => setActiveChat(null)}
                />
              ) : (
                <SourcePanel
                  source={activeSource!}
                  footnote={matchedFootnote}
                  refEntry={
                    matchedFootnote ? activeRefs[matchedFootnote.marker] ?? null : null
                  }
                  onClose={() => setActiveSource(null)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <LogPanel />  {/* ← ✨ 이 줄 추가 */}
    </div>
  );
}
