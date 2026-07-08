// 하루 루프 6단계 — AI 거울 대조 (S07). 사용자 구별이 끝난 조각을 같은 순서로 거울이 다시 나눈다.
// 채점·일치율 없음. 어긋난 조각 1~2곳에만 카메라 기준 한 줄. 결과는 ai_split 로 저장.
import { getAI } from "@vibe-kit/ai";
import { COURSE_MODEL } from "../../../../lib/ai-models";
import { pickLocale, langLine } from "../../../../lib/locale";
import { serviceStore } from "../../../../lib/db";
import { loopWindow } from "../../../../lib/course";

export const runtime = "nodejs";

const PROMPT = `당신은 "오제로의 거울"이에요. 위로하지 않는 목격자예요. 판단하지 않고 비추기만 해요.

판별 기준: 사실 = 카메라와 녹음기에 담기는 것(행동/따옴표 속 말/숫자/몸의 반응/감정의 발생). 구체성 검사 — 평가어("좋은/무례하게")가 붙으면 망상, 사실은 구체 이름·숫자. 발생/내용 분리 — "~라는 생각이 들었다"의 판별은 내용 기준. 감정의 경계 — 발생 보고만 사실, 현재형 감정 감탄("지겹다 진짜")은 망상. 긍정도 안 찍히면 똑같이 망상(교정 톤 금지).

작업: 참가자가 오늘 기록을 조각으로 나누고 스스로 [사실/망상]으로 구별했어요. 같은 조각을 같은 순서로 거울의 눈으로 다시 나누세요 (fact/delusion/unclear).

규칙:
- reason 은 참가자와 다르게 본 조각 중 가장 선명한 1~2곳에만 — 카메라 기준 건조한 관찰 한 문장. 맞았다/틀렸다 금지. 같게 본 조각은 빈 문자열.
- 사람 라벨 금지. 위로·칭찬·조언·이모지 금지.
JSON 만: {"items":[{"label":"fact","reason":""}]} — items 는 조각 순서·개수 동일.`;

type Fragment = { src: string; label: string };

export async function POST(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });

  let fragments: Fragment[] = [];
  try {
    const body = (await req.json()) as { fragments?: Fragment[] };
    fragments = Array.isArray(body.fragments) ? body.fragments : [];
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const tagged = fragments.filter(
    (f) => typeof f.src === "string" && f.src.trim() !== "" && (f.label === "fact" || f.label === "delusion")
  );
  if (tagged.length === 0 || tagged.length > 60) return Response.json({ error: "bad-request" }, { status: 400 });

  const label = (l: string) => (l === "fact" ? "사실" : "망상");
  const msg = "참가자의 구별:\n" + tagged.map((f, i) => `${i + 1}. "${f.src}" — ${label(f.label)}`).join("\n");

  try {
    const res = await getAI().messages.create({
      model: COURSE_MODEL, // 코스는 Opus (사용자 확정 2026-07-05)
      max_tokens: 1500,
      system: PROMPT + "\n" + langLine(pickLocale(req.headers.get("accept-language"))),
      messages: [{ role: "user", content: msg }],
    });
    const textBlock = res.content.find((c) => c.type === "text");
    const raw = textBlock !== undefined && textBlock.type === "text" ? textBlock.text : "";
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(jsonText) as { items?: { label?: string; reason?: string }[] };
    const aiItems = Array.isArray(parsed.items) ? parsed.items : [];
    if (aiItems.length !== tagged.length) return Response.json({ error: "failed" }, { status: 502 });

    let budget = 2;
    const items = tagged.map((f, i) => {
      const mirror = ["fact", "delusion", "unclear"].includes(aiItems[i].label ?? "") ? (aiItems[i].label as string) : "unclear";
      const reasonRaw = typeof aiItems[i].reason === "string" ? (aiItems[i].reason as string).trim() : "";
      let reason: string | null = null;
      if (mirror !== f.label && reasonRaw !== "" && budget > 0) {
        reason = reasonRaw.slice(0, 300);
        budget--;
      }
      return { src: f.src, user: f.label, mirror, reason };
    });

    // ai_split 저장 (오늘 행)
    const profileR = await fetch(
      `${store.url}/rest/v1/profiles?user_id=eq.${secret}&select=record_hour,timezone`,
      { headers: store.headers, cache: "no-store" }
    );
    const profiles = profileR.ok ? ((await profileR.json()) as { record_hour: number; timezone: string }[]) : [];
    if (profiles.length > 0) {
      const { entryDate } = loopWindow(new Date(), profiles[0].timezone, profiles[0].record_hour);
      await fetch(`${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&entry_date=eq.${entryDate}`, {
        method: "PATCH",
        headers: { ...store.headers, prefer: "return=minimal" },
        body: JSON.stringify({ ai_split: items.map((c) => ({ src: c.src, label: c.mirror })), last_step: 6 }),
      });
    }

    return Response.json({ items });
  } catch {
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
