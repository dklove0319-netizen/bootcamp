// 21일 보고서 (S13 — 7개 구성). 원문 인용 중심, 숫자 집계는 서버, AI는 마지막 질문 하나만.
// 패턴 명명·유형 라벨·성장 평가·축하 전부 금지 (지시서 4·11번).
import { getAI } from "@vibe-kit/ai";
import { COURSE_MODEL } from "../../../lib/ai-models";
import { serviceStore } from "../../../lib/db";

export const runtime = "nodejs";

const STOPWORDS = new Set([
  "그리고", "그런데", "그래서", "하지만", "오늘", "어제", "내가", "나는", "나를", "나의", "그게", "이게", "저게",
  "것이", "것을", "했다", "있다", "없다", "같다", "너무", "정말", "진짜", "그냥", "조금", "많이", "하고", "해서",
]);

function topWords(texts: string[], n: number): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    for (const raw of t.split(/[\s.,!?…"'()\[\]~\-—:;]+/)) {
      const w = raw.trim();
      if (w.length < 2 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}

const FINAL_Q_PROMPT = `당신은 "오제로의 거울"이에요. 21일 기록을 마친 참가자에게 마지막 되묻는 질문 하나를 남겨요.
규칙: 제공된 기록에서 원문 한 조각을 골라 그대로 인용하고(quote_date, quote_src — 요약·의역 금지), 그 문장을 향한 되묻는 질문 하나. "왜" 시작 금지, 답 후보 금지, 평가·축하·위로 금지. ~이에요/해요체.
JSON 만: {"quote_date":"YYYY-MM-DD","quote_src":"","question":"..."}`;

export async function GET(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });

  // 활성/완료 여정 (mirror21)
  const jr = await fetch(
    `${store.url}/rest/v1/journeys?user_id=eq.${secret}&course=eq.mirror21&select=id,start_date,status&order=created_at.desc&limit=1`,
    { headers: store.headers, cache: "no-store" }
  );
  const journeys = jr.ok ? ((await jr.json()) as { id: number; start_date: string | null }[]) : [];
  if (journeys.length === 0) return Response.json({ error: "no-journey" }, { status: 404 });
  const journey = journeys[0];

  // 21일치 전 필드 한 번에 (N+1 금지)
  const er = await fetch(
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&journey_id=eq.${journey.id}&deleted_at=is.null&order=day_no.asc&select=entry_date,day_no,free_text,score_mood,score_emotion,score_energy,score_sleep,emotion_label,delusion_emotion_links,answer_text,action_text,action_result,submitted_at`,
    { headers: store.headers, cache: "no-store" }
  );
  const entries = er.ok ? ((await er.json()) as Record<string, unknown>[]) : [];
  const submitted = entries.filter((e) => e.submitted_at !== null);

  // 21일째 재설문 게이트
  const ar = await fetch(
    `${store.url}/rest/v1/assessments?user_id=eq.${secret}&instrument=eq.who5&select=phase,answers,total_score&order=created_at.asc`,
    { headers: store.headers, cache: "no-store" }
  );
  const assessments = ar.ok ? ((await ar.json()) as { phase: string; answers: number[]; total_score: number }[]) : [];
  const day0 = assessments.find((a) => a.phase === "day0") ?? null;
  const day21 = assessments.find((a) => a.phase === "day21") ?? null;
  if (day21 === null) {
    return Response.json({ needsDay21: true });
  }

  // ① 기록 사실 ② 눈금 추이 ③ 감정·단어 빈도 ⑤ 연결 ⑥ 설문
  const emotionCounts = new Map<string, number>();
  for (const e of submitted) {
    const label = e.emotion_label;
    if (typeof label === "string" && label !== "") emotionCounts.set(label, (emotionCounts.get(label) ?? 0) + 1);
  }
  const texts = submitted.map((e) => (typeof e.free_text === "string" ? e.free_text : "")).filter((t) => t !== "");
  const answersAt = (n: number) => {
    const e = entries.find((x) => x.day_no === n);
    return e !== undefined && typeof e.answer_text === "string" && e.answer_text !== ""
      ? { dayNo: n, date: e.entry_date as string, answer: e.answer_text as string }
      : { dayNo: n, date: null, answer: null };
  };
  const links: { delusion: string; emotion: string }[] = [];
  for (const e of submitted) {
    const ls = e.delusion_emotion_links;
    if (Array.isArray(ls)) {
      for (const l of ls as { delusion?: string; emotion?: string }[]) {
        if (typeof l.delusion === "string" && typeof l.emotion === "string") links.push({ delusion: l.delusion, emotion: l.emotion });
      }
    }
  }

  // ⑦ 마지막 질문 (AI — 인용 검증)
  const byDate = new Map<string, string>();
  for (const e of submitted) {
    if (typeof e.free_text === "string" && e.free_text !== "") byDate.set(e.entry_date as string, e.free_text as string);
  }
  let finalQuestion: { quoteDate: string | null; quoteSrc: string | null; question: string } = {
    quoteDate: null,
    quoteSrc: null,
    question: "21일의 기록에서, 지금도 몸이 반응하는 문장은 무엇인가요.",
  };
  try {
    const sample = [...byDate.entries()].filter((_, i) => i % 3 === 0).slice(0, 8); // 비용 절제 — 표본만
    const res = await getAI().messages.create({
      model: COURSE_MODEL,
      max_tokens: 500,
      system: FINAL_Q_PROMPT,
      messages: [{ role: "user", content: sample.map(([d, t]) => `[${d}]\n${t}`).join("\n\n") }],
    });
    const textBlock = res.content.find((c) => c.type === "text");
    const raw = textBlock !== undefined && textBlock.type === "text" ? textBlock.text : "";
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()) as {
      quote_date?: string; quote_src?: string; question?: string;
    };
    if (typeof parsed.question === "string" && parsed.question.trim() !== "") {
      const quoteOk =
        typeof parsed.quote_date === "string" &&
        typeof parsed.quote_src === "string" &&
        parsed.quote_src.trim() !== "" &&
        (byDate.get(parsed.quote_date) ?? "").includes(parsed.quote_src.trim());
      finalQuestion = {
        quoteDate: quoteOk ? (parsed.quote_date as string) : null,
        quoteSrc: quoteOk ? parsed.quote_src!.trim() : null,
        question: parsed.question.trim().slice(0, 400),
      };
    }
  } catch {
    // 예비 질문으로
  }

  return Response.json({
    recordedDays: submitted.length,
    missingDays: Math.max(0, 21 - submitted.length),
    scales: submitted.map((e) => ({
      dayNo: e.day_no, date: e.entry_date,
      mood: e.score_mood, emotion: e.score_emotion, energy: e.score_energy, sleep: e.score_sleep,
      emotionLabel: e.emotion_label,
    })),
    emotionCounts: [...emotionCounts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })),
    topWords: topWords(texts, 5),
    answers: [answersAt(1), answersAt(7), answersAt(14), answersAt(21)],
    links,
    who5: { day0: day0 === null ? null : day0.total_score, day21: day21.total_score },
    finalQuestion,
  });
}
