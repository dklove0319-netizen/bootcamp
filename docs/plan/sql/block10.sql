-- ============================================================
-- 블럭 10 — 결제 원장 표 (payments)
-- 실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
-- 이 표가 없어도 결제(여정 시작)는 동작하지만, 원장 기록·환불 기능은 이 표가 필요하다.
-- ============================================================
create table payments (
  id bigint generated always as identity primary key,
  user_id uuid not null,            -- 관찰자 꼬리표 (FK 제약 없음 — 킷 규칙)
  journey_id bigint not null,       -- 이 결제가 연 여정
  provider text not null,           -- 'toss' | 'test_usd'
  currency text not null,           -- 'KRW' | 'USD'
  amount integer not null,
  order_id text not null unique,
  payment_key text,
  status text not null default 'DONE',  -- 'DONE' | 'TEST'
  refunded_at timestamptz,          -- 환불 시각 (null = 유효). 연구 추출은 refunded_at IS NULL 만
  refund_reason text,
  created_at timestamptz not null default now()
);
create index idx_payments_user on payments (user_id, created_at desc);

alter table payments enable row level security;
-- 서버(service_role)만 읽고 쓴다 — 공개 정책 없음 (기본 차단)
