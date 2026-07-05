// AI 모델은 설정으로 관리한다 (PRICING_SPEC 규칙 4 "가격 하드코딩 금지"와 같은 원리).
// 바꾸고 싶으면 .env 에 MEASURE_MODEL / COURSE_MODEL 을 넣으면 된다 — 코드 수정 없이 교체.
// 서버 전용 파일 (클라이언트에서 import 금지).

/** 무료 맛보기 측정용 (사용자 확정 2026-07-05: Sonnet) */
export const MEASURE_MODEL = process.env.MEASURE_MODEL ?? "claude-sonnet-5";

/** 21일 코스 내부 판독용 (사용자 확정 2026-07-05: Opus 4.8 — 블럭 4부터 사용) */
export const COURSE_MODEL = process.env.COURSE_MODEL ?? "claude-opus-4-8";
