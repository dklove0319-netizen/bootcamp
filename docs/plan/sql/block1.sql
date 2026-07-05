-- ============================================================
-- 오제로의 거울 — 블럭 1 스텝 1-1: 창고에 표 만들기
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 → Run
-- 실행 후 확인: Table Editor 에 표 6개 (profiles, journeys, consents,
--               daily_entries, step_events, assessments)
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

-- 여정 — 코스 1회 수행 (21일 거울 / 추후 35일 심화 / "새 21일"도 새 여정으로)
create table journeys (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  course text not null default 'mirror21',   -- v1은 'mirror21'만
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
  consented_at timestamptz not null default now()
);

-- 하루 기록 (구조화 저장의 본체 — 단계별 별도 필드)
create table daily_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  journey_id bigint not null,        -- 여정 꼬리표
  entry_date date not null,
  day_no smallint not null,          -- 여정 기준 1~N
  score_mood smallint, score_emotion smallint,
  score_energy smallint, score_sleep smallint,   -- 오늘의 눈금 4종 (0~10)
  emotion_label text,                            -- 가장 컸던 감정 이름 (고정 목록)
  free_text text,
  user_split jsonb,                  -- [{src, label}] 사용자 구별
  ai_split jsonb,                    -- [{src, text, label, category}] AI 대조
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

-- RLS(창고 문 앞 출입 규칙): 표 생성 때부터 켠다 (지시서 7번)
alter table profiles enable row level security;
alter table journeys enable row level security;
alter table consents enable row level security;
alter table daily_entries enable row level security;
alter table step_events enable row level security;
alter table assessments enable row level security;

-- 본인 것만 읽고 쓰기 (블럭 5에서 로그인 붙으면 활성되는 정책 골격)
create policy "own read"   on daily_entries for select using (auth.uid() = user_id);
create policy "own write"  on daily_entries for insert with check (auth.uid() = user_id);
create policy "own update" on daily_entries for update using (auth.uid() = user_id);
-- 주의: 공개(anon) DELETE/UPDATE 정책은 만들지 않는다 (치명 2 — 남의 데이터 파괴 방지)
-- 관리자 열람 정책·나머지 표 정책은 블럭 5에서 추가
