// 푸시 구독 등록/해제 (블럭 8-1) — 브라우저가 만든 "알림 배달 주소"를 그 사람 열쇠 아래 보관한다.
// 등록된 관찰자만. 같은 기기가 다시 등록하면 덮어쓴다 (endpoint 기준).
import { serviceStore } from "../../../../lib/db";

export const runtime = "nodejs";

async function ownerOf(store: { url: string; headers: Record<string, string> }, secret: string): Promise<boolean> {
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) return false;
  const r = await fetch(`${store.url}/rest/v1/profiles?user_id=eq.${secret}&deleted_at=is.null&select=user_id`, {
    headers: store.headers, cache: "no-store",
  });
  return r.ok && ((await r.json()) as unknown[]).length > 0;
}

// 공개 열쇠 전달 — 브라우저가 구독을 만들 때 필요. next.config env 목록에 올리지 않고(빌드 새김 사고 회피)
// 요청마다 서버가 즉석에서 읽어 건넨다. 공개 전제 키라 인증 불필요.
export async function GET(): Promise<Response> {
  return Response.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? "" });
}

export async function POST(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!(await ownerOf(store, secret))) return Response.json({ error: "no-key" }, { status: 401 });

  let sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } = {};
  try {
    sub = (await req.json()) as typeof sub;
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  if (
    typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://") ||
    typeof sub.keys?.p256dh !== "string" || typeof sub.keys?.auth !== "string"
  ) {
    return Response.json({ error: "bad-subscription" }, { status: 400 });
  }

  const r = await fetch(`${store.url}/rest/v1/push_subs?on_conflict=endpoint`, {
    method: "POST",
    headers: { ...store.headers, prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ endpoint: sub.endpoint, user_id: secret, p256dh: sub.keys.p256dh, auth: sub.keys.auth }),
  });
  if (!r.ok) return Response.json({ error: "table-missing" }, { status: 503 }); // push_subs 표(블럭8 SQL) 실행 전
  return Response.json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!(await ownerOf(store, secret))) return Response.json({ error: "no-key" }, { status: 401 });
  await fetch(`${store.url}/rest/v1/push_subs?user_id=eq.${secret}`, { method: "DELETE", headers: store.headers }).catch(() => {});
  return Response.json({ ok: true });
}
