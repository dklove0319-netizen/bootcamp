// 21일 보고서 (S13 — 7개 구성). 원문 인용 중심, 숫자 집계는 서버, AI는 마지막 질문 하나만.
// 패턴 명명·유형 라벨·성장 평가·축하 전부 금지 (지시서 4·11번).
import { getAI } from "@vibe-kit/ai";
import { COURSE_MODEL } from "../../../lib/ai-models";
import { pickLocale, langLine, ensureQuestionMark } from "../../../lib/locale";
import { reflectionGrounded } from "../../../lib/course";
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

const FINAL_Q_PROMPT = `당신은 "오제로의 거울"이에요. 21일 기록을 마친 참가자에게 반복의 지도를 되비추고 마지막 되묻는 질문 하나를 남겨요.

찾는 것: 사건은 달라도(연애·가족·일·돈) 같은 계열의 해석이 서로 다른 날 2번 이상 반복된 구조.

출력 규칙:
- evidence: 그 반복을 이루는 원문 조각 2~3개 — 각각 해당 날짜 기록의 원문을 한 글자도 바꾸지 말고 그대로 (요약·의역·창작 금지). 서로 다른 날짜여야 해요.
- reflection: 반복이 실제로 있을 때만 딱 한 문장 — "당신은 [사건] 때문에 무너지는 게 아니라, 그 사건을 '[반복된 해석]'의 증거로 읽는 순간 무너집니다" 꼴. [반복된 해석] 자리에는 evidence 조각 하나를 그대로 넣으세요. 반복이 없으면 빈 문자열 — 지어내지 마세요. "당신은 ~한 사람" 구조(사람 라벨), 유형·성격·무의식 언급, 진단, 위로, 축하 금지.
- question: 마지막 되묻는 질문 하나 — reflection 이 있으면 그 구조를 향해, 없으면 가장 무게가 실린 원문 하나를 인용(quote_date, quote_src)해 그 문장을 향해. "왜" 시작 금지, 답 후보 금지, 평가·축하·위로 금지. 질문은 반드시 물음표(?)로 끝내세요.
JSON 만: {"reflection":"","evidence":[{"date":"YYYY-MM-DD","src":""}],"quote_date":"","quote_src":"","question":"..."}`;

export async function GET(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });

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
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&journey_id=eq.${journey.id}&deleted_at=is.null&order=day_no.asc&select=entry_date,day_no,free_text,score_mood,score_emotion,score_energy,score_sleep,emotion_label,delusion_emotion_links,ai_split,answer_text,action_text,action_result,submitted_at`,
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

  // 여러 날 돌아온 해석 — 거울이 가른 망상 조각이 서로 다른 날짜에 몇 번 나왔는지 (원문 그대로, 2일 이상만)
  const delusionDays = new Map<string, Set<string>>();
  for (const e of submitted) {
    const split = e.ai_split;
    if (!Array.isArray(split)) continue;
    for (const c of split as { src?: string; label?: string }[]) {
      if (c.label === "delusion" && typeof c.src === "string" && c.src.trim() !== "") {
        const key = c.src.trim();
        if (!delusionDays.has(key)) delusionDays.set(key, new Set());
        delusionDays.get(key)!.add(e.entry_date as string);
      }
    }
  }
  const repeatedDelusions = [...delusionDays.entries()]
    .map(([src, days]) => ({ src, days: days.size }))
    .filter((x) => x.days >= 2)
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);
  const answersAt = (n: number) => {
    const e = entries.find((x) => x.day_no === n);
    return e !== undefined && typeof e.answer_text === "string" && e.answer_text !== ""
      ? { dayNo: n, date: e.entry_date as string, answer: e.answer_text as string }
      : { dayNo: n, date: null, answer: null };
  };
  // 눈금 대조 — 기분이 가장 낮았던 날·높았던 날의 원문 (숫자는 그날의 기록과 나란히 놓을 때만 읽힌다 — 사용자 지시 2026-07-08)
  const moodScored = submitted.filter(
    (e) => typeof e.score_mood === "number" && typeof e.free_text === "string" && e.free_text !== ""
  );
  const pickDay = (e: Record<string, unknown>) => ({
    dayNo: e.day_no as number,
    date: e.entry_date as string,
    score: e.score_mood as number,
    text: (e.free_text as string).slice(0, 300),
  });
  let moodDays: { low: ReturnType<typeof pickDay> | null; high: ReturnType<typeof pickDay> | null } = { low: null, high: null };
  if (moodScored.length > 0) {
    const low = moodScored.reduce((a, b) => ((b.score_mood as number) < (a.score_mood as number) ? b : a));
    const high = moodScored.reduce((a, b) => ((b.score_mood as number) > (a.score_mood as number) ? b : a));
    moodDays = { low: pickDay(low), high: high === low ? null : pickDay(high) };
  }
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
  let finalQuestion: {
    quoteDate: string | null; quoteSrc: string | null; question: string;
    reflection?: string | null; evidence?: { date: string; src: string }[];
  } = {
    quoteDate: null,
    quoteSrc: null,
    question: pickLocale(req.headers.get("accept-language")) === "ko" ? "21일의 기록에서, 지금도 몸이 반응하는 문장은 무엇인가요?" : "From the 21 days of records, which sentence does your body still react to?",
  };
  try {
    const sample = [...byDate.entries()]; // 반복의 지도는 표본이 아니라 전체에서만 보인다 (코스당 1회라 비용 허용 — E-4)
    const res = await getAI().messages.create({
      model: COURSE_MODEL,
      max_tokens: 900,
      system: FINAL_Q_PROMPT + "\n" + langLine(pickLocale(req.headers.get("accept-language"))),
      messages: [{ role: "user", content: sample.map(([d, t]) => `[${d}]\n${t}`).join("\n\n") }],
    });
    const textBlock = res.content.find((c) => c.type === "text");
    const raw = textBlock !== undefined && textBlock.type === "text" ? textBlock.text : "";
    const strippedR = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(strippedR.includes("{") ? strippedR.slice(strippedR.indexOf("{"), strippedR.lastIndexOf("}") + 1) : strippedR) as {
      reflection?: string; evidence?: { date?: string; src?: string }[];
      quote_date?: string; quote_src?: string; question?: string;
    };
    if (typeof parsed.question === "string" && parsed.question.trim() !== "") {
      const quoteOk =
        typeof parsed.quote_date === "string" &&
        typeof parsed.quote_src === "string" &&
        parsed.quote_src.trim() !== "" &&
        (byDate.get(parsed.quote_date) ?? "").includes(parsed.quote_src.trim());
      // 구조 반사 검증 (E-4 — E-2와 동일 기준): 원문 대조 + 다른 날짜 2개 이상 + 반사가 검증 조각 포함. 아니면 폐기.
      let evidence = (Array.isArray(parsed.evidence) ? parsed.evidence : [])
        .filter(
          (ev): ev is { date: string; src: string } =>
            typeof ev.date === "string" && typeof ev.src === "string" && ev.src.trim() !== "" &&
            (byDate.get(ev.date) ?? "").includes(ev.src.trim())
        )
        .map((ev) => ({ date: ev.date, src: ev.src.trim().slice(0, 300) }))
        .slice(0, 3);
      const cand = typeof parsed.reflection === "string" ? parsed.reflection.trim().slice(0, 400) : "";
      const distinct = new Set(evidence.map((ev) => ev.date));
      const reflection = cand !== "" && distinct.size >= 2 && reflectionGrounded(cand, evidence.map((ev) => ev.src)) ? cand : null;
      if (reflection === null) evidence = [];
      finalQuestion = {
        quoteDate: quoteOk ? (parsed.quote_date as string) : null,
        quoteSrc: quoteOk ? parsed.quote_src!.trim() : null,
        question: ensureQuestionMark(parsed.question.trim().slice(0, 400)),
        reflection,
        evidence,
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
    repeatedDelusions,
    moodDays,
    answers: [answersAt(1), answersAt(7), answersAt(14), answersAt(21)],
    links,
    who5: { day0: day0 === null ? null : day0.total_score, day21: day21.total_score },
    finalQuestion,
  });
}
