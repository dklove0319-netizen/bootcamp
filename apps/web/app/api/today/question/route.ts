// 하루 루프 8단계 — 오늘의 질문 (S09) + 구조 반사 (반복구조 엔진 E-2 · 제안서: changes/2026-07-08-반복구조-엔진.md)
// 하는 일: 사건은 달라도 같은 해석 구조가 반복되면 [공식 문장 + 원문 근거 2~3개 + 보정 질문]으로 반사한다.
// 절대 규칙: 인용은 실제 기록 원문+날짜만 (서버가 부분일치 검증) — 근거가 검증을 통과 못 하면 반사 전체를 버린다 (바넘 차단).
// 사람에게 이름 붙이지 않는다 — 이름은 '읽는 구조'에만. 목표는 감탄이 아니라 데이터의 정확한 반영.
import { getAI } from "@vibe-kit/ai";
import { COURSE_MODEL } from "../../../../lib/ai-models";
import { serviceStore } from "../../../../lib/db";
import { loopWindow } from "../../../../lib/course";

export const runtime = "nodejs";

const FALLBACK_KO = "오늘의 기록에서 가장 오래 남는 문장은 무엇인가요.";

const PROMPT = `당신은 "오제로의 거울"이에요. 위로하지 않는 목격자예요. 참가자의 누적 기록에서 반복되는 해석 구조를 찾아 오늘의 반사와 질문을 만들어요.

찾는 것: 사건은 달라도(연애·가족·일·돈) 같은 계열의 해석이 서로 다른 날 2번 이상 반복되는 구조. 참가자는 매번 다른 일이라고 느끼지만, 데이터에는 같은 구조가 남아요 — 그걸 세어서 보여주는 게 이 거울의 일이에요.

출력 규칙:
- evidence: 그 반복을 이루는 원문 조각 2~3개. 각각 해당 날짜 기록의 원문을 한 글자도 바꾸지 말고 그대로 잘라 넣으세요 (요약·의역·창작 금지). 서로 다른 날짜여야 해요. 오늘 기록의 조각도 포함할 수 있어요.
- reflection: 반복이 실제로 있을 때만 딱 한 문장 — "당신은 [사건] 때문에 무너지는 게 아니라, 그 사건을 '[반복된 해석]'의 증거로 읽는 순간 무너집니다" 꼴. [반복된 해석] 자리에는 evidence 조각 중 하나를 그대로 넣으세요. '무너집니다' 자리는 기록에 맞는 동사로 바꿔도 돼요(방어가 올라옵니다, 불안해집니다 등). 반복이 없으면 빈 문자열 — 지어내지 마세요. 목표는 참가자의 감탄("정확해!")이 아니라 데이터의 정확한 반영이에요. 감탄을 노리는 순간 이 거울은 오염돼요. 반복이 안 보이면 "안 보인다"가 정답이에요.
- reflection 금지: "당신은 ~한 사람" 구조(사람에 이름 붙이기), 유형·성격·무의식·패턴명 언급, 진단, 위로, 조언, 교정. 이름은 사람이 아니라 '읽는 구조'에만 붙여요.
- question: reflection 이 있으면 보정 질문 — "이 문장은 0에서 10 중 몇 점쯤 맞나요. 틀렸다면 어느 부분이 가장 다르게 느껴지나요" 형태. 참가자의 원문 표현 중 더 가까운 말을 고르게 해도 좋아요 — 단 원문에 실제로 있는 표현만. reflection 이 없으면: 과거 기록에서 오늘과 나란히 놓을 문장 하나를 그대로 인용하고(quote_date, quote_src) 해석 아래를 여는 되묻는 질문 하나. "왜" 시작 금지, 답 후보 금지(원문 표현 고르기는 예외), 판정·단정·위로·조언 금지.
- ~이에요/해요체. 건조하게.
JSON 만: {"reflection":"","evidence":[{"date":"YYYY-MM-DD","src":""}],"quote_date":"","quote_src":"","question":"..."}`;

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

  // 누적 기록 (오늘 이전 최대 21일 — 코스 전체. 반복 구조는 시간축 전체에서만 보인다)
  const er = await fetch(
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&deleted_at=is.null&entry_date=lt.${entryDate}&order=entry_date.desc&limit=21&select=entry_date,free_text,answer_text`,
    { headers: store.headers, cache: "no-store" }
  );
  const past = er.ok ? ((await er.json()) as { entry_date: string; free_text: string | null; answer_text: string | null }[]) : [];
  const byDate = new Map<string, string>();
  for (const p of past) {
    const combined = [p.free_text ?? "", p.answer_text ?? ""].filter((s) => s !== "").join("\n");
    if (combined !== "") byDate.set(p.entry_date, combined);
  }
  // 인용 검증용 지도에는 오늘 기록도 포함 (근거에 오늘 조각이 올 수 있다)
  const verifyMap = new Map(byDate);
  if (todayText !== "") verifyMap.set(entryDate, todayText);

  const msg =
    `오늘(${entryDate})의 기록:\n${todayText}\n\n` +
    (byDate.size > 0
      ? "과거 기록:\n" + [...byDate.entries()].map(([d, t]) => `[${d}]\n${t}`).join("\n\n")
      : "(과거 기록 없음 — 첫날이에요)");

  let question = FALLBACK_KO;
  let quoteDate: string | null = null;
  let quoteSrc: string | null = null;
  let reflection: string | null = null;
  let evidence: { date: string; src: string }[] = [];
  try {
    const res = await getAI().messages.create({
      model: COURSE_MODEL,
      max_tokens: 900,
      system: PROMPT,
      messages: [{ role: "user", content: msg }],
    });
    const textBlock = res.content.find((c) => c.type === "text");
    const raw = textBlock !== undefined && textBlock.type === "text" ? textBlock.text : "";
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(jsonText) as {
      reflection?: string;
      evidence?: { date?: string; src?: string }[];
      quote_date?: string;
      quote_src?: string;
      question?: string;
    };
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
    // 구조 반사 검증 (E-2): 근거 조각이 그 날짜 원문에 실제로 있어야 하고,
    // 서로 다른 날짜 2개 이상이어야 하며, 반사 문장이 검증된 조각 하나를 그대로 담고 있어야 한다.
    // 하나라도 어긋나면 반사 전체를 버린다 — 지어낸 반사는 바넘이다.
    evidence = (Array.isArray(parsed.evidence) ? parsed.evidence : [])
      .filter(
        (e): e is { date: string; src: string } =>
          typeof e.date === "string" &&
          typeof e.src === "string" &&
          e.src.trim() !== "" &&
          (verifyMap.get(e.date) ?? "").includes(e.src.trim())
      )
      .map((e) => ({ date: e.date, src: e.src.trim().slice(0, 300) }))
      .slice(0, 3);
    const distinctDates = new Set(evidence.map((e) => e.date));
    const cand = typeof parsed.reflection === "string" ? parsed.reflection.trim().slice(0, 400) : "";
    if (cand !== "" && distinctDates.size >= 2 && evidence.some((e) => cand.includes(e.src))) {
      reflection = cand;
    } else {
      evidence = []; // 반사가 못 서면 근거도 내보내지 않는다 — 반쪽 반사 금지
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

  return Response.json({ question, quoteDate, quoteSrc, reflection, evidence });
}
