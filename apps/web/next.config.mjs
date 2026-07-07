import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

// 모노레포 루트의 .env 를 서버 환경변수로 읽어온다 (열쇠 보관함은 루트 한 곳만 유지).
// 이미 설정된 값은 덮지 않고, 값은 어디에도 출력하지 않는다.
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const rootEnvPath = join(rootDir, ".env");
if (existsSync(rootEnvPath)) {
  for (const line of readFileSync(rootEnvPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 모노레포 루트를 명시 (상위 폴더에 다른 lockfile 이 있어도 헷갈리지 않게)
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), "../.."),
  // 밀키트 재료(packages/*)는 TypeScript 소스 그대로 가져다 쓴다 — Next가 대신 컴파일
  transpilePackages: [
    "@vibe-kit/supabase",
    "@vibe-kit/ai",
    "@vibe-kit/cloudflare",
    "@vibe-kit/google-sheets",
    "@vibe-kit/ui",
  ],
  // 브라우저에 보여도 되는 "공개 키"만 여기 올린다 — 이 목록에 있어야 화면(클라이언트) 코드에서 읽힌다.
  // 마스터 키(SERVICE_ROLE 등 secret)는 절대 이 목록에 넣지 않는다. 서버 전용.
  // ⚠ 이 목록은 빌드 시점 값을 코드에 새겨 넣는다(런타임 주입을 가림). Vercel 민감 열쇠는 빌드 때 안 보이므로
  //   빈 값이 새겨지는 사고가 난다 — 그래서 SUPABASE_URL/ANON_KEY 는 뺐다(현재 서버 전용, 런타임에 읽음).
  //   클라이언트에서 Supabase 가 필요해지는 시점(3-1 로그인)에 서버 경유로 전달한다.
  env: {
    TOSS_CLIENT_KEY: process.env.TOSS_CLIENT_KEY ?? "",
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
    KAKAO_MAP_APP_KEY: process.env.KAKAO_MAP_APP_KEY ?? "",
    // VAPID_PUBLIC_KEY 는 여기 올리지 않는다 — 이 목록은 빌드 시점에 값을 얼려 새기는데,
    // 그 시점에 Vercel 빌드 기계가 새 변수를 못 봐서 빈값이 새겨지는 사고가 재현됨(2026-07-08, health 진단으로 확정).
    // 대신 /api/push/subscribe(GET)에서 런타임에 읽어 브라우저에 건넨다 (ADMIN_KEY 와 같은 방식 — 이건 정상 작동 확인됨).
  },
};

export default nextConfig;
