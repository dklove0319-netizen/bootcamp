-- ============================================================
-- 오제로의 거울 — 창고에 표 만들기 (DB 최종 감사 반영판, 2026-07-05)
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 → Run
-- ⚠️ .env 의 SUPABASE_URL 이 가리키는 그 프로젝트에서 실행하세요 (열쇠와 표가 같은 창고여야 함)
-- 실행 후 확인: Table Editor 에 표 7개
--   profiles, journeys, consents, daily_entries, step_events, assessments, measure_limits
-- 근거 설계: docs/plan/05-db.md
-- ============================================================

-- 익명 코드 번호표 기계 — 레터에서 o055까지 발급됨, 앱은 o056부터 이어받는다
create sequence observer_code_seq start 56;

-- 관찰자
create table profiles (
  user_id uuid primary key,          -- Auth 계정 꼬리표 (FK 제약 없음)
  observer_code text not null unique,  -- 'o' + 3자리 (예: o056)
  record_hour smallint not null default 21,
  timezone text not null default 'Asia/Seoul',
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 여정 — 코스 1회 수행
--   'trial3'   = 무료 3일 미니 체험 (데이터 수집·전환 다리)
--   'mirror21' = 유료 21일 거울 코스
--   추후 'scalpel35' = 35일 심화
create table journeys (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  course text not null default 'mirror21',
  start_date date,                           -- 이 여정의 1일차 = 첫 기록 제출일
  status text not null default 'active',     -- 'active' | 'done'
  created_at timestamptz not null default now()
);

-- 동의 이력 (a·c종 — b종 답변 공개 동의는 daily_entries 건별)
create table consents (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  consent_type text not null,        -- 'ai_analysis' | 'asset_use'
  policy_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz             -- 철회 시각 (null = 유효). 연구 추출은 revoked_at IS NULL + 환불 아님만
);

-- 하루 기록 (구조화 저장의 본체 — trial3·mirror21 공용, 코스에 따라 채우는 칸이 다름)
create table daily_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  journey_id bigint not null,        -- 여정 꼬리표 (trial3 / mirror21 구분)
  entry_date date not null,
  day_no smallint not null,          -- 여정 기준 1~N (trial3=1~3, mirror21=1~21)
  score_mood smallint, score_emotion smallint,
  score_energy smallint, score_sleep smallint,   -- 오늘의 눈금 4종 (0~10)
  emotion_label text,                            -- 가장 컸던 감정 이름 (고정 목록)
  free_text text,
  user_split jsonb,                  -- [{src, label}] 사용자 구별
  ai_split jsonb,                    -- [{src, text, label, category}] AI 대조·미니 거울
  delusion_emotion_links jsonb,
  question_text text,
  question_quote_date date,
  question_quote_text text,
  answer_text text,
  answer_shared boolean not null default false,
  answer_share_consented_at timestamptz,
  answer_share_version text,
  action_text text,
  action_reminder boolean not null default false,
  action_result text,                -- 'done' | 'partial' | 'skipped'
  crisis_detected boolean not null default false,
  last_step smallint not null default 0,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, entry_date)       -- 하루 1회 강제
);
create index idx_entries_user_day on daily_entries (user_id, day_no);
create index idx_entries_date_submitted on daily_entries (entry_date, submitted_at);
create index idx_entries_journey on daily_entries (journey_id);

-- 단계 로그 (이탈 측정 — 지시서 7번)
create table step_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  entry_date date not null,
  day_no smallint not null,
  step smallint not null,            -- 1~10
  event text not null,               -- 'enter' | 'submit'
  created_at timestamptz not null default now()
);
create index idx_events_user_date on step_events (user_id, entry_date);

-- 시작점·21일째 설문 (WHO-5 · 탈중심화 척도)
create table assessments (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  phase text not null,               -- 'day0' | 'day21'
  instrument text not null,          -- 'who5' | 'decentering'
  answers jsonb not null,
  total_score smallint,
  created_at timestamptz not null default now()
);

-- 익명 맛보기 횟수 제한 (비로그인 1일 1회 — 서버가 판정)
--   기록 원문은 저장하지 않음 (스펙 준수). IP 해시 + 날짜별 카운트만.
create table measure_limits (
  ip_hash text not null,             -- 접속 IP 를 해시한 값 (원문 IP 저장 안 함)
  day date not null,
  count smallint not null default 0,
  primary key (ip_hash, day)
);

-- RLS(창고 문 앞 출입 규칙): 표 생성 때부터 켠다 (지시서 7번)
alter table profiles enable row level security;
alter table journeys enable row level security;
alter table consents enable row level security;
alter table daily_entries enable row level security;
alter table step_events enable row level security;
alter table assessments enable row level security;
alter table measure_limits enable row level security;
-- measure_limits 는 서버(service_role)만 읽고 쓴다 — 공개 정책 없음 (기본 차단)

-- 본인 것만 읽고 쓰기 (블럭 3에서 로그인 붙으면 활성되는 정책 골격)
create policy "own read"   on daily_entries for select using (auth.uid() = user_id);
create policy "own write"  on daily_entries for insert with check (auth.uid() = user_id);
create policy "own update" on daily_entries for update using (auth.uid() = user_id);
-- 주의: 공개(anon) DELETE/UPDATE 정책은 만들지 않는다 (치명 2 — 남의 데이터 파괴 방지)
-- 관리자 열람 정책·나머지 표 정책은 블럭 3~7에서 추가
