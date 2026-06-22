-- ============================================================
-- AI MY MONEY · Supabase schema
-- Run this whole file in: Supabase Dashboard → SQL Editor → New query
-- Safe to re-run (idempotent where possible).
-- ============================================================

-- ---------- PROFILES ----------
create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  country text,
  currency text default 'GBP',
  age_range text,
  tracker_type text default 'individual',        -- individual | family
  earning_members int default 1,
  dependents int default 0,
  financial_confidence text default 'beginner',  -- beginner | intermediate | advanced
  income_type text,                              -- salaried | self-employed | business | freelancer | mixed
  income_variability text default 'fixed',       -- fixed | variable
  onboarding_complete boolean default false,
  is_demo boolean default false,
  created_at timestamptz default now()
);

-- ---------- INCOME ----------
create table if not exists income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric not null default 0,
  frequency text default 'monthly',              -- monthly | annual | irregular
  type text default 'salary',                    -- salary | side | rental | bonus | other
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ---------- EXPENSES ----------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,                           -- 'YYYY-MM'
  description text not null,
  category text default 'other',
  amount numeric not null default 0,
  type text default 'fixed',                     -- fixed | variable | one-time
  recurring boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_expenses_user_month on expenses(user_id, month);

-- ---------- SAVINGS ----------
create table if not exists savings_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  destination text not null,                     -- bank | emergency | stocks | mutual_funds | crypto | property | gold | other
  amount numeric not null default 0,
  created_at timestamptz default now()
);

-- ---------- INVESTMENTS ----------
create table if not exists investment_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null,                      -- indian_stocks | uk_stocks | us_stocks | mutual_funds | etf | crypto | gold | property | commercial_property | land | pension | bonds | cash | other
  snapshot_date date not null default current_date,
  total_value numeric not null default 0,
  currency text default 'GBP',
  source text default 'manual',                  -- manual | screenshot
  extraction_confidence numeric,
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_snapshots_user on investment_snapshots(user_id, asset_type, snapshot_date desc);

create table if not exists investment_holdings (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references investment_snapshots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_name text not null,
  ticker text,
  quantity numeric,
  current_value numeric not null default 0,
  invested_value numeric,
  gain_loss numeric,
  currency text default 'GBP',
  platform text,
  confidence_score numeric
);

create table if not exists uploaded_screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text,
  file_path text,                                -- path in storage bucket
  uploaded_at timestamptz default now(),
  processed_status text default 'pending',       -- pending | processed | failed
  claude_response jsonb,
  extraction_confidence numeric
);

-- ---------- GOALS ----------
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_name text not null,
  goal_type text default 'custom',
  target_amount numeric not null default 0,
  current_amount numeric not null default 0,
  target_date date,
  monthly_contribution numeric default 0,
  linked_asset text,
  status text default 'active',                  -- active | achieved | paused
  created_at timestamptz default now()
);

-- ---------- LIABILITIES ----------
create table if not exists liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric not null default 0,
  interest_rate numeric,
  monthly_payment numeric,
  type text default 'loan',                      -- loan | credit_card | mortgage | personal | other
  created_at timestamptz default now()
);

-- ---------- AI ANALYSIS LOG ----------
create table if not exists ai_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_type text not null,
  prompt text,
  response text,
  created_at timestamptz default now()
);

-- ---------- LEARN ----------
create table if not exists learn_modules (
  id int primary key,
  title text not null,
  theme text not null,                           -- psychology_of_money | atomic_habits
  description text,
  sort_order int not null
);

create table if not exists learn_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id int references learn_modules(id),
  title text not null,
  content text not null,
  example text,
  reflection text,
  quiz_question text,
  quiz_options jsonb,                            -- ["A...", "B...", ...]
  correct_answer int,                            -- index into quiz_options
  action_challenge text,
  sort_order int default 0
);

create table if not exists user_learning_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references learn_lessons(id),
  completed boolean default true,
  quiz_correct boolean,
  xp_earned int default 0,
  completed_at timestamptz default now(),
  unique(user_id, lesson_id)
);

create table if not exists user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak int default 0,
  longest_streak int default 0,
  total_xp int default 0,
  last_completed_date date
);

-- ============================================================
-- ROW LEVEL SECURITY — users only ever see their own rows
-- ============================================================
alter table user_profiles enable row level security;
alter table income_sources enable row level security;
alter table expenses enable row level security;
alter table savings_allocations enable row level security;
alter table investment_snapshots enable row level security;
alter table investment_holdings enable row level security;
alter table uploaded_screenshots enable row level security;
alter table goals enable row level security;
alter table liabilities enable row level security;
alter table ai_analysis enable row level security;
alter table user_learning_progress enable row level security;
alter table user_streaks enable row level security;
alter table learn_modules enable row level security;
alter table learn_lessons enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'user_profiles','income_sources','expenses','savings_allocations',
    'investment_snapshots','investment_holdings','uploaded_screenshots',
    'goals','liabilities','ai_analysis','user_learning_progress','user_streaks'
  ] loop
    execute format('drop policy if exists "own rows" on %I', t);
    execute format(
      'create policy "own rows" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t
    );
  end loop;
end $$;

-- Learn content is readable by all signed-in users, writable by no one (managed via SQL)
drop policy if exists "read modules" on learn_modules;
create policy "read modules" on learn_modules for select using (auth.role() = 'authenticated');
drop policy if exists "read lessons" on learn_lessons;
create policy "read lessons" on learn_lessons for select using (auth.role() = 'authenticated');

-- ============================================================
-- STORAGE — private bucket for screenshots
-- ============================================================
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;

drop policy if exists "own screenshots" on storage.objects;
create policy "own screenshots" on storage.objects
  for all using (bucket_id = 'screenshots' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'screenshots' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- LEARN SEED — 10 modules, original content inspired by the themes
-- (no copyrighted text reproduced)
-- ============================================================
insert into learn_modules (id, title, theme, description, sort_order) values
  (1,'Money Mindset','psychology_of_money','Why behaviour beats brilliance with money',1),
  (2,'Saving Behaviour','psychology_of_money','Your savings rate is the lever you control',2),
  (3,'Compounding','psychology_of_money','Small numbers, long time, absurd results',3),
  (4,'Spending Habits','atomic_habits','Design your environment so good choices are easy',4),
  (5,'Investment Patience','psychology_of_money','Time in the market and the cost of panic',5),
  (6,'Risk and Luck','psychology_of_money','Outcomes are noisier than they look',6),
  (7,'Building Systems','atomic_habits','Systems over goals — automate the boring wins',7),
  (8,'Financial Identity','atomic_habits','Become the kind of person who saves',8),
  (9,'Long-Term Wealth','psychology_of_money','Wealth is what you don''t see',9),
  (10,'Freedom and Enough','psychology_of_money','The goalpost that stops moving',10)
on conflict (id) do update set title = excluded.title;

insert into learn_lessons (module_id, title, content, example, reflection, quiz_question, quiz_options, correct_answer, action_challenge, sort_order) values
(9,'Wealth is what you don''t see',
 'The car, the watch, the holiday photos — that''s spending, not wealth. Real wealth is invisible: it''s the money that was *not* spent, sitting quietly in investments and compounding. When you see someone with a £60k car, the one thing you know for certain is that they have £60k less than before (or £60k of debt more). Judging wealth by what''s visible means judging it by the part that was destroyed.',
 'Two colleagues earn the same. One leases a new German car every two years; the other drives a 9-year-old hatchback and invests the difference — roughly £450/month. After 15 years at 7%, the second colleague has about £140,000 the first one simply doesn''t.',
 'What is one thing you buy mainly to look successful — and could quietly reduce?',
 'Which person is most likely building real wealth?',
 '["High income, expensive lifestyle, no savings","Modest lifestyle, high savings rate","Whoever has the nicest car","Impossible to say — wealth is visible"]',
 1,
 'Move £20 into savings today, or pick one recurring "status" expense to cut this month.',1),

(3,'The eighth wonder',
 'Compounding feels boring for years, then suddenly looks like magic. £300/month at 7% is £21k after 5 years — barely exciting. But it''s £52k after 10, £150k after 20, and £367k after 30. More than half of the final number is growth on growth, not money you put in. The catch: you only get the magic years if you survive the boring ones without interrupting it.',
 'Someone who invests from 25 to 35 and then stops can end up with more at 65 than someone who starts at 35 and invests for 30 straight years. The first decade does the heavy lifting.',
 'What would change if you treated your investments as untouchable for 20 years?',
 'In long-term compounding, where does most of the final value come from?',
 '["Your monthly contributions","Picking the best single stock","Growth earned on previous growth","Timing the market correctly"]',
 2,
 'Open your projector tab and look at the 20-year line. Write down the number.',1),

(2,'The only lever you fully control',
 'You can''t control markets, interest rates, or your employer. You *can* control the gap between what you earn and what you spend. A high savings rate beats a high return on a low one: saving 25% of income at average returns builds wealth faster than saving 5% with genius-level returns. Savings rate is also the one variable that improves both sides — more invested *and* a cheaper lifestyle to eventually fund.',
 'Cutting £200/month of spending does double duty: £200 more invested every month, and £2,400 less per year your future self needs to generate. At a 4% withdrawal rate, that''s £60,000 less you need to ever save.',
 'If you had to raise your savings rate by 5 points this month, what would go first?',
 'Why does cutting spending count "twice"?',
 '["It doesn''t — it counts once","More to invest now, and a smaller lifestyle to fund later","Because of tax relief","Because inflation reverses it"]',
 1,
 'Calculate your current savings rate (it''s on your Dashboard). Set a target 2 points higher.',1),

(7,'Systems beat goals',
 'A goal is a result you want; a system is what you repeat. "Save £20,000" is a goal. "£600 leaves my account into investments the morning after payday, automatically" is a system. Goals rely on motivation, which runs out. Systems rely on defaults, which don''t. The people who hit financial goals mostly aren''t more disciplined — they''ve just removed the need for discipline.',
 'Pay-yourself-first is the classic system: the transfer happens before you can spend the money. Willpower never enters the picture, because the decision was made once, months ago.',
 'Which of your money goals still depends on you "remembering" or "being good" each month?',
 'What makes a system stronger than a goal?',
 '["Systems are more ambitious","Systems don''t depend on daily motivation","Goals are always vague","Systems guarantee market returns"]',
 1,
 'Set up (or increase) one standing order that runs the day after payday.',1),

(8,'Vote for the person you''re becoming',
 'The most durable habit change starts with identity, not outcomes. "I''m trying to save" loses to "I''m a saver" — because every decision becomes a vote for or against who you believe you are. Each skipped impulse buy isn''t £30; it''s evidence. Stack enough evidence and the behaviour stops feeling like effort, the same way a runner doesn''t negotiate with themselves about whether they run.',
 'Someone who says "I don''t buy on the first visit — I''m a 48-hour person" has turned a rule into an identity. The rule now defends itself.',
 'Finish this sentence honestly: "I am the kind of person who ___ with money."',
 'In identity-based habits, what does each small action represent?',
 '["A rounding error","A vote for the type of person you are becoming","A guaranteed financial return","A replacement for budgeting"]',
 1,
 'Write one identity statement ("I am a person who ___") and put it where you''ll see it at payday.',1),

(6,'Luck and risk are siblings',
 'Every outcome is a mix of decisions and forces nobody controls. The danger is asymmetric judgement: calling our wins "skill" and our losses "bad luck" — and the reverse for everyone else. The practical lesson isn''t cynicism; it''s humility in both directions. Don''t copy the strategy of one visible winner (you can''t copy their luck), and don''t judge a good decision by one bad outcome.',
 'Two friends both put £5k into a single stock in 2020. One picked a company that 10x''d; the other picked one that went to zero. Same decision quality — concentrated, undiversified — wildly different outcomes. The winner''s strategy is not the lesson.',
 'What''s one financial result in your life you''ve credited fully to skill — or fully to bad luck?',
 'A friend made a fortune on one concentrated bet. What''s the soundest takeaway?',
 '["Copy the exact strategy","One outcome doesn''t prove the strategy was sound","They are simply smarter","Concentration is always superior"]',
 1,
 'Look at your largest single holding in the Investments tab. Ask: would this decision still look smart if it had gone the other way?',1)
on conflict do nothing;
