// 무료 측정 판독 창구 (스텝 2-2·2-5·2-8 · 명세: docs/plan/screens/S17-무료측정.md)
// 하는 일: [오늘의 기록 전체 + 사용자가 "사실만" 다시 쓴 사실 칸]을 받아 →
// 거울이 사실 칸을 성분 단위로 검사 → 오염(망상 성분)이 있으면 카메라 기준으로 1~2곳만 짚는다.
// 자세규정 8장(사실 검증 모듈): 깨끗하면 칭찬 없이 조용히 통과, 전부 교정하면 훈계가 되므로 가장 선명한 곳만.
// 프롬프트는 이 파일(서버)에만 존재한다 (지시서 8번).
// 횟수 제한(2-5): 비로그인 1일 1회, 오제로 아이디 보유자 1일 3회 — IP 해시 + 서버 날짜(UTC), fail-open.
import { createHash } from "node:crypto";
import { getAI } from "@vibe-kit/ai";
import { MEASURE_MODEL } from "../../../lib/ai-models";
import { CRAFT_COMMON, CRAFT_SPLIT } from "../../../lib/craft";
import { pickLocale, langLine, ensureQuestionMark, type Locale } from "../../../lib/locale";
import { serviceStore } from "../../../lib/db";

export const runtime = "nodejs";

const MAX_CHARS = 4000; // 비용·응답시간 상한
const LIMIT_ANON = 1; // 비로그인 1일 1회
const LIMIT_OBSERVER = 3; // 오제로 아이디 보유자 1일 3회 (스펙: 로그인 1일 3회)
const LIMIT_COURSE = 10; // 21일 코스 멤버 "빠른 거울" 1일 10회 (결정 2026-07-06 — 제안서: changes/2026-07-06-빠른거울-코스혜택.md)
const IP_SALT = "ozero-mirror-v1"; // 해시 소금 — 원문 IP 는 남지 않게
const MAX_REASONS = 2; // 자세규정 8-6: 가장 선명한 오염 1~2곳만 짚는다

// 오류 문구 — 화면 언어와 같은 규칙(Accept-Language)으로 고른다
const MSG: Record<Locale, Record<string, string>> = {
  ko: {
    badRequest: "잘못된 요청이에요.",
    empty: "한 줄이라도 적어주세요.",
    factsEmpty: "사실 칸에 한 줄이라도 적어주세요.",
    tooLong: `기록이 너무 길어요. ${MAX_CHARS}자 안으로 줄여주세요.`,
    limit: "오늘 측정은 여기까지예요. 내일 다시 비춰볼 수 있어요.",
    noSplit: "이 기록에서는 나눌 조각을 찾지 못했어요. 다시 시도해주세요.",
    noKey: "AI 열쇠가 설정되지 않았어요.",
    failed: "측정하지 못했어요. 다시 시도해주세요.",
  },
  en: {
    badRequest: "Invalid request.",
    empty: "Write at least one line.",
    factsEmpty: "Write at least one line in the facts box.",
    tooLong: `The record is too long. Keep it under ${MAX_CHARS} characters.`,
    limit: "That's all for today. You can mirror again tomorrow.",
    noSplit: "No pieces to sort were found in this record. Please try again.",
    noKey: "The AI key is not set.",
    failed: "Measurement failed. Please try again.",
  },
};

// 공통 판독 규칙 + 사용자 제공 판별 기준(카메라·구체성·발생/내용 분리) + AI 자세 규정 8장
// (정본: docs/ozero_mirror_ai_자세규정.md · docs/plan/08-ai-prompts.md — 수정 시 문서와 함께)
const SYSTEM_PROMPT = `당신은 "오제로의 거울"이에요. 위로하지 않는 목격자예요. 상담자·코치·치료사·조언자·응원자가 아니라, 기록을 되비추는 거울이에요. 판단하지 않고, 위로하지 않고, 결론을 대신 내리지 않아요.

판별 기준:
- 사실 = 그 자리에 카메라와 녹음기가 있었다면 찍히고 녹음되었을 것. 행동 / 따옴표 속 그대로의 말 / 숫자 / 있었다·없었다 / 몸의 반응 / 감정의 발생(느낀 것 그 자체) / "모른다"의 인정.
- 구체성 검사: 사실은 구체적인 이름과 숫자로 말하는 것. 평가어가 덧씌워지면 망상 — "돈이 없어서 못 산다"는 망상이고 사실은 "지갑에 0원이 있다". "좋은 호텔에 묵었다"는 망상이고 사실은 "리츠칼튼에 묵었다" — '좋다'는 브랜드에 덧씌운 고정관념이에요.
- 발생/내용 분리: "~라는 생각이 들었다"에서 생각이 든 것(발생)은 사실이지만, 성분의 판별은 생각의 내용을 기준으로 해요. 내용이 마음 읽기·판단·예측이면 그 성분은 망상 — 이유에서 두 층을 가르세요("생각이 든 것은 사실이에요. '귀찮아한다'는 카메라에 안 담겨요"). "라는 생각이 들었다"가 망상의 세탁기가 되면 안 돼요.
- 감정의 경계 (엄격): 발생의 보고("지겨움이 올라왔다", "가슴이 답답했다")만 사실이에요. 상황·상대를 향한 현재형 감정 표현·감탄("지겹다 진짜", "짜증난다", "싫다", "불안한 하루")은 사실 칸의 감정 혼입 — 망상으로 판별하고, 이유에서 발생형과의 차이를 가르세요("카메라는 지겨움을 못 찍어요 — '지겨움이 올라왔다'는 몸의 사건은 찍혀요").
- 오염 유형(내부 감지용 — 범주명 노출 금지): 마음 읽기(의도·속마음) / 평가어(좋은·나쁜·성의 있게) / 일반화(항상·매번·역시) / 인과 단정(~때문에) / 감정 혼입("짜증나는 회의") / 예측 / 정체성 문장(나는 원래 ~) / 의역된 말(실제 문장 없는 "비난했다").
- 방향 중립: 긍정(희망·확신·칭찬)도 카메라에 안 찍히면 똑같이 망상 — 교정·경고 톤 금지, 건조하게 분류만.
판별 검사 순서: ① 카메라에 찍히는가? ② 애매하면: 근거가 관찰인가 추론인가? 추론이면 망상.

작업: 참가자가 오늘의 기록을 쓰고, 레터의 방식대로 세 칸으로 나눠 적었어요 — 사실 / 느낌 / 행동. 당신의 검사 대상은 사실 칸이에요 (성분 단위). 원기록은 맥락 참고용 — 인용은 사실 칸에서만.
- 느낌 칸은 절대 판별하지 않아요. 무엇이 적혀 있어도 맞고 틀림이 없는 칸이에요 — 질문의 소재로만 참고하고, 코멘트하지 마세요. (참가자가 이미 느낌을 적었으면 question 에서 감정을 또 묻지 마세요.) 예외적으로 느낌 칸에 상대의 의도가 실려 있으면("무시당한 느낌") 판별·코멘트는 하지 말고, question 으로 그 아래의 몸 신호를 물을 수 있어요 ("그때 몸에서는 무엇이 올라왔나요").
- 행동 칸은 가볍게만 봐요: 카메라에 안 찍히는 표현(의도·평가 — "일부러 무시했다", "성의 없이")이 섞여 있으면 action_note 에 건조한 관찰 딱 한 문장 ("'일부러'는 카메라에 안 담겨요 — 찍히는 건 전화를 끊은 동작이에요"). 깨끗하면 빈 문자열.

규칙:
- src 는 사실 칸 원문의 조각을 한 글자도 바꾸지 말고 그대로 잘라 넣으세요. 사실 칸 전체를 빠짐없이 순서대로 성분으로 나누세요.
- label: fact / delusion / unclear. 확신이 없으면 unclear.
- reason: delusion·unclear 성분에만, 카메라 기준의 건조한 관찰 딱 한 문장 ("'성의 있게'는 카메라에 안 담겨요 — 실제로 보인 행동이 아니에요."). 틀렸다/맞았다/교정·경고 표현 금지. 오염이 여러 곳이어도 가장 선명한 1~2곳에만 reason 을 쓰고 나머지는 빈 문자열로 — 전부 교정하면 훈계가 돼요.
- 사실 칸이 완전히 깨끗하면 전부 fact 로 두고 조용히 통과시키세요. "완벽해요" 같은 칭찬 금지 — 칭찬도 평가예요.
- 사람이 아니라 문장에만 이름을 붙이세요. "당신은 ~한 사람" 구조 금지. 위로·공감·칭찬·안심·응원·조언·이모지·느낌표 금지.
- question: 딱 하나, 가장 선명한 오염을 향해 — 단 카메라 사실 확인("실제로 뭐가 보였나요")에서 멈추지 말고, 해석의 아래를 여는 질문으로. 그 기록에 가장 깊이 닿는 형태 하나를 고르세요: ① 그 해석 직후에 올라온 감정을 묻기 (사건→해석→감정의 사슬을 참가자가 스스로 보게) ② 같은 문장이 나온 다른 장면을 묻기 ("이 문장을 쓴 게 이번이 처음인가요? 다른 장면에서는 언제였나요" — 반복은 참가자가 발견해요) ③ 그 해석이 맞다면 다음에 무엇이 온다고 여겼는지 묻기 ④ 실제로 찍힌 장면 묻기. 깨끗하면 기록 전체에서 가장 무게가 실린 문장을 향해. "왜"로 시작 금지. 단정·범주명·무의식 언급 금지. 질문 뒤에 답의 후보를 채우지 마세요 — 진공은 참가자가 채워요.
- 건조하게, 짧게. 질문은 반드시 물음표(?)로 끝내세요.

다음 JSON 형식으로만 답하세요 (다른 텍스트 금지):
{"items":[{"src":"사실 칸 원문 조각","label":"fact","reason":""}],"action_note":"","question":"되묻는 질문 하나"}`;

type Label = "fact" | "delusion" | "unclear";
type AiItem = { src?: string; label?: string; reason?: string };

// ---- 횟수 제한 ----
function ipHashOf(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  return createHash("sha256").update(IP_SALT + ip).digest("hex");
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 오제로 아이디 보유자(비밀 열쇠가 실제 관찰자와 일치)면 하루 3회, 아니면 1회 */
async function dailyLimitOf(req: Request): Promise<number> {
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) return LIMIT_ANON;
  const store = serviceStore();
  if (store === null) return LIMIT_ANON;
  try {
    const r = await fetch(
      `${store.url}/rest/v1/profiles?user_id=eq.${secret}&deleted_at=is.null&select=user_id`,
      { headers: store.headers, cache: "no-store" }
    );
    const rows = r.ok ? ((await r.json()) as unknown[]) : [];
    if (rows.length === 0) return LIMIT_ANON;
    // 21일 코스 멤버는 빠른 거울 하루 10회
    const jr = await fetch(
      `${store.url}/rest/v1/journeys?user_id=eq.${secret}&course=eq.mirror21&status=eq.active&select=id&limit=1`,
      { headers: store.headers, cache: "no-store" }
    );
    const journeys = jr.ok ? ((await jr.json()) as unknown[]) : [];
    return journeys.length > 0 ? LIMIT_COURSE : LIMIT_OBSERVER;
  } catch {
    return LIMIT_ANON;
  }
}

/** 오늘 사용 횟수. null = 판정 불가(창고 장애·열쇠 없음) — 이때는 막지 않는다 */
async function usedToday(ipHash: string, day: string): Promise<number | null> {
  const store = serviceStore();
  if (store === null) return null;
  try {
    const r = await fetch(
      `${store.url}/rest/v1/measure_limits?ip_hash=eq.${ipHash}&day=eq.${day}&select=count`,
      { headers: store.headers, cache: "no-store" }
    );
    if (!r.ok) return null;
    const rows = (await r.json()) as { count: number }[];
    return rows.length > 0 ? rows[0].count : 0;
  } catch {
    return null;
  }
}

/** 사용 1회 기록 (성공한 측정만 센다 — 우리 쪽 실패가 하루치 기회를 태우면 안 되니까) */
async function bumpUsage(ipHash: string, day: string, next: number): Promise<void> {
  const store = serviceStore();
  if (store === null) return;
  try {
    await fetch(`${store.url}/rest/v1/measure_limits?on_conflict=ip_hash,day`, {
      method: "POST",
      headers: { ...store.headers, prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ ip_hash: ipHash, day, count: next }),
    });
  } catch {
    // 카운트 기록 실패가 측정 결과를 막지 않는다
  }
}

/** 입구 사전 안내용: 오늘 더 비출 수 있는지 (한도 안내를 일 다 시킨 뒤가 아니라 들어올 때 한다) */
export async function GET(req: Request): Promise<Response> {
  const [used, limit] = await Promise.all([usedToday(ipHashOf(req), todayUtc()), dailyLimitOf(req)]);
  const allowed = used === null ? true : used < limit;
  return Response.json({ allowed, used: used ?? 0, limit });
}

export async function POST(req: Request): Promise<Response> {
  const locale = pickLocale(req.headers.get("accept-language"));
  const t = MSG[locale];

  let text = "";
  let facts = "";
  let feelings = "";
  let actions = "";
  try {
    const body = (await req.json()) as { text?: string; facts?: string; feelings?: string; actions?: string };
    text = (body.text ?? "").trim();
    facts = (body.facts ?? "").trim();
    feelings = (body.feelings ?? "").trim();
    actions = (body.actions ?? "").trim();
  } catch {
    return Response.json({ error: t.badRequest }, { status: 400 });
  }
  if (text === "") {
    return Response.json({ error: t.empty }, { status: 400 });
  }
  if (facts === "") {
    return Response.json({ error: t.factsEmpty }, { status: 400 });
  }
  if (text.length > MAX_CHARS || facts.length > MAX_CHARS || feelings.length > MAX_CHARS || actions.length > MAX_CHARS) {
    return Response.json({ error: t.tooLong }, { status: 400 });
  }

  // 횟수 판정 — AI 호출(비용) 전에 먼저. 하루 경계는 서버 날짜(UTC), 클라이언트 시계 아님
  const day = todayUtc();
  const ipHash = ipHashOf(req);
  const [used, limit] = await Promise.all([usedToday(ipHash, day), dailyLimitOf(req)]);
  if (used !== null && used >= limit) {
    return Response.json({ error: t.limit }, { status: 429 });
  }

  const userMessage =
    `오늘의 기록(맥락 참고용):\n${text}\n\n사실 칸(검사 대상):\n${facts}` +
    (feelings !== "" ? `\n\n느낌 칸(판별 금지 — 참고만):\n${feelings}` : "") +
    (actions !== "" ? `\n\n행동 칸(가볍게만):\n${actions}` : "");

  try {
    const res = await getAI().messages.create({
      model: MEASURE_MODEL,
      max_tokens: 2000,
      thinking: { type: "disabled" }, // 단순 분류 작업 — 생각 모드 끄면 더 빠르고 저렴
      system: SYSTEM_PROMPT + "\n" + CRAFT_SPLIT + "\n" + CRAFT_COMMON + "\n" + langLine(locale),
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = res.content.find((c) => c.type === "text");
    const raw = textBlock !== undefined && textBlock.type === "text" ? textBlock.text : "";
    // 코드 펜스가 붙어 와도 벗겨서 해석
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const jsonText = stripped.includes("{") ? stripped.slice(stripped.indexOf("{"), stripped.lastIndexOf("}") + 1) : stripped;
    const parsed = JSON.parse(jsonText) as { items?: AiItem[]; action_note?: string; question?: string };
    const aiItems = Array.isArray(parsed.items) ? parsed.items : [];

    // 지어내기 방지: src 가 사실 칸의 실제 조각이 아니면 버린다 (절대 규칙 2)
    let reasonBudget = MAX_REASONS; // 자세규정 8-6: 가장 선명한 1~2곳만 — 서버에서도 강제
    const items = aiItems
      .filter(
        (c) =>
          typeof c.src === "string" &&
          c.src.trim() !== "" &&
          facts.includes(c.src.trim()) &&
          (c.label === "fact" || c.label === "delusion" || c.label === "unclear")
      )
      .map((c) => {
        const label = c.label as Label;
        const reasonRaw = typeof c.reason === "string" ? c.reason.trim() : "";
        let reason: string | null = null;
        if (label !== "fact" && reasonRaw !== "" && reasonBudget > 0) {
          reason = reasonRaw.slice(0, 300);
          reasonBudget--;
        }
        return { src: (c.src as string).trim(), label, reason };
      });

    if (items.length === 0) {
      return Response.json({ error: t.noSplit }, { status: 502 });
    }

    const factCount = items.filter((c) => c.label === "fact").length;
    const delusionCount = items.filter((c) => c.label === "delusion").length;
    const clean = items.every((c) => c.label === "fact");
    const question =
      typeof parsed.question === "string" && parsed.question.trim() !== "" ? ensureQuestionMark(parsed.question) : null;
    // 행동 칸 코멘트는 행동 칸이 실제로 있을 때만 (자세규정 8-6: 깨끗하면 조용히)
    const actionNote =
      actions !== "" && typeof parsed.action_note === "string" && parsed.action_note.trim() !== ""
        ? parsed.action_note.trim().slice(0, 300)
        : null;

    await bumpUsage(ipHash, day, (used ?? 0) + 1);

    return Response.json({ items, actionNote, factCount, delusionCount, clean, question });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("ANTHROPIC_API_KEY")) {
      return Response.json({ error: t.noKey }, { status: 500 });
    }
    return Response.json({ error: t.failed }, { status: 502 });
  }
}
