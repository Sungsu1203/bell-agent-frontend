// lib/providers.ts
// LLM provider 메타데이터 + 활성 provider 매칭 헬퍼.
// SettingsCard / ProviderGuideModal 에서 사용.

export type ProviderId =
  | "openai"
  | "anthropic-sonnet"
  | "anthropic-haiku"
  | "vertexai";

export interface ProviderMeta {
  id: ProviderId;
  provider: string;          // backend LLM_PROVIDER 값
  model: string;             // backend *_MODEL 값
  display_name_ko: string;
  display_name_en: string;
  label_ko: string;          // "운영 default · 빠름"
  label_en: string;          // "Default · Fast"
  cost: string;              // "~$0.12"
  latency: string;           // "35–172s"
  venv_dir: string;          // ".venv_openai"
  env_key: string;           // 변경 시 사용할 env 변수 — 모달 명령 박제용
  env_overlay_file: string;  // ".env.openai" — 시나리오 C 박제용
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "openai",
    provider: "openai",
    model: "gpt-4o",
    display_name_ko: "OpenAI (gpt-4o)",
    display_name_en: "OpenAI (gpt-4o)",
    label_ko: "운영 default · 빠름",
    label_en: "Default · Fast",
    cost: "~$0.12",
    latency: "35–172s",
    venv_dir: ".venv_openai",
    env_key: "OPENAI_MODEL",
    env_overlay_file: ".env.openai",
  },
  {
    id: "anthropic-sonnet",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    display_name_ko: "Anthropic (Sonnet 4.6)",
    display_name_en: "Anthropic (Sonnet 4.6)",
    label_ko: "상세 · 고비용",
    label_en: "Detailed · Premium",
    cost: "~$0.44",
    latency: "317s",
    venv_dir: ".venv_anthropic",
    env_key: "ANTHROPIC_MODEL",
    env_overlay_file: ".env.anthropic",
  },
  {
    id: "anthropic-haiku",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    display_name_ko: "Anthropic (Haiku 4.5)",
    display_name_en: "Anthropic (Haiku 4.5)",
    label_ko: "저렴 · 빠름",
    label_en: "Economical · Fast",
    cost: "~$0.13",
    latency: "140s",
    venv_dir: ".venv_anthropic",
    env_key: "ANTHROPIC_MODEL",
    env_overlay_file: ".env.anthropic",
  },
  {
    id: "vertexai",
    provider: "vertexai",
    model: "gemini-2.5-flash",
    display_name_ko: "Google (Gemini 2.5 Flash)",
    display_name_en: "Google (Gemini 2.5 Flash)",
    label_ko: "측정 예정",
    label_en: "TBD",
    cost: "측정 예정",
    latency: "측정 예정",
    venv_dir: ".venv_vertex",
    env_key: "LLM_MODEL",
    env_overlay_file: ".env.vertex",
  },
];

/**
 * /api/state 응답의 current_provider {provider, model} 로
 * PROVIDERS 의 1개 항목 매칭. 매칭 실패 시 null.
 */
export function matchActiveProvider(
  provider: string | undefined,
  model: string | undefined
): ProviderMeta | null {
  if (!provider || !model) return null;
  return (
    PROVIDERS.find((p) => p.provider === provider && p.model === model) ?? null
  );
}

/**
 * backend 폴더의 절대 경로 — 변경 가이드 모달 명령 박제용.
 * 테스터 표준 경로 = "C:\Bell_Agent\backend" (가이드 markdown 박제).
 * 환경변수 NEXT_PUBLIC_BACKEND_PATH 로 override 가능 (.env.local 박제).
 */
export const BACKEND_PATH =
  process.env.NEXT_PUBLIC_BACKEND_PATH ?? "C:\\Bell_Agent\\backend";

export const WRITER_PROJECT_PATH = `${BACKEND_PATH}\\writer_project`;
