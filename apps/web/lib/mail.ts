// 이메일 발송기 (3-1) — 있는 자격증명을 자동 선택한다.
// 1순위 Resend (RESEND_API_KEY 가 re_ 로 시작 + 발신 도메인 인증 필요),
// 2순위 Gmail SMTP (GMAIL_USER + GMAIL_APP_PASSWORD — 구글 계정의 "앱 비밀번호").
// 둘 다 없으면 false — 호출부는 조용히 안내한다 (개발 중엔 관리자 시험 모드로 링크를 직접 확인).
import nodemailer from "nodemailer";

export function mailReady(): boolean {
  const resend = process.env.RESEND_API_KEY ?? "";
  if (resend.startsWith("re_")) return true;
  return (process.env.GMAIL_USER ?? "") !== "" && (process.env.GMAIL_APP_PASSWORD ?? "") !== "";
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const resend = process.env.RESEND_API_KEY ?? "";
  if (resend.startsWith("re_")) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: "Bearer " + resend, "content-type": "application/json" },
        body: JSON.stringify({
          from: process.env.MAIL_FROM ?? "onboarding@resend.dev",
          to,
          subject,
          html,
        }),
      });
      if (r.ok) return true;
    } catch {
      // Gmail 로 넘어간다
    }
  }
  const user = process.env.GMAIL_USER ?? "";
  const pass = process.env.GMAIL_APP_PASSWORD ?? "";
  if (user === "" || pass === "") return false;
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    await transporter.sendMail({ from: `"오제로의 거울" <${user}>`, to, subject, html });
    return true;
  } catch {
    return false;
  }
}
