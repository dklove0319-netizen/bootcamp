// 사흘의 거울 — 무료 3일 미니 패턴 거울 (PRICING_SPEC ②: "3일치 반복을 본인 언어로 되비추는 미니 거울")
// 하는 일: 비밀 열쇠로 신원 확인 → 서로 다른 날짜의 기록이 3일 이상이면 →
// 반복된 해석을 [원문 인용 + 날짜 + 빈도]로만 되비춘다. 유형명·점수·평가·성장 서사 금지 (지시서 11번·자세규정 B/C).
// 인용은 서버가 원문 대조로 검증한다 — 원문에 없는 문장은 버린다 (절대 규칙 2).
import { getAI } from "@vibe-kit/ai";
import { MEASURE_MODEL } from "../../../../lib/ai-models";
import { pickLocale, langLine, ensureQuestionMark } from "../../../../lib/locale";
import { serviceStore } from "../../../../lib/db";

export const runtime = "nodejs";

const MIRROR3_PROMPT = `당신은 "오제로의 거울"이에요. 위로하지 않는 목격자예요. 참가자의 최근 사흘 기록을 되비춰요.

작업: 사흘의 기록에서 반복된 해석(카메라에 안 찍히는 판단·마음 읽기·일반화·자기 판결)을 찾아요. 반복 = 같은 계열의 해석이 두 날 이상 나온 것.

규칙:
- quotes 의 src 는 해당 날짜 기록의 원문 조각을 한 글자도 바꾸지 말고 그대로 잘라 넣으세요. 요약·의역·창작 금지. 반복이 없으면 repeats 는 빈 배열.
- note: 수치 관찰 딱 한 문장 — "'무시당했다'는 해석이 사흘 중 3일 나와요." 형식. 평가·칭찬·성장 서사·유형명 금지. 반복이 없으면 빈 문자열.
- question: 가장 자주 반복된 해석 하나를 향한 되묻는 질문 딱 하나. "왜" 시작 금지, 답의 후보 금지, "당신은 ~한 사람" 구조 금지. 반복이 없으면 기록 전체에서 가장 무게가 실린 문장을 향해.
- ~이에요/~해요체. 건조하게. 이모지·느낌표 금지.

JSON 으로만 답하세요:
{"repeats":[{"quotes":[{"date":"YYYY-MM-DD","src":"원문 조각"}]}],"note":"","question":"..."}`;

type Quote = { date?: string; src?: string };
type Repeat = { quotes?: Quote[] };

export async function GET(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) {
    return Response.json({ error: "no-key" }, { status: 401 });
  }

  // n = 며칠의 거울인지 (3 기본 · 7 · 14 — S12 중간 거울도 이 창구를 쓴다)
  const nParam = parseInt(new URL(req.url).searchParams.get("n") ?? "3", 10);
  const n = [3, 7, 14].includes(nParam) ? nParam : 3;

  const er = await fetch(
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&deleted_at=is.null&order=entry_date.desc&limit=${n + 4}&select=entry_date,day_no,free_text,emotion_label,answer_text`,
    { headers: store.headers, cache: "no-store" }
  );
  const rows = er.ok
    ? ((await er.json()) as { entry_date: string; day_no: number; free_text: string | null; emotion_label: string | null; answer_text: string | null }[])
    : [];
  // 같은 날 여러 줄이어도 날짜당 하나로 (최신 우선)
  const byDate = new Map<string, string>();
  for (const r of rows) {
    if (!byDate.has(r.entry_date) && typeof r.free_text === "string" && r.free_text.trim() !== "") {
      byDate.set(r.entry_date, r.free_text);
    }
  }
  const days = [...byDate.entries()].slice(0, n);
  if (days.length < 3) {
    return Response.json({ days: days.length }); // 아직 셀 만큼 안 쌓임 — 조용히
  }

  // 감정 이름 빈도 (서버 계산 — S12 사실 제시)
  const emotionCounts = new Map<string, number>();
  for (const r of rows.slice(0, n)) {
    if (typeof r.emotion_label === "string" && r.emotion_label !== "") {
      emotionCounts.set(r.emotion_label, (emotionCounts.get(r.emotion_label) ?? 0) + 1);
    }
  }
  // 14일 시차 대면: 1일째 답변 전문 (있을 때만 — 없으면 칸 생략, 실패 문구 금지)
  let day1Answer: { date: string; answer: string } | null = null;
  if (n >= 14) {
    const d1 = rows.find((r) => r.day_no === 1 && typeof r.answer_text === "string" && r.answer_text !== "");
    if (d1 !== undefined) day1Answer = { date: d1.entry_date, answer: d1.answer_text as string };
  }

  const userMessage = days
    .map(([date, text]) => `[${date}]\n${text}`)
    .join("\n\n");

  try {
    const res = await getAI().messages.create({
      model: MEASURE_MODEL,
      max_tokens: 1200,
      thinking: { type: "disabled" },
      system: MIRROR3_PROMPT + "\n" + langLine(pickLocale(req.headers.get("accept-language"))),
      messages: [{ role: "user", content: userMessage }],
    });
    const textBlock = res.content.find((c) => c.type === "text");
    const raw = textBlock !== undefined && textBlock.type === "text" ? textBlock.text : "";
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(jsonText) as { repeats?: Repeat[]; note?: string; question?: string };

    // 인용 검증: 그 날짜의 원문에 실제로 있는 조각만 (절대 규칙 2). 반복은 2일 이상만.
    const repeats = (Array.isArray(parsed.repeats) ? parsed.repeats : [])
      .map((rep) => {
        const quotes = (Array.isArray(rep.quotes) ? rep.quotes : []).filter(
          (q) =>
            typeof q.date === "string" &&
            typeof q.src === "string" &&
            q.src.trim() !== "" &&
            (byDate.get(q.date) ?? "").includes(q.src.trim())
        ) as { date: string; src: string }[];
        const distinctDates = new Set(quotes.map((q) => q.date));
        return distinctDates.size >= 2 ? { quotes } : null;
      })
      .filter((r): r is { quotes: { date: string; src: string }[] } => r !== null);

    const note = typeof parsed.note === "string" && parsed.note.trim() !== "" ? parsed.note.trim().slice(0, 300) : null;
    const question =
      typeof parsed.question === "string" && parsed.question.trim() !== "" ? ensureQuestionMark(parsed.question.trim().slice(0, 300)) : null;

    return Response.json({
      days: days.length,
      repeats,
      note: repeats.length > 0 ? note : null,
      question,
      emotionCounts: [...emotionCounts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })),
      day1Answer,
    });
  } catch {
    return Response.json({ days: days.length, repeats: [], note: null, question: null, emotionCounts: [], day1Answer });
  }
}
