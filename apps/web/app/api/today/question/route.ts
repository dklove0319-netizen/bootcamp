// 하루 루프 8단계 — 오늘의 질문 (S09). 누적 기록에서 원문 인용 + 되묻는 질문.
// 절대 규칙: 인용은 실제 기록 원문+날짜만 (서버가 부분일치 검증). 실패 시 예비 고정 질문 — 루프를 끊지 않는다.
import { getAI } from "@vibe-kit/ai";
import { COURSE_MODEL } from "../../../../lib/ai-models";
import { serviceStore } from "../../../../lib/db";
import { loopWindow } from "../../../../lib/course";

export const runtime = "nodejs";

const FALLBACK_KO = "오늘의 기록에서 가장 오래 남는 문장은 무엇인가요.";

const PROMPT = `당신은 "오제로의 거울"이에요. 위로하지 않는 목격자예요. 참가자의 누적 기록을 읽고 오늘의 질문 하나를 만들어요.

규칙:
- 과거 기록에서 오늘의 기록과 나란히 놓을 가치가 있는 문장 하나를 골라 그대로 인용하세요 (quote_date, quote_src — 원문 조각 그대로, 요약·의역 금지). 과거 기록이 없거나 고를 문장이 없으면 quote_src 를 빈 문자열로 두고 오늘 기록의 추상 표현을 되물으세요.
- question: 인용과 오늘의 기록을 나란히 놓게 하는 되묻는 질문 딱 하나. "왜" 시작 금지, 답 후보 금지, 판정·단정·위로·조언 금지. 해석 아래(감정·반복·예측)를 여는 형태 우선.
- ~이에요/해요체. 건조하게.
JSON 만: {"quote_date":"YYYY-MM-DD","quote_src":"","question":"..."}`;

export async function POST(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });

  const pr = await fetch(
    `${store.url}/rest/v1/profiles?user_id=eq.${secret}&select=record_hour,timezone`,
    { headers: store.headers, cache: "no-store" }
  );
  const profiles = pr.ok ? ((await pr.json()) as { record_hour: number; timezone: string }[]) : [];
  if (profiles.length === 0) return Response.json({ error: "not-found" }, { status: 404 });
  const { entryDate } = loopWindow(new Date(), profiles[0].timezone, profiles[0].record_hour);

  // 이미 만든 질문이 있으면 그대로 (하루 1질문)
  const tr = await fetch(
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&entry_date=eq.${entryDate}&select=question_text,free_text`,
    { headers: store.headers, cache: "no-store" }
  );
  const todayRows = tr.ok ? ((await tr.json()) as { question_text: string | null; free_text: string | null }[]) : [];
  if (todayRows.length > 0 && todayRows[0].question_text !== null && todayRows[0].question_text !== "") {
    return Response.json({ question: todayRows[0].question_text, quoteDate: null, quoteSrc: null });
  }
  const todayText = todayRows.length > 0 ? (todayRows[0].free_text ?? "") : "";

  // 누적 기록 (오늘 이전 최대 10일)
  const er = await fetch(
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&deleted_at=is.null&entry_date=lt.${entryDate}&order=entry_date.desc&limit=10&select=entry_date,free_text,answer_text`,
    { headers: store.headers, cache: "no-store" }
  );
  const past = er.ok ? ((await er.json()) as { entry_date: string; free_text: string | null; answer_text: string | null }[]) : [];
  const byDate = new Map<string, string>();
  for (const p of past) {
    const combined = [p.free_text ?? "", p.answer_text ?? ""].filter((s) => s !== "").join("\n");
    if (combined !== "") byDate.set(p.entry_date, combined);
  }

  const msg =
    `오늘(${entryDate})의 기록:\n${todayText}\n\n` +
    (byDate.size > 0
      ? "과거 기록:\n" + [...byDate.entries()].map(([d, t]) => `[${d}]\n${t}`).join("\n\n")
      : "(과거 기록 없음 — 첫날이에요)");

  let question = FALLBACK_KO;
  let quoteDate: string | null = null;
  let quoteSrc: string | null = null;
  try {
    const res = await getAI().messages.create({
      model: COURSE_MODEL,
      max_tokens: 600,
      system: PROMPT,
      messages: [{ role: "user", content: msg }],
    });
    const textBlock = res.content.find((c) => c.type === "text");
    const raw = textBlock !== undefined && textBlock.type === "text" ? textBlock.text : "";
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(jsonText) as { quote_date?: string; quote_src?: string; question?: string };
    if (typeof parsed.question === "string" && parsed.question.trim() !== "") {
      question = parsed.question.trim().slice(0, 400);
    }
    // 인용 검증: 그 날짜 원문의 실제 조각만 인정 (지어내기 차단)
    if (
      typeof parsed.quote_date === "string" &&
      typeof parsed.quote_src === "string" &&
      parsed.quote_src.trim() !== "" &&
      (byDate.get(parsed.quote_date) ?? "").includes(parsed.quote_src.trim())
    ) {
      quoteDate = parsed.quote_date;
      quoteSrc = parsed.quote_src.trim().slice(0, 300);
    }
  } catch {
    // 예비 질문으로 진행
  }

  // 저장 (오늘 행에)
  await fetch(`${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&entry_date=eq.${entryDate}`, {
    method: "PATCH",
    headers: { ...store.headers, prefer: "return=minimal" },
    body: JSON.stringify({ question_text: question, question_quote_date: quoteDate, question_quote_text: quoteSrc, last_step: 8 }),
  }).catch(() => {});

  return Response.json({ question, quoteDate, quoteSrc });
}
