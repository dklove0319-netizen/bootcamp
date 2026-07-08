// 하루 루프 10단계 — 행동 제안 (S10). 명시적 요청(버튼) 시에만 노출 — 행동의 주어는 사용자 (원칙 5).
import { getAI } from "@vibe-kit/ai";
import { COURSE_MODEL } from "../../../../lib/ai-models";
import { pickLocale, langLine } from "../../../../lib/locale";

export const runtime = "nodejs";

const PROMPT = `당신은 "오제로의 거울"이에요. 참가자가 내일 할 작은 행동의 예시를 요청했어요.

규칙:
- 오늘 기록에 닿아 있는, 10분 안에 끝나는 아주 작은 행동 1~2개. 명령형 아닌 평서형 ("~해보기").
- 조언·훈계·이유 설명 금지 — 행동 문장만. 치료·회복·힐링 어휘 금지. 이모지 금지.
JSON 만: {"suggestions":["...","..."]}`;

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });

  let text = "";
  try {
    const body = (await req.json()) as { freeText?: string };
    text = typeof body.freeText === "string" ? body.freeText.slice(0, 2000) : "";
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }

  try {
    const res = await getAI().messages.create({
      model: COURSE_MODEL,
      max_tokens: 300,
      system: PROMPT + "\n" + langLine(pickLocale(req.headers.get("accept-language"))),
      messages: [{ role: "user", content: `오늘의 기록:\n${text}` }],
    });
    const textBlock = res.content.find((c) => c.type === "text");
    const raw = textBlock !== undefined && textBlock.type === "text" ? textBlock.text : "";
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(jsonText) as { suggestions?: string[] };
    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .filter((s) => typeof s === "string" && s.trim() !== "")
      .slice(0, 2)
      .map((s) => s.trim().slice(0, 120));
    return Response.json({ suggestions });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
