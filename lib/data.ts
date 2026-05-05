// lib/data.ts
// UI 타입 정의 + 백엔드 응답을 UI 타입으로 변환하는 헬퍼

import type { StateResponse, FileMeta } from "./api";

export type SectionStatus = "done" | "writing" | "pending";

export interface Section {
  id: number;
  title: string;
  rawTitle: string;
  status: SectionStatus;
  body?: string;
  fileId?: string;
}

export interface Project {
  title: string;
  period: string;
  filesLearned: number;
  lastUpdated: string;
  objectives: string[];
}

export type WorkflowStep = "prepare" | "mission" | "outline" | "write" | "review";

export interface WorkflowState {
  currentStep: WorkflowStep;
  prepareCompleted: boolean;
  missionCompleted: boolean;
  outlineCompleted: boolean;
  writeProgress: { done: number; total: number };
  reviewCompleted: boolean;

  filesLearned: number;
  objectivesCount: number;
  sectionsTotal: number;
}

// ───── 변환 헬퍼 ─────

export function parseTitle(raw: string): string {
  let s = raw.replace(/^#+\s*/, "");
  s = s.replace(/^\d+[.)]\s*/, "");
  return s.trim();
}

// 한글/영어 제목을 파일명 슬러그로 변환.
// 백엔드 utils/text_utils.py 의 slugify(allow_unicode=True) 와 동일한 결과를 내야 한다.
// 백엔드 규칙: NFKC 정규화 → 소문자 → 공백을 하이픈 → 화이트리스트(_ALLOWED_UNI=[^0-9a-z가-힣\-]) 외 모두 제거.
// 화이트리스트 방식이라 중점(·)·괄호·구두점·이모지 등이 한 번에 제거되어, 새로운 특수문자가 들어와도 동기화 유지됨.
// 변경 시 백엔드 utils/text_utils.py:_ALLOWED_UNI 와 동시 갱신 필수 (README-dev.md §7-2 / §12-8 참조).
function slugifyTitle(title: string): string {
  return title
    .normalize("NFKC")                  // 백엔드 NFKC 정규화와 일치
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")               // 공백 → 하이픈 (화이트리스트 적용 전)
    .replace(/[^0-9a-z가-힣\-]+/g, "")  // 백엔드 _ALLOWED_UNI 화이트리스트와 일치
    .replace(/-+/g, "-")                // 연속 하이픈 압축
    .replace(/^-|-$/g, "");             // 양끝 하이픈 제거
}

// 파일명 → 섹션 ID. 두 가지 방식 시도:
//   1차: "1-executive-summary.md" 같은 옛날 형식 (파일명 앞에 숫자)
//   2차: "executive-summary.md" 같은 새 형식 (제목 슬러그 매칭)
export function extractSectionIdFromFile(
  file: FileMeta,
  outlineItems: string[] = []
): number | null {
  // 1차 시도: 파일명 앞 숫자 ("1-...", "2_..." 등)
  const numMatch = file.name.match(/^(\d{1,2})[-_]/);
  if (numMatch) {
    return parseInt(numMatch[1], 10);
  }

  // 2차 시도: 제목 슬러그로 매칭
  // 파일명에서 .md 확장자 떼고 슬러그 추출
  const fileSlug = file.name.replace(/\.md$/i, "").toLowerCase();

  for (let i = 0; i < outlineItems.length; i++) {
    const titleSlug = slugifyTitle(parseTitle(outlineItems[i]));
    if (titleSlug && fileSlug === titleSlug) {
      return i + 1;  // outline은 0-based, 섹션은 1-based
    }
  }

  return null;
}

export function buildSections(
  outlineItems: string[],
  files: FileMeta[],
  state: StateResponse | null
): Section[] {
  const fileBySection = new Map<number, FileMeta>();
  // 최신 파일이 우선 매칭되도록 mtime 내림차순 정렬
  const sortedFiles = [...files].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
  for (const f of sortedFiles) {
    const id = extractSectionIdFromFile(f, outlineItems);
    if (id !== null && !fileBySection.has(id)) {
      fileBySection.set(id, f);
    }
  }

  const sections: Section[] = outlineItems.map((raw, idx) => {
    const id = idx + 1;
    const file = fileBySection.get(id);
    const isDone = !!file;

    return {
      id,
      title: parseTitle(raw),
      rawTitle: raw,
      status: isDone ? "done" : "pending",
      fileId: file?.id,
    };
  });

  if (state && state.phase !== "idle") {
    const firstPending = sections.findIndex((s) => s.status === "pending");
    if (firstPending !== -1) {
      sections[firstPending].status = "writing";
    }
  }

  return sections;
}

export function buildWorkflow(
  state: StateResponse | null,
  filesCount: number,
  outlineSource: "topic" | "default" | "empty" | null,
  sections: Section[],
  objectivesCount: number
): WorkflowState {
  const sectionsDone = sections.filter((s) => s.status === "done").length;
  const sectionsTotal = sections.length;
  const phase = state?.phase ?? "idle";

  const prepareCompleted = filesCount > 0;
  const missionCompleted = objectivesCount > 0;
  const outlineCompleted = sectionsTotal > 0;
  const writeFullyDone = sectionsTotal > 0 && sectionsDone >= sectionsTotal;
  const reviewCompleted = false;

  let currentStep: WorkflowStep = "prepare";
  if (prepareCompleted) currentStep = "mission";
  if (missionCompleted) currentStep = "outline";
  if (outlineCompleted) currentStep = "write";
  if (writeFullyDone) currentStep = "review";
  if (phase === "writing" || phase === "running") currentStep = "write";

  return {
    currentStep,
    prepareCompleted,
    missionCompleted,
    outlineCompleted,
    writeProgress: { done: sectionsDone, total: sectionsTotal },
    reviewCompleted,
    filesLearned: filesCount,
    objectivesCount,
    sectionsTotal,
  };
}

export function buildProject(
  state: StateResponse | null,
  filesCount: number
): Project {
  const topicTitle = state?.flags.topic_title ?? "(프로젝트 미설정)";

  const periodMatch = topicTitle.match(/(\d{4}[~~–-]?\d{0,4})\s*$/);
  const period = periodMatch ? periodMatch[1].replace(/[~–-]/g, "–") : "";
  const cleanTitle = periodMatch
    ? topicTitle.slice(0, periodMatch.index).trim()
    : topicTitle;

  let lastUpdated = "—";
  if (state?.updated_at) {
    lastUpdated = formatRelativeTime(state.updated_at);
  }

  return {
    title: cleanTitle,
    period,
    filesLearned: filesCount,
    lastUpdated,
    objectives: state?.objectives ?? [],
  };
}

export function formatRelativeTime(timestamp: string): string {
  const t = Date.parse(timestamp.replace(" ", "T"));
  if (isNaN(t)) return timestamp;
  const diffSec = Math.max(0, (Date.now() - t) / 1000);
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  return `${Math.floor(diffSec / 86400)}일 전`;
}

// ─────────────────────────────────────────────
// 보고서 검토(Review) — 코드만으로 가능한 자동 점검
// ─────────────────────────────────────────────

export interface SectionReview {
  id: number;
  title: string;
  hasBody: boolean;
  charCount: number;
  citationCount: number;        // 본문에 [...] 패턴 개수
  recommendationCount: number;  // "Recommendation" / "권장" 항목 개수
  hasReferences: boolean;       // "참고 문헌" 또는 "각주" 섹션 있나
  warnings: string[];           // 사람이 읽을 경고 메시지들
}

export interface ReportReview {
  // 요약 통계
  totalSections: number;
  completedSections: number;
  totalCharCount: number;
  totalCitations: number;
  // 항목별 합격/불합격
  completenessOk: boolean;
  citationsOk: boolean;
  structureOk: boolean;
  // 섹션별 상세
  sections: SectionReview[];
  // 전체 경고
  globalWarnings: string[];
}

// 본문 한 개를 분석
function reviewSection(
  id: number,
  title: string,
  body: string | undefined
): SectionReview {
  const text = body ?? "";
  const hasBody = text.trim().length > 0;
  const charCount = text.length;

  // 인용 개수: [foo.pptx] 또는 [news.com] 같은 대괄호 인용 카운트
  // 단, [^1] 같은 footnote 마커, [X]%·[Y]%p 같은 KPI 자리표시자는 제외.
  // 진짜 인용은 파일명/URL이라 내부에 `.`, `_`, `/` 중 하나는 반드시 포함됨.
  const citationMatches =
    text.match(/\[(?!\^)[^\]\n]*[._/][^\]\n]*\]/g) ?? [];
  const citationCount = citationMatches.length;

  // Recommendation 개수: "Actionable Recommendations" 섹션 안의 번호 리스트.
  // 헤딩에 "### 3.4. Actionable Recommendations"처럼 번호가 끼어드는 경우가 있어
  // 키워드 앞에 선택적 숫자 prefix(예: "3.4.", "7.")를 허용한다.
  let recommendationCount = 0;
  const recSection = text.match(
    /###?\s*(?:\d+(?:\.\d+)*\.?\s*)?(?:Actionable\s*Recommendations|권장\s*사항|실행\s*권장)[\s\S]*?(?=\n##|\n---|$)/i
  );
  if (recSection) {
    const items = recSection[0].match(/^\s*\d+\./gm) ?? [];
    recommendationCount = items.length;
  }

  // 참고 문헌 섹션 있나 (헤딩 번호 prefix 허용)
  const hasReferences =
    /###?\s*(?:\d+(?:\.\d+)*\.?\s*)?(?:참고\s*문헌|각주|References)/i.test(text);

  // 경고 메시지 (사람이 읽을 수 있게)
  const warnings: string[] = [];
  if (!hasBody) {
    warnings.push("본문이 비어있습니다");
  } else {
    if (charCount < 500) warnings.push(`본문이 짧습니다 (${charCount}자)`);
    if (citationCount === 0) warnings.push("출처 인용이 없습니다");
    if (recommendationCount === 0)
      warnings.push("Actionable Recommendations가 없습니다");
    if (!hasReferences) warnings.push("참고 문헌 섹션이 없습니다");
  }

  return {
    id,
    title,
    hasBody,
    charCount,
    citationCount,
    recommendationCount,
    hasReferences,
    warnings,
  };
}

// 섹션 배열 + 본문 맵을 받아 전체 보고서 리뷰
export function reviewReport(
  sections: Section[],
  bodyMap: Record<number, string | undefined>
): ReportReview {
  const sectionReviews = sections.map((s) =>
    reviewSection(s.id, s.title, bodyMap[s.id])
  );

  const totalSections = sectionReviews.length;
  const completedSections = sectionReviews.filter((r) => r.hasBody).length;
  const totalCharCount = sectionReviews.reduce(
    (sum, r) => sum + r.charCount,
    0
  );
  const totalCitations = sectionReviews.reduce(
    (sum, r) => sum + r.citationCount,
    0
  );

  // 항목별 합격 기준
  const completenessOk =
    totalSections > 0 && completedSections === totalSections;
  // 인용: 모든 작성된 섹션에 최소 1개씩
  const citationsOk =
    sectionReviews.filter((r) => r.hasBody).every((r) => r.citationCount > 0);
  // 구조: 모든 작성된 섹션에 Recommendations 있고 참고 문헌 있음
  const structureOk = sectionReviews
    .filter((r) => r.hasBody)
    .every((r) => r.recommendationCount > 0 && r.hasReferences);

  // 전체 경고
  const globalWarnings: string[] = [];
  if (totalSections === 0) {
    globalWarnings.push("목차가 비어있습니다");
  } else if (completedSections === 0) {
    globalWarnings.push("아직 작성된 섹션이 없습니다");
  } else if (completedSections < totalSections) {
    globalWarnings.push(
      `${totalSections - completedSections}개 섹션이 아직 작성되지 않았습니다`
    );
  }

  return {
    totalSections,
    completedSections,
    totalCharCount,
    totalCitations,
    completenessOk,
    citationsOk,
    structureOk,
    sections: sectionReviews,
    globalWarnings,
  };
}