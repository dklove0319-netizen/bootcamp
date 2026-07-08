// 저녁 질문 푸시 발송기 (블럭 8-1 · 지시서 5번) — 매시 정각에 외부 시계(GitHub Actions)가 이 창구를 부른다.
// 하는 일: 지금 시각이 자기 기록 시각(record_hour)인 활성 여정 관찰자에게 푸시 1건.
// 안전장치: 기록창 날짜(entry_date)당 1회만 (last_sent_date) — 누가 여러 번 불러도 중복 발송 없음 → 인증 없이 열어도 무해.
// 문구는 두 가지뿐: 기본 = "오늘의 기록 시간이 열렸어요." / 3일 연속 미기록 = 지시서 고정 문구. 재촉·마케팅 없음.
import webpush from "web-push";
import { serviceStore } from "../../../../lib/db";
import { loopWindow, dayNoOf, courseLength } from "../../../../lib/course";
import { adminAuthed } from "../../../../lib/admin";

export const runtime = "nodejs";

type Profile = { user_id: string; observer_code: string; record_hour: number; timezone: string };
type Journey = { user_id: string; course: string; status: string; start_date: string | null };
type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string; last_sent_date: string | null };

function localHour(tz: string): number {
  const h = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date());
  return parseInt(h, 10) % 24;
}
function shiftDate(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const pub = process.env.VAPID_PUBLIC_KEY ?? "";
  const priv = process.env.VAPID_PRIVATE_KEY ?? "";
  if (pub === "" || priv === "") return Response.json({ error: "vapid-missing" }, { status: 503 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@example.com", pub, priv);

  // 시험용 시각 지정(?hour=)은 운영자 암호가 있을 때만 — 실시계는 조작 불가
  const hourParam = new URL(req.url).searchParams.get("hour");
  const forcedHour = hourParam !== null && adminAuthed(req) ? parseInt(hourParam, 10) : null;

  // 표 4개를 한 번씩만 읽는다 (N+1 금지)
  const [pr, jr, sr] = await Promise.all([
    fetch(`${store.url}/rest/v1/profiles?deleted_at=is.null&select=user_id,observer_code,record_hour,timezone`, { headers: store.headers, cache: "no-store" }),
    fetch(`${store.url}/rest/v1/journeys?status=eq.active&select=user_id,course,status,start_date&order=id.desc`, { headers: store.headers, cache: "no-store" }),
    fetch(`${store.url}/rest/v1/push_subs?select=endpoint,user_id,p256dh,auth,last_sent_date`, { headers: store.headers, cache: "no-store" }),
  ]);
  if (!sr.ok) return Response.json({ error: "table-missing" }, { status: 503 }); // push_subs 표(블럭8 SQL) 실행 전
  const profiles: Profile[] = pr.ok ? await pr.json() : [];
  const journeys: Journey[] = jr.ok ? await jr.json() : [];
  const subs: Sub[] = await sr.json();

  const journeyOf = new Map<string, Journey>();
  for (const j of journeys) if (!journeyOf.has(j.user_id)) journeyOf.set(j.user_id, j);
  const subsOf = new Map<string, Sub[]>();
  for (const s of subs) subsOf.set(s.user_id, [...(subsOf.get(s.user_id) ?? []), s]);

  // 이번 시각에 창이 열리는 사람 + 아직 안 보낸 구독 고르기
  const targets: { p: Profile; entryDate: string; subs: Sub[] }[] = [];
  for (const p of profiles) {
    const mySubs = subsOf.get(p.user_id) ?? [];
    if (mySubs.length === 0) continue;
    const j = journeyOf.get(p.user_id);
    if (j === undefined) continue; // 활성 여정 없는 사람에겐 보내지 않는다
    const hour = forcedHour ?? localHour(p.timezone);
    if (hour !== p.record_hour) continue;
    const { entryDate } = loopWindow(new Date(), p.timezone, p.record_hour);
    if (j.start_date !== null && dayNoOf(entryDate, j.start_date) > courseLength(j.course)) continue; // 코스 끝난 사람 제외
    const due = mySubs.filter((s) => s.last_sent_date === null || s.last_sent_date < entryDate);
    if (due.length > 0) targets.push({ p, entryDate, subs: due });
  }
  let sent = 0;
  let cleaned = 0;
  let reminded = 0;

  if (targets.length > 0) {
  // 3일 연속 미기록 판별 재료 — 직전 3일의 제출 기록을 한 번에 읽는다
  const minDate = shiftDate(targets.map((t) => t.entryDate).sort()[0], -3);
  const er = await fetch(
    `${store.url}/rest/v1/daily_entries?deleted_at=is.null&entry_date=gte.${minDate}&submitted_at=not.is.null&select=user_id,entry_date&user_id=in.(${targets.map((t) => t.p.user_id).join(",")})`,
    { headers: store.headers, cache: "no-store" }
  );
  const recent: { user_id: string; entry_date: string }[] = er.ok ? await er.json() : [];
  const submittedSet = new Set(recent.map((r) => r.user_id + "|" + r.entry_date));

  for (const t of targets) {
    const missed3 = [1, 2, 3].every((n) => !submittedSet.has(t.p.user_id + "|" + shiftDate(t.entryDate, -n)));
    const body = missed3
      ? "3일째 기록이 없습니다. 안 쓴 날들도 데이터입니다."
      : "오늘의 기록 시간이 열렸어요.";
    const payload = JSON.stringify({ title: "오제로의 거울", body, url: "/today" });
    const results = await Promise.allSettled(
      t.subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload))
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        sent++;
        await fetch(`${store.url}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(t.subs[i].endpoint)}`, {
          method: "PATCH",
          headers: { ...store.headers, prefer: "return=minimal" },
          body: JSON.stringify({ last_sent_date: t.entryDate }),
        }).catch(() => {});
      } else {
        const code = (r.reason as { statusCode?: number }).statusCode ?? 0;
        if (code === 404 || code === 410) {
          // 죽은 배달 주소(브라우저에서 구독 해지됨) — 청소
          cleaned++;
          await fetch(`${store.url}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(t.subs[i].endpoint)}`, {
            method: "DELETE", headers: store.headers,
          }).catch(() => {});
        }
      }
    }
  }
  }

  // ---- 낮 행동 리마인더 (블럭 8-2 · 옵트인) — 13시(사용자 시간대), 문구는 본인이 쓴 행동 원문 인용 (지시서 5번) ----
  const REMINDER_HOUR = 13;
  const remindTargets: { p: Profile; entryDate: string; subs: Sub[] }[] = [];
  for (const p of profiles) {
    const mySubs = subsOf.get(p.user_id) ?? [];
    if (mySubs.length === 0) continue;
    if (journeyOf.get(p.user_id) === undefined) continue;
    const hour = forcedHour ?? localHour(p.timezone);
    if (hour !== REMINDER_HOUR || p.record_hour === REMINDER_HOUR) continue; // 저녁 푸시 시각과 겹치면 저녁이 우선
    const { entryDate } = loopWindow(new Date(), p.timezone, p.record_hour);
    remindTargets.push({ p, entryDate, subs: mySubs });
  }
  if (remindTargets.length > 0) {
    const ids = remindTargets.map((t) => t.p.user_id).join(",");
    const dates = [...new Set(remindTargets.map((t) => t.entryDate))].join(",");
    // 리마인더를 켠(옵트인) 제출 기록의 행동 원문 + 이미 보낸 장부를 한 번에 읽는다 (N+1 금지)
    const [ar, dr] = await Promise.all([
      fetch(
        `${store.url}/rest/v1/daily_entries?user_id=in.(${ids})&entry_date=in.(${dates})&action_reminder=eq.true&action_text=not.is.null&submitted_at=not.is.null&deleted_at=is.null&select=user_id,entry_date,day_no,action_text`,
        { headers: store.headers, cache: "no-store" }
      ),
      fetch(
        `${store.url}/rest/v1/step_events?user_id=in.(${ids})&entry_date=in.(${dates})&event=eq.action_ping&select=user_id,entry_date`,
        { headers: store.headers, cache: "no-store" }
      ),
    ]);
    const acts = ar.ok ? ((await ar.json()) as { user_id: string; entry_date: string; day_no: number | null; action_text: string }[]) : [];
    const already = new Set(
      (dr.ok ? ((await dr.json()) as { user_id: string; entry_date: string }[]) : []).map((x) => x.user_id + "|" + x.entry_date)
    );
    const actOf = new Map(acts.map((a) => [a.user_id + "|" + a.entry_date, a]));
    for (const t of remindTargets) {
      const a = actOf.get(t.p.user_id + "|" + t.entryDate);
      if (a === undefined || already.has(t.p.user_id + "|" + t.entryDate)) continue;
      // 지시서 5번 고정 형식 — 앱이 시키는 말투 금지, 원문 인용만
      const payload = JSON.stringify({ title: "오제로의 거울", body: `어제 당신이 정한 행동 — '${a.action_text}'`, url: "/today", tag: "ozero-action" });
      const results = await Promise.allSettled(
        t.subs.map((sb) => webpush.sendNotification({ endpoint: sb.endpoint, keys: { p256dh: sb.p256dh, auth: sb.auth } }, payload))
      );
      let delivered = false;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === "fulfilled") {
          delivered = true;
        } else {
          const code = (r.reason as { statusCode?: number }).statusCode ?? 0;
          if (code === 404 || code === 410) {
            cleaned++;
            await fetch(`${store.url}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(t.subs[i].endpoint)}`, {
              method: "DELETE", headers: store.headers,
            }).catch(() => {});
          }
        }
      }
      if (delivered) {
        reminded++;
        // 하루 1회 장부 (step_events 재사용 — event='action_ping')
        await fetch(`${store.url}/rest/v1/step_events`, {
          method: "POST",
          headers: { ...store.headers, prefer: "return=minimal" },
          body: JSON.stringify({ user_id: t.p.user_id, entry_date: t.entryDate, day_no: a.day_no ?? 0, step: 10, event: "action_ping" }),
        }).catch(() => {});
      }
    }
  }

  return Response.json({ sent, cleaned, reminded });
}
