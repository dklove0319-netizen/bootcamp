// 관리자 암호 확인 (블럭 7) — .env 의 ADMIN_KEY 와 대조. 미설정이면 항상 거절 (안전 기본값).
export function adminAuthed(req: Request): boolean {
  const k = process.env.ADMIN_KEY ?? "";
  return k !== "" && (req.headers.get("x-admin-key") ?? "") === k;
}
