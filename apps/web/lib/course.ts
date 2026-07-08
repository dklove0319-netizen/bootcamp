// 코스 공통 부품 — 하루 열림 판정(서버 게이팅), 감정 목록, 위기 키워드, WHO-5 문항.
// 게이팅은 항상 서버에서 계산한다 (지시서: 클라이언트 시간 판정 금지).
// 하루 = 사용자가 정한 시각(record_hour) ~ 다음날 같은 시각. entry_date = 그 창이 열린 날짜.

/** 사용자 시간대의 [YYYY-MM-DD, 시(0-23)] */
function localParts(now: Date, timezone: string): { date: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: parseInt(get("hour"), 10) % 24 };
}

function shiftDate(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 지금 열려 있는 기록 창: entry_date(이 창의 날짜)와 열림 여부 */
export function loopWindow(now: Date, timezone: string, recordHour: number): { entryDate: string } {
  const { date, hour } = localParts(now, timezone);
  // record_hour 이전이면 아직 어제의 창 안에 있다
  return { entryDate: hour >= recordHour ? date : shiftDate(date, -1) };
}

/** 여정 시작일 기준 며칠째인지 (1부터) */
export function dayNoOf(entryDate: string, startDate: string): number {
  return Math.floor((Date.parse(entryDate) - Date.parse(startDate)) / 86400000) + 1;
}

export function courseLength(course: string): number {
  return course === "mirror21" ? 21 : 3; // trial3 = 3일
}

/** S03 확정 감정 목록 — 21일 동안 절대 변경 금지 (긍정 4 : 부정 4 균형) */
export const EMOTIONS = ["기쁨", "평온", "설렘/기대", "뿌듯함", "불안", "짜증/화", "슬픔", "부끄러움", "무덤덤", "잘 모르겠음"];
export const EMOTIONS_EN = ["Joy", "Calm", "Anticipation", "Pride", "Anxiety", "Irritation/anger", "Sadness", "Shame", "Numb", "Not sure"];

/** 위기 신호 1차 키워드 (S05 — 판정 실패 시에도 루프는 멈추지 않는다) */
const CRISIS_KEYWORDS = [
  "죽고 싶", "죽고싶", "자살", "죽어버리", "죽어 버리", "사라지고 싶", "사라지고싶",
  "살기 싫", "살기싫", "끝내고 싶", "끝내버리고", "해치고 싶", "죽을래", "목숨을",
];

export function detectCrisis(text: string): boolean {
  return CRISIS_KEYWORDS.some((k) => text.includes(k));
}

/** WHO-5 웰빙 지수 — 문항 원문 수정 금지 (검증된 척도). 지난 2주, 0~5. 출처: WHO-5 Well-Being Index (1998) */
export const WHO5 = [
  "나는 즐겁고 좋은 기분이었다.",
  "나는 차분하고 편안했다.",
  "나는 활동적이고 활기찼다.",
  "나는 아침에 일어났을 때 상쾌하고 잘 쉬었다는 느낌이 들었다.",
  "나의 일상은 흥미로운 것들로 가득했다.",
];
export const WHO5_EN = [
  "I have felt cheerful and in good spirits.",
  "I have felt calm and relaxed.",
  "I have felt active and vigorous.",
  "I woke up feeling fresh and rested.",
  "My daily life has been filled with things that interest me.",
];
export const WHO5_SCALE = ["전혀 그렇지 않았다", "가끔 그랬다", "절반이 안 되는 시간 동안", "절반이 넘는 시간 동안", "대부분 그랬다", "항상 그랬다"];
export const WHO5_SCALE_EN = ["At no time", "Some of the time", "Less than half of the time", "More than half of the time", "Most of the time", "All of the time"];

/** 구조 반사의 접지 검증 (E-2·E-4 공용) — 반사 문장이 검증된 원문 조각에 실제로 뿌리내렸는지.
 *  통과 조건: ① 검증된 조각을 통째로 품고 있거나 ② 반사 속 따옴표('...') 조각들이 전부 검증된 조각 안에 존재.
 *  둘 다 아니면 지어낸 반사로 보고 폐기한다 (바넘 차단). */
export function reflectionGrounded(reflection: string, verifiedSrcs: string[]): boolean {
  if (verifiedSrcs.some((s) => reflection.includes(s))) return true;
  const quoted = [...reflection.matchAll(/'([^']{2,})'/g)].map((m) => m[1]);
  return quoted.length > 0 && quoted.every((q) => verifiedSrcs.some((s) => s.includes(q)));
}
