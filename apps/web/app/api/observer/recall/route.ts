// 어제의 회수 — "내일 돌아온다"는 약속을 지키는 창구 (스텝 3-0b · 자세규정 5장: 인용은 실제 기록에서만)
// 하는 일: 비밀 열쇠로 신원 확인 → 오늘 이전의 가장 최근 기록에서 [질문 + 답]을 찾아 →
// 답이 있으면 거울의 되비춤 한두 문장을 생성해 함께 돌려준다. 생성물은 그 기록에 저장해 재생성을 막는다.
import { getAI } from "@vibe-kit/ai";
import { MEASURE_MODEL } from "../../../../lib/ai-models";
import { serviceStore, today } from "../../../../lib/db";

export const runtime = "nodejs";

// 자세규정 압축: 판정·칭찬·조언 없음, 인용으로 가르고, 열어둔 채 끝낼 수 있다
const RECALL_PROMPT = `당신은 "오제로의 거울"이에요. 위로하지 않는 목격자예요. 어제 거울이 남긴 질문에 참가자가 답을 남겼어요. 그 답을 되비추세요.

판별 경계 (중요):
- 감정의 발생은 사실이에요 — "서운함이 올라왔다", "화가 났다", 몸의 감각 전부. 감정의 이유·의미·비교("나만 ~한 것 같다", "~때문에")부터가 해석이에요.
- 생각의 발생도 사실, 생각의 내용이 해석이면 내용만 해석이에요.

규칙:
- 두 문장 이내. 답에서 카메라에 담기는 부분(행동·말·숫자·감정의 발생)과 해석 부분이 섞여 있으면 원문 인용으로 가르세요.
- 판정·칭찬·위로·조언·이모지 금지. "맞았다/틀렸다" 금지. 사람 라벨 금지.
- 답과 같은 언어로. 한국어면 ~이에요/~해요체. 건조하게.
- 마지막은 관찰로 끝나도 되고, 되묻는 질문 하나로 끝나도 돼요 ('왜' 시작 금지, 답 후보 금지).

JSON 으로만 답하세요: {"reflection":"되비춤 한두 문장"}`;

export async function GET(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) {
    return Response.json({ error: "no-key" }, { status: 401 });
  }

  // 오늘 이전의 가장 최근 기록 (질문이 남아 있는 것)
  const er = await fetch(
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&deleted_at=is.null&entry_date=lt.${today()}&question_text=not.is.null&order=entry_date.desc&limit=1&select=id,entry_date,question_text,answer_text,question_quote_text`,
    { headers: store.headers, cache: "no-store" }
  );
  const rows = er.ok
    ? ((await er.json()) as {
        id: number;
        entry_date: string;
        question_text: string;
        answer_text: string | null;
        question_quote_text: string | null;
      }[])
    : [];
  if (rows.length === 0) {
    return Response.json({ none: true });
  }
  const entry = rows[0];

  // 답이 없으면 질문만 돌려준다 (추정으로 채우지 않는다 — 자세규정 5장)
  if (entry.answer_text === null || entry.answer_text.trim() === "") {
    return Response.json({
      date: entry.entry_date,
      question: entry.question_text,
      answer: null,
      reflection: null,
    });
  }

  // 이미 생성해 둔 되비춤이 있으면 그대로 (AI 재호출 방지)
  if (entry.question_quote_text !== null && entry.question_quote_text.trim() !== "") {
    return Response.json({
      date: entry.entry_date,
      question: entry.question_text,
      answer: entry.answer_text,
      reflection: entry.question_quote_text,
    });
  }

  // 되비춤 생성
  let reflection: string | null = null;
  try {
    const res = await getAI().messages.create({
      model: MEASURE_MODEL,
      max_tokens: 500,
      thinking: { type: "disabled" },
      system: RECALL_PROMPT,
      messages: [
        {
          role: "user",
          content: `어제의 질문: ${entry.question_text}\n\n참가자의 답: ${entry.answer_text}`,
        },
      ],
    });
    const textBlock = res.content.find((c) => c.type === "text");
    const raw = textBlock !== undefined && textBlock.type === "text" ? textBlock.text : "";
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(jsonText) as { reflection?: string };
    reflection =
      typeof parsed.reflection === "string" && parsed.reflection.trim() !== ""
        ? parsed.reflection.trim().slice(0, 600)
        : null;
  } catch {
    reflection = null; // 생성 실패해도 어제의 질문·답 회수는 돌려준다
  }

  // 생성물 저장 (같은 회수를 다시 만들지 않게 — question_quote_* 칸을 되비춤 보관에 사용)
  if (reflection !== null) {
    try {
      await fetch(`${store.url}/rest/v1/daily_entries?id=eq.${entry.id}`, {
        method: "PATCH",
        headers: { ...store.headers, prefer: "return=minimal" },
        body: JSON.stringify({ question_quote_text: reflection, question_quote_date: today() }),
      });
    } catch {
      // 저장 실패는 응답을 막지 않는다
    }
  }

  return Response.json({
    date: entry.entry_date,
    question: entry.question_text,
    answer: entry.answer_text,
    reflection,
  });
}
