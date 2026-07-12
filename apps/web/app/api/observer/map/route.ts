// 나의 지도 (M-1) — 여러 날 돌아온 문장을 축으로, 그 문장이 나온 장면 원문·감정을 한 장에.
// AI 호출 없음: 저장된 구별(ai_split)·기록 원문·감정 눈금의 재배열만 — 지어내기 위험 0.
// 축은 사람이 아니라 문장 (상대 판결 금지). 코스 경계 없이 전체 제출 기록에서 집계 (축적 자산).
import { serviceStore } from "../../../../lib/db";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) {
    return Response.json({ error: "no-key" }, { status: 401 });
  }

  const er = await fetch(
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&deleted_at=is.null&submitted_at=not.is.null&order=entry_date.asc&select=entry_date,free_text,emotion_label,score_emotion,ai_split`,
    { headers: store.headers, cache: "no-store" }
  );
  const entries = er.ok ? ((await er.json()) as Record<string, unknown>[]) : [];

  type Scene = { date: string; excerpt: string; emotionLabel: string | null; emotionScore: number | null };
  const bySrc = new Map<string, Scene[]>();
  for (const e of entries) {
    const split = e.ai_split;
    if (!Array.isArray(split)) continue;
    const date = e.entry_date as string;
    const seen = new Set<string>(); // 같은 날 같은 조각은 한 번만
    for (const c of split as { src?: string; label?: string }[]) {
      if (c.label !== "delusion" || typeof c.src !== "string") continue;
      const src = c.src.trim();
      if (src === "" || seen.has(src)) continue;
      seen.add(src);
      if (!bySrc.has(src)) bySrc.set(src, []);
      bySrc.get(src)!.push({
        date,
        excerpt: typeof e.free_text === "string" ? e.free_text.slice(0, 200) : "",
        emotionLabel: typeof e.emotion_label === "string" && e.emotion_label !== "" ? e.emotion_label : null,
        emotionScore: typeof e.score_emotion === "number" ? e.score_emotion : null,
      });
    }
  }
  const sentences = [...bySrc.entries()]
    .map(([src, scenes]) => ({ src, days: new Set(scenes.map((s) => s.date)).size, scenes: scenes.slice(0, 6) }))
    .filter((s) => s.days >= 2)
    .sort((a, b) => b.days - a.days)
    .slice(0, 8);

  return Response.json({
    recordedDays: new Set(entries.map((e) => e.entry_date as string)).size,
    sentences,
  });
}
