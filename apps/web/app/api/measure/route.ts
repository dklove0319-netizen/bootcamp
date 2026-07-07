// 무료 측정 판독 창구 (스텝 2-2·2-5·2-7 · 명세: docs/plan/screens/S17-무료측정.md)
// 하는 일: 기록 + 사용자의 조각별 구별을 받아 → 거울이 같은 조각을 다시 나누고 →
// [조각별 내 구별 vs 거울 나란히 + 어긋난 곳엔 카메라 기준 한 줄 + 조준된 질문] 을 돌려준다.
// 지시서 6단계: "이 문장은 이렇게도 나뉩니다" — 채점·정답률 없음, 거울의 구별도 정답이 아니라 또 하나의 거울.
// 프롬프트는 이 파일(서버)에만 존재한다 (지시서 8번).
// 횟수 제한(2-5): 비로그인 1일 1회, 오제로 아이디 보유자 1일 3회 — IP 해시 + 서버 날짜(UTC).
//   원문 IP 는 저장하지 않는다. 창고 장애 시엔 측정을 막지 않는다(제한은 비용 방어용이지 관문이 아님).
import { createHash } from "node:crypto";
import { getAI } from "@vibe-kit/ai";
import { MEASURE_MODEL } from "../../../lib/ai-models";
import { pickLocale, type Locale } from "../../../lib/locale";
import { serviceStore } from "../../../lib/db";

export const runtime = "nodejs";

const MAX_CHARS = 4000; // 비용·응답시간 상한 (기록 1건 기준 넉넉)
const MAX_FRAGMENTS = 40;
const LIMIT_ANON = 1; // 비로그인 1일 1회
const LIMIT_OBSERVER = 3; // 오제로 아이디 보유자 1일 3회 (스펙: 로그인 1일 3회)
const IP_SALT = "ozero-mirror-v1"; // 해시 소금 — 같은 IP 가 같은 해시가 되되 원문 IP 는 남지 않게

// 오류 문구 — 화면 언어와 같은 규칙(Accept-Language)으로 고른다
const MSG: Record<Locale, Record<string, string>> = {
  ko: {
    badRequest: "잘못된 요청이에요.",
    empty: "한 줄이라도 적어주세요.",
    tooLong: `기록이 너무 길어요. ${MAX_CHARS}자 안으로 줄여주세요.`,
    limit: "오늘 측정은 여기까지예요. 내일 다시 비춰볼 수 있어요.",
    noSplit: "이 기록에서는 나눌 조각을 찾지 못했어요. 다시 시도해주세요.",
    noKey: "AI 열쇠가 설정되지 않았어요.",
    failed: "측정하지 못했어요. 다시 시도해주세요.",
  },
  en: {
    badRequest: "Invalid request.",
    empty: "Write at least one line.",
    tooLong: `The record is too long. Keep it under ${MAX_CHARS} characters.`,
    limit: "That's all for today. You can mirror again tomorrow.",
    noSplit: "No pieces to sort were found in this record. Please try again.",
    noKey: "The AI key is not set.",
    failed: "Measurement failed. Please try again.",
  },
};

// 공통 판독 규칙 압축판 + 사용자 제공 판별 키워드 + AI 자세 규정 핵심
// (정본: docs/ozero_mirror_ai_자세규정.md · docs/plan/08-ai-prompts.md — 수정 시 문서와 함께)
const SYSTEM_PROMPT = `당신은 "오제로의 거울"이에요. 위로하지 않는 목격자예요. 상담자·코치·치료사·조언자·응원자가 아니라, 기록을 되비추는 거울이에요. 판단하지 않고, 위로하지 않고, 결론을 대신 내리지 않아요.

판별 기준:
- 사실 = 그 자리에 카메라와 녹음기가 있었다면 찍히고 녹음되었을 것. 해석 없는 장면, 누가 봐도 똑같이 진술 가능한 것.
  사실의 형태: 행동(카메라에 담기는 움직임) / 말(따옴표 속 그대로) / 숫자(수량·시간·빈도) / 있었다·없었다(존재 확인) / 몸의 반응(신체 감각) / 감정의 발생(느낀 것 그 자체) / 생각의 발생("~라는 생각이 떠올랐다"는 사실) / "모른다"(확인 안 된 상태의 인정).
- 망상 = 그 위에 마음이 붙인 모든 것. 이야기이자 해석 — 형용사·판단·추측·결론. 좋은 것도 나쁜 것도 아니고, 해석 방식을 보여주는 지표예요.
  망상의 형태(내부 감지용 — 사용자에게 범주명 노출 금지): 판단(형용사·평가) / 마음 읽기(의도 추측) / 추측(미확인 확신) / 예측(미래 단정) / 일반화(항상·절대·역시) / 인과(이유 만들기) / 당위(~해야 했다) / 정체성 라벨(나는·그는 ~한 사람) / 해석 변형 동사(무시했다·상처줬다·배신했다 등) / 비교(구도 형성).
- 긍정(희망·확신·칭찬)도 카메라에 안 찍히면 똑같이 망상 — 단 교정·경고 톤 금지, 건조하게 분류만.
판별 검사 순서: ① 카메라에 찍히는가? ② 애매하면: 근거가 관찰인가 추론인가? 추론이면 망상.
주의: "감정의 발생"과 "생각의 발생"은 사실이지만, 그 감정·생각의 내용이 해석이면 망상 쪽이에요.

작업: 참가자가 기록을 조각으로 나누고 각 조각을 스스로 사실/망상으로 구별했어요. 당신은 같은 조각들을 같은 순서로, 거울의 눈으로 다시 나누세요 (fact / delusion / unclear).

규칙:
- reason: 당신의 판별이 참가자의 구별과 다른 조각, 또는 한 조각 안에 사실과 망상이 섞인 조각에만 씁니다 — 딱 한 문장, 카메라 기준의 건조한 관찰로. ("'무시했다'는 카메라에 담기지 않아요 — 마음속이에요." / "'한달동안 연락이 없다'까지는 찍혀요. '정말 사소한'은 판단이에요.") 맞았다/틀렸다/교정·경고 표현 금지. 참가자와 같게 본 조각은 reason 을 빈 문자열로 두세요 — 깨끗한 조각엔 코멘트하지 않아요.
- 사람이 아니라 문장에만 이름을 붙이세요. "당신은 ~한 사람" 구조의 문장은 어떤 내용이든 금지. 판별 범주명 노출 금지.
- 위로·공감·칭찬·안심·응원·조언·이모지·느낌표 금지.
- question: 참가자와 가장 크게 어긋난 조각 하나를 향한 되묻는 질문 딱 하나. 어긋난 조각이 없으면 가장 큰 망상 조각을 향해. "왜"로 시작하지 마세요 — "근거가 있나요", "어떤 장면이었나요", "실제로 한 말은 무엇이었나요" 형태로. 질문 뒤에 답의 후보를 채우지 마세요 — 진공은 참가자가 채워요.
- 기록과 같은 언어로 쓰세요. 한국어면 ~이에요/~해요체. 건조하게, 짧게.
- 확신이 없는 조각은 unclear.

다음 JSON 형식으로만 답하세요 (다른 텍스트 금지). items 는 조각과 같은 순서, 같은 개수여야 해요:
{"items":[{"label":"fact","reason":""}],"question":"되묻는 질문 하나"}`;

type Label = "fact" | "delusion" | "unclear";
type Fragment = { src: string; label: "fact" | "delusion" };
type AiItem = { label?: string; reason?: string };

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
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) return LIMIT_ANON;
  const store = serviceStore();
  if (store === null) return LIMIT_ANON;
  try {
    const r = await fetch(
      `${store.url}/rest/v1/profiles?user_id=eq.${secret}&deleted_at=is.null&select=user_id`,
      { headers: store.headers, cache: "no-store" }
    );
    const rows = r.ok ? ((await r.json()) as unknown[]) : [];
    return rows.length > 0 ? LIMIT_OBSERVER : LIMIT_ANON;
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
  const t = MSG[pickLocale(req.headers.get("accept-language"))];

  let text = "";
  let fragments: Fragment[] = [];
  try {
    const body = (await req.json()) as { text?: string; fragments?: Fragment[] };
    text = (body.text ?? "").trim();
    fragments = Array.isArray(body.fragments) ? body.fragments : [];
  } catch {
    return Response.json({ error: t.badRequest }, { status: 400 });
  }
  if (text === "") {
    return Response.json({ error: t.empty }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return Response.json({ error: t.tooLong }, { status: 400 });
  }
  // 조각 검증: 사용자가 화면에서 나눈 그 조각이어야 한다 (원문의 실제 일부 + 라벨 유효)
  const validFragments = fragments.filter(
    (f) =>
      typeof f.src === "string" &&
      f.src.trim() !== "" &&
      text.includes(f.src) &&
      (f.label === "fact" || f.label === "delusion")
  );
  if (validFragments.length === 0 || validFragments.length > MAX_FRAGMENTS) {
    return Response.json({ error: t.badRequest }, { status: 400 });
  }

  // 횟수 판정 — AI 호출(비용) 전에 먼저. 하루 경계는 서버 날짜(UTC), 클라이언트 시계 아님
  const day = todayUtc();
  const ipHash = ipHashOf(req);
  const [used, limit] = await Promise.all([usedToday(ipHash, day), dailyLimitOf(req)]);
  if (used !== null && used >= limit) {
    return Response.json({ error: t.limit }, { status: 429 });
  }

  const labelWord = (l: string) => (l === "fact" ? "사실" : "망상");
  const userMessage =
    `기록:\n${text}\n\n참가자의 구별:\n` +
    validFragments.map((f, i) => `${i + 1}. "${f.src}" — ${labelWord(f.label)}`).join("\n");

  try {
    const res = await getAI().messages.create({
      model: MEASURE_MODEL,
      max_tokens: 2000,
      thinking: { type: "disabled" }, // 단순 분류 작업 — 생각 모드 끄면 더 빠르고 저렴
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = res.content.find((c) => c.type === "text");
    const raw = textBlock !== undefined && textBlock.type === "text" ? textBlock.text : "";
    // 코드 펜스가 붙어 와도 벗겨서 해석
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(jsonText) as { items?: AiItem[]; question?: string };
    const aiItems = Array.isArray(parsed.items) ? parsed.items : [];

    if (aiItems.length !== validFragments.length) {
      return Response.json({ error: t.noSplit }, { status: 502 });
    }

    // 조각 원문은 서버가 보관한 것을 그대로 쓴다 (지어내기 원천 차단 — 절대 규칙 2).
    // reason 은 구별이 어긋난 조각에만 남긴다 (같게 본 조각엔 코멘트 없음 — 자세 규정 8-6).
    const items = validFragments.map((f, i) => {
      const mirrorRaw = aiItems[i].label;
      const mirror: Label =
        mirrorRaw === "fact" || mirrorRaw === "delusion" || mirrorRaw === "unclear" ? mirrorRaw : "unclear";
      const reasonRaw = typeof aiItems[i].reason === "string" ? (aiItems[i].reason as string).trim() : "";
      const differs = mirror !== f.label;
      return {
        src: f.src,
        user: f.label,
        mirror,
        reason: differs && reasonRaw !== "" ? reasonRaw.slice(0, 300) : null,
      };
    });

    const factCount = items.filter((c) => c.mirror === "fact").length;
    const delusionCount = items.filter((c) => c.mirror === "delusion").length;
    const question =
      typeof parsed.question === "string" && parsed.question.trim() !== "" ? parsed.question.trim() : null;

    await bumpUsage(ipHash, day, (used ?? 0) + 1);

    return Response.json({ items, factCount, delusionCount, question });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("ANTHROPIC_API_KEY")) {
      return Response.json({ error: t.noKey }, { status: 500 });
    }
    return Response.json({ error: t.failed }, { status: 502 });
  }
}
