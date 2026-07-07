// 오제로 아이디 발급/이어받기 + 첫 거울 저장 (스텝 3-0 · 명세: docs/plan/screens/S17-무료측정.md)
// 하는 일:
//  - mode 'new'     → 가입 순서대로 다음 코드 발급 (레터 55명 다음 = o056부터)
//  - mode 'existing'→ 레터에서 받은 오제로 아이디를 그대로 이어받기 (앱에 없던 코드만)
//  그 아래 profiles(관찰자) + journeys(trial3 여정) + daily_entries(오늘 거울) 저장.
//  브라우저엔 [보여줄 아이디(observer_code) + 비밀 열쇠(secret=user_id)]를 돌려준다.
//  비밀 열쇠는 브라우저에만 보관되고, 이후 모든 내 데이터 접근의 신원이 된다 (주소·비번 없는 익명 신원).
//  ⚠ 신원 확인 없는 익명 단계라 남의 코드를 사칭 입력하는 것 자체는 못 막는다(코드 아래 데이터는 없음).
//    본인 기기 열쇠가 진짜 관문이고, 기기 바꿔도 되찾는 건 매직링크(스텝 3-1)에서 붙는다.
import { randomUUID } from "node:crypto";
import { serviceStore, today, type Store } from "../../../lib/db";
import { pickLocale, type Locale } from "../../../lib/locale";

export const runtime = "nodejs";

const MSG: Record<Locale, Record<string, string>> = {
  ko: {
    badRequest: "잘못된 요청이에요.",
    codeInvalid: "아이디 형식이 맞지 않아요. 예: o023",
    codeTaken: "이미 등록된 아이디예요. 처음이라면 새 아이디를 받아주세요.",
    unavailable: "저장 창고가 아직 연결되지 않았어요.",
    failed: "저장하지 못했어요. 다시 시도해주세요.",
  },
  en: {
    badRequest: "Invalid request.",
    codeInvalid: "That ID format is not right. Example: o023",
    codeTaken: "That ID is already registered. If you're new, get a fresh ID.",
    unavailable: "The store is not connected yet.",
    failed: "Could not save. Please try again.",
  },
};

type Split = { src: string; label: string };
type CreateBody = {
  mode?: "new" | "existing";
  code?: string;
  recordHour?: number;
  timezone?: string;
  measurement?: {
    freeText?: string;
    userSplit?: Split[];
    aiSplit?: Split[];
    question?: string | null;
    answer?: string | null; // 결과 화면에서 질문에 남긴 답 — 내일 회수의 재료
  };
};

/** 입력 코드를 표준형으로: 공백 제거·소문자·'o' 보정·3자리 0채움. 형식 안 맞으면 null.
 *  o000 = 운영자(레터 발행인) 본인 번호 — 0번도 유효하다. */
function normalizeCode(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^o/, "");
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = parseInt(s, 10);
  return "o" + String(n).padStart(3, "0");
}

/** 창고에 등록된 코드들을 읽어 다음 발급 번호를 정한다 (레터 55명 다음 = 최소 56) */
async function nextCode(store: Store): Promise<string> {
  const r = await fetch(`${store.url}/rest/v1/profiles?select=observer_code`, {
    headers: store.headers,
    cache: "no-store",
  });
  const rows = r.ok ? ((await r.json()) as { observer_code: string }[]) : [];
  let max = 55; // 레터에서 o055까지 발급됨 — 앱은 o056부터
  for (const row of rows) {
    const m = /^o(\d+)$/.exec(row.observer_code ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return "o" + String(max + 1).padStart(3, "0");
}

export async function POST(req: Request): Promise<Response> {
  const t = MSG[pickLocale(req.headers.get("accept-language"))];
  const store = serviceStore();
  if (store === null) {
    return Response.json({ error: t.unavailable }, { status: 503 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return Response.json({ error: t.badRequest }, { status: 400 });
  }

  const recordHour =
    typeof body.recordHour === "number" && body.recordHour >= 0 && body.recordHour <= 23
      ? Math.floor(body.recordHour)
      : 21;
  const timezone = typeof body.timezone === "string" && body.timezone.length > 0 ? body.timezone : "Asia/Seoul";

  // 이어받기: 입력 코드 검증 → 이미 등록됐으면 사칭 방지로 거절 (본인 되찾기는 3-1 매직링크)
  let observerCode: string;
  if (body.mode === "existing") {
    const norm = body.code !== undefined ? normalizeCode(body.code) : null;
    if (norm === null) {
      return Response.json({ error: t.codeInvalid }, { status: 400 });
    }
    const check = await fetch(
      `${store.url}/rest/v1/profiles?observer_code=eq.${norm}&select=observer_code`,
      { headers: store.headers, cache: "no-store" }
    );
    const taken = check.ok ? ((await check.json()) as unknown[]) : [];
    if (taken.length > 0) {
      return Response.json({ error: t.codeTaken }, { status: 409 });
    }
    observerCode = norm;
  } else {
    observerCode = await nextCode(store);
  }

  const userId = randomUUID(); // 브라우저에만 보관될 비밀 열쇠 = 익명 신원

  // 1) 관찰자 등록. 새 코드 발급이 동시 요청과 부딪히면(중복) 몇 번 다시 뽑는다
  let profileOk = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`${store.url}/rest/v1/profiles`, {
      method: "POST",
      headers: { ...store.headers, prefer: "return=minimal" },
      body: JSON.stringify({ user_id: userId, observer_code: observerCode, record_hour: recordHour, timezone }),
    });
    if (r.ok) {
      profileOk = true;
      break;
    }
    if (r.status === 409 && body.mode !== "existing") {
      observerCode = await nextCode(store); // 번호가 겹쳤으니 다음 번호로
      continue;
    }
    if (r.status === 409) {
      return Response.json({ error: t.codeTaken }, { status: 409 });
    }
    break;
  }
  if (!profileOk) {
    return Response.json({ error: t.failed }, { status: 502 });
  }

  // 2) 여정 시작(무료 3일 미니 거울 = trial3) + 3) 오늘 거울 저장.
  //    아이디 발급이 핵심이므로, 기록 저장이 실패해도 아이디는 돌려준다(회수 자체는 성공).
  const m = body.measurement;
  if (m !== undefined && typeof m.freeText === "string" && m.freeText.trim() !== "") {
    try {
      const jr = await fetch(`${store.url}/rest/v1/journeys`, {
        method: "POST",
        headers: { ...store.headers, prefer: "return=representation" },
        body: JSON.stringify({ user_id: userId, course: "trial3", start_date: today(), status: "active" }),
      });
      const journeys = jr.ok ? ((await jr.json()) as { id: number }[]) : [];
      const journeyId = journeys.length > 0 ? journeys[0].id : null;
      if (journeyId !== null) {
        await fetch(`${store.url}/rest/v1/daily_entries`, {
          method: "POST",
          headers: { ...store.headers, prefer: "return=minimal" },
          body: JSON.stringify({
            user_id: userId,
            journey_id: journeyId,
            entry_date: today(),
            day_no: 1,
            free_text: m.freeText,
            user_split: Array.isArray(m.userSplit) ? m.userSplit : null,
            ai_split: Array.isArray(m.aiSplit) ? m.aiSplit : null,
            question_text: typeof m.question === "string" ? m.question : null,
            answer_text: typeof m.answer === "string" && m.answer.trim() !== "" ? m.answer.trim() : null,
            submitted_at: new Date().toISOString(),
          }),
        });
      }
    } catch {
      // 기록 저장 실패는 아이디 발급을 막지 않는다
    }
  }

  return Response.json({ observerCode, secret: userId, recordHour, timezone });
}
