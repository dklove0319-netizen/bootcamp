// 무료 측정 판독 창구 (스텝 2-2·2-5 · 명세: docs/plan/screens/S17-무료측정.md)
// 하는 일: 기록 1건을 받아 → AI가 성분 단위로 사실/망상을 나누고 → 서버가 "지어내기 검증" 후
// [직접 인용 + 사실 n : 망상 m + 되묻는 질문] 을 돌려준다 (PRICING_SPEC 절대 규칙 1·2).
// 프롬프트는 이 파일(서버)에만 존재한다 — 브라우저·네트워크 응답에 노출되지 않는다 (지시서 8번).
// 횟수 제한(2-5): 비로그인 1일 1회 — IP 해시 + 서버 날짜(UTC)로 measure_limits 에서 판정.
//   원문 IP 는 저장하지 않는다. 창고 장애 시엔 측정을 막지 않는다(제한은 비용 방어용이지 관문이 아님).
import { createHash } from "node:crypto";
import { getAI } from "@vibe-kit/ai";
import { MEASURE_MODEL } from "../../../lib/ai-models";
import { pickLocale, type Locale } from "../../../lib/locale";

export const runtime = "nodejs";

const MAX_CHARS = 4000; // 비용·응답시간 상한 (기록 1건 기준 넉넉)
const DAILY_LIMIT = 1; // 비로그인 1일 1회 (로그인 1일 3회는 블럭 3에서)
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

// 공통 판독 규칙 압축판 + 사용자 제공 판별 키워드 (전문: docs/plan/08-ai-prompts.md — 수정 시 문서와 함께)
const SYSTEM_PROMPT = `당신은 "오제로의 거울"이에요. 분석가·선생·상담사가 아니라 거울이에요. 판정하지 않고 비추기만 해요.

판별 기준:
- 사실 = 그 자리에 카메라와 녹음기가 있었다면 찍히고 녹음되었을 것. 해석 없는 장면, 누가 봐도 똑같이 진술 가능한 것.
  사실의 형태: 행동(카메라에 담기는 움직임) / 말(따옴표 속 그대로) / 숫자(수량·시간·빈도) / 있었다·없었다(존재 확인) / 몸의 반응(신체 감각) / 감정의 발생(느낀 것 그 자체) / 생각의 발생("~라는 생각이 떠올랐다"는 사실) / "모른다"(확인 안 된 상태의 인정).
- 망상 = 그 위에 마음이 붙인 모든 것. 이야기이자 해석 — 형용사·판단·추측·결론. 좋은 것도 나쁜 것도 아니고, 해석 방식을 보여주는 지표예요.
  망상의 형태(내부 감지용 — 사용자에게 범주명 노출 금지): 판단(형용사·평가) / 마음 읽기(의도 추측) / 추측(미확인 확신) / 예측(미래 단정) / 일반화(항상·절대·역시) / 인과(이유 만들기) / 당위(~해야 했다) / 정체성 라벨(나는·그는 ~한 사람) / 해석 변형 동사(무시했다·상처줬다·배신했다 등) / 비교(구도 형성).
- 긍정(희망·확신·칭찬)도 카메라에 안 찍히면 똑같이 망상 — 단 교정·경고 톤 금지, 건조하게 분류만.
판별 검사 순서: ① 카메라에 찍히는가? ② 애매하면: 근거가 관찰인가 추론인가? 추론이면 망상.
주의: "감정의 발생"과 "생각의 발생"은 사실이지만, 그 감정·생각의 내용이 해석이면 내용은 망상으로 따로 성분을 나눠요.

작업: 아래 기록을 성분 단위로 쪼개고 각 성분을 fact / delusion / unclear 로 나누세요. 한 문장에 사실과 망상이 섞여 있으면 성분으로 쪼개세요.

규칙:
- src 는 기록 원문의 조각을 한 글자도 바꾸지 말고 그대로 잘라 넣으세요. 원문에 없는 문장을 만들지 마세요.
- 유형·성격 라벨 금지("당신은 ~형" 금지). 판별 범주명 노출 금지. 위로·조언·평가·이모지 금지.
- question 은 판정 없는 되묻는 질문 딱 하나. 기록과 같은 언어로 쓰세요. 한국어면 ~이에요/~해요체.
- 확신이 없는 성분은 unclear.

다음 JSON 형식으로만 답하세요 (다른 텍스트 금지):
{"components":[{"src":"원문 조각","label":"fact"}],"question":"되묻는 질문 하나"}`;

type Component = { src: string; label: "fact" | "delusion" | "unclear" };

// ---- 횟수 제한: 창고(measure_limits)를 서버 전용 마스터 열쇠로만 읽고 쓴다 (RLS 공개 정책 없음) ----
function limitStore() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url.startsWith("https://") || key.length <= 20) return null; // 열쇠 없으면 제한 없이 통과 (개발 편의)
  const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  return { url, headers };
}

function ipHashOf(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  return createHash("sha256").update(IP_SALT + ip).digest("hex");
}

/** 오늘 사용 횟수. null = 판정 불가(창고 장애·열쇠 없음) — 이때는 막지 않는다 */
async function usedToday(ipHash: string, day: string): Promise<number | null> {
  const store = limitStore();
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
  const store = limitStore();
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

export async function POST(req: Request): Promise<Response> {
  const t = MSG[pickLocale(req.headers.get("accept-language"))];

  let text = "";
  try {
    const body = (await req.json()) as { text?: string };
    text = (body.text ?? "").trim();
  } catch {
    return Response.json({ error: t.badRequest }, { status: 400 });
  }
  if (text === "") {
    return Response.json({ error: t.empty }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return Response.json({ error: t.tooLong }, { status: 400 });
  }

  // 횟수 판정 — AI 호출(비용) 전에 먼저. 하루 경계는 서버 날짜(UTC), 클라이언트 시계 아님
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = ipHashOf(req);
  const used = await usedToday(ipHash, day);
  if (used !== null && used >= DAILY_LIMIT) {
    return Response.json({ error: t.limit }, { status: 429 });
  }

  try {
    const res = await getAI().messages.create({
      model: MEASURE_MODEL,
      max_tokens: 1500,
      thinking: { type: "disabled" }, // 단순 분류 작업 — 생각 모드 끄면 더 빠르고 저렴
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });

    const textBlock = res.content.find((c) => c.type === "text");
    const raw = textBlock !== undefined && textBlock.type === "text" ? textBlock.text : "";
    // 코드 펜스가 붙어 와도 벗겨서 해석
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(jsonText) as { components?: Component[]; question?: string };

    // 지어내기 방지 검증: src 가 원문의 실제 조각이 아니면 그 성분은 버린다 (절대 규칙 2)
    const verified = (parsed.components ?? []).filter(
      (c) =>
        typeof c.src === "string" &&
        c.src.trim() !== "" &&
        (c.label === "fact" || c.label === "delusion" || c.label === "unclear") &&
        text.includes(c.src.trim())
    );

    if (verified.length === 0) {
      return Response.json({ error: t.noSplit }, { status: 502 });
    }

    const factCount = verified.filter((c) => c.label === "fact").length;
    const delusionCount = verified.filter((c) => c.label === "delusion").length;
    const question = typeof parsed.question === "string" && parsed.question.trim() !== "" ? parsed.question.trim() : null;

    await bumpUsage(ipHash, day, (used ?? 0) + 1);

    return Response.json({
      components: verified,
      factCount,
      delusionCount,
      question,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("ANTHROPIC_API_KEY")) {
      return Response.json({ error: t.noKey }, { status: 500 });
    }
    return Response.json({ error: t.failed }, { status: 502 });
  }
}
