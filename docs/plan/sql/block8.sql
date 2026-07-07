-- ============================================================
-- 오제로의 거울 — 블럭 8 (저녁 질문 푸시) + 3-1 준비 (이메일 칸)
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 → Run
-- 실행 후 확인: Table Editor 에 push_subs 표 + profiles 에 email 칸
-- ============================================================

-- 푸시 구독 — 브라우저가 발급한 "알림 배달 주소" (기기·브라우저마다 하나)
create table push_subs (
  endpoint text primary key,          -- 배달 주소 (브라우저 푸시 서비스가 발급)
  user_id uuid not null,              -- 누구의 기기인지 (꼬리표, FK 제약 없음)
  p256dh text not null,               -- 암호화 열쇠 (구독마다 브라우저가 만들어 줌)
  auth text not null,                 -- 암호화 열쇠 2
  last_sent_date date,                -- 마지막으로 저녁 푸시를 보낸 기록창 날짜 (하루 1회 보장)
  created_at timestamptz not null default now()
);
create index push_subs_user_idx on push_subs (user_id);

-- 서버 전용 (마스터 키로만 읽고 쓴다 — 공개 정책 없음)
alter table push_subs enable row level security;

-- 3-1 (이메일 연결) 준비 — 다음 단계에서 쓸 칸을 미리 놓는다
alter table profiles add column if not exists email text;
alter table profiles add column if not exists email_verified_at timestamptz;
alter table profiles add column if not exists last_notified_date date;  -- 이메일 알림 하루 1회 보장
