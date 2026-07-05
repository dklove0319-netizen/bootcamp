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
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
    TOSS_CLIENT_KEY: process.env.TOSS_CLIENT_KEY ?? "",
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
    KAKAO_MAP_APP_KEY: process.env.KAKAO_MAP_APP_KEY ?? "",
  },
};

export default nextConfig;
