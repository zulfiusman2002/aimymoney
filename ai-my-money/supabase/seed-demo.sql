-- ============================================================
-- DEMO ACCOUNT SEED · v2 (Phase 1.6) — full product showcase
-- 1. Supabase → Authentication → Users → Add user:
--    demo@aimymoney.app · choose a password · auto-confirm ON
-- 2. Find/replace DEMO_USER_ID with the new user's UUID.
-- 3. Run schema.sql, phase-1-5.sql, phase-1-6.sql FIRST, then this file.
-- Re-runnable: clears previous demo rows for this user first.
-- ============================================================

-- ---- clean slate for this user ----
delete from asset_valuations where user_id = 'DEMO_USER_ID';
delete from assets where user_id = 'DEMO_USER_ID';
delete from investment_holdings where user_id = 'DEMO_USER_ID';
delete from investment_snapshots where user_id = 'DEMO_USER_ID';
delete from insights where user_id = 'DEMO_USER_ID';
delete from monthly_snapshots where user_id = 'DEMO_USER_ID';
delete from user_learning_progress where user_id = 'DEMO_USER_ID';
delete from user_streaks where user_id = 'DEMO_USER_ID';
delete from goals where user_id = 'DEMO_USER_ID';
delete from liabilities where user_id = 'DEMO_USER_ID';
delete from savings_allocations where user_id = 'DEMO_USER_ID';
delete from expenses where user_id = 'DEMO_USER_ID';
delete from income_sources where user_id = 'DEMO_USER_ID';
delete from fx_rates where user_id = 'DEMO_USER_ID';

-- ---- profile ----
insert into user_profiles (user_id, name, country, currency, age_range, tracker_type, earning_members, dependents, financial_confidence, income_type, onboarding_complete, is_demo)
values ('DEMO_USER_ID','Alex','United Kingdom','GBP','25–34','family',2,1,'intermediate','salaried',true,true)
on conflict (user_id) do update set name='Alex', onboarding_complete=true, is_demo=true, currency='GBP';

-- ---- fx (manually entered/stored rates, not live) ----
insert into fx_rates (user_id, currency, base_currency, rate_to_base) values
  ('DEMO_USER_ID','INR','GBP',0.0094),
  ('DEMO_USER_ID','USD','GBP',0.79);

-- ---- income & budget ----
insert into income_sources (user_id, name, amount, type) values
  ('DEMO_USER_ID','Salary — Alex',3720,'salary'),
  ('DEMO_USER_ID','Salary — Partner',3550,'salary'),
  ('DEMO_USER_ID','Locum (monthly avg)',400,'side');

insert into expenses (user_id, month, description, category, amount, type, recurring) values
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'Rent','housing',1850,'fixed',true),
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'Utilities','housing',210,'fixed',true),
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'Groceries','food',520,'variable',true),
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'Car (EMI + insurance + fuel)','transport',550,'fixed',true),
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'Family support','family',270,'fixed',true),
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'Childcare','family',380,'fixed',true),
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'Subscriptions','lifestyle',64,'fixed',true),
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'Eating out','lifestyle',285,'variable',false),
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'Birthday gift','lifestyle',120,'one-time',false);

insert into savings_allocations (user_id, month, destination, amount) values
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'emergency_fund',600),
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'stocks',800),
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'mutual_funds',700);

-- ---- UK stocks: two dated snapshots (change tracking) ----
with s1 as (
  insert into investment_snapshots (user_id, asset_type, snapshot_date, total_value, currency, source, base_currency, converted_total, fx_rate, fx_date, extraction_confidence)
  values ('DEMO_USER_ID','uk_stocks', current_date-35, 18200,'GBP','screenshot','GBP',18200,1,current_date-35,0.96) returning id)
insert into investment_holdings (snapshot_id, user_id, asset_name, ticker, current_value, invested_value, gain_loss, currency, platform, confidence_score, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date)
select id,'DEMO_USER_ID',x.* , 'GBP', x.cv, 'GBP', x.cv, 1, current_date-35
from s1, (values
  ('Vanguard FTSE Global All Cap','VAFTGAG',9400,8200,1200,'GBP','Vanguard ISA',0.97,9400),
  ('S&P 500 UCITS ETF','VUSA',5600,4900,700,'GBP','Vanguard ISA',0.96,5600),
  ('L&G Global Technology','LGGT',3200,3000,200,'GBP','Vanguard ISA',0.92,3200)
) as x(asset_name,ticker,current_value,invested_value,gain_loss,currency,platform,confidence_score,cv);

with s2 as (
  insert into investment_snapshots (user_id, asset_type, snapshot_date, total_value, currency, source, base_currency, converted_total, fx_rate, fx_date, extraction_confidence)
  values ('DEMO_USER_ID','uk_stocks', current_date-3, 19350,'GBP','screenshot','GBP',19350,1,current_date-3,0.97) returning id)
insert into investment_holdings (snapshot_id, user_id, asset_name, ticker, current_value, invested_value, gain_loss, currency, platform, confidence_score, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date)
select id,'DEMO_USER_ID',x.*, 'GBP', x.cv, 'GBP', x.cv, 1, current_date-3
from s2, (values
  ('Vanguard FTSE Global All Cap','VAFTGAG',10050,8700,1350,'GBP','Vanguard ISA',0.97,10050),
  ('S&P 500 UCITS ETF','VUSA',5900,5100,800,'GBP','Vanguard ISA',0.96,5900),
  ('L&G Global Technology','LGGT',3400,3200,200,'GBP','Vanguard ISA',0.92,3400)
) as x(asset_name,ticker,current_value,invested_value,gain_loss,currency,platform,confidence_score,cv);

-- ---- Indian mutual funds in INR, converted to GBP @ 0.0094 ----
with s3 as (
  insert into investment_snapshots (user_id, asset_type, snapshot_date, total_value, currency, source, base_currency, converted_total, fx_rate, fx_date, extraction_confidence, notes)
  values ('DEMO_USER_ID','mutual_funds', current_date-6, 1585000,'INR','screenshot','GBP',14899,0.0094,current_date-6,0.93,'Platform: Groww') returning id)
insert into investment_holdings (snapshot_id, user_id, asset_name, ticker, current_value, invested_value, gain_loss, currency, platform, confidence_score, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date)
select id,'DEMO_USER_ID',x.*, 'INR', x.cv, 'GBP', round(x.cv*0.0094), 0.0094, current_date-6
from s3, (values
  ('Parag Parikh Flexi Cap',null,620000,480000,140000,'INR','Groww',0.95,620000),
  ('UTI Nifty 50 Index',null,540000,470000,70000,'INR','Groww',0.94,540000),
  ('SBI Small Cap',null,425000,380000,45000,'INR','Groww',0.90,425000)
) as x(asset_name,ticker,current_value,invested_value,gain_loss,currency,platform,confidence_score,cv);

-- ---- crypto ----
insert into investment_snapshots (user_id, asset_type, snapshot_date, total_value, currency, source, base_currency, converted_total, fx_rate, fx_date, extraction_confidence)
values ('DEMO_USER_ID','crypto', current_date-12, 2600,'GBP','screenshot','GBP',2600,1,current_date-12,0.91);

-- ---- non-broker assets + valuation history ----
-- Flat in Delhi (INR)
with a1 as (
  insert into assets (user_id, name, asset_class, liquidity, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date, valuation_date, valuation_source, notes)
  values ('DEMO_USER_ID','Flat in Delhi','property','illiquid','INR',3000000,'GBP',28200,0.0094,current_date,current_date-20,'agent valuation','2-bed, conservative estimate') returning id)
insert into asset_valuations (asset_id, user_id, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date, valuation_date, source)
select id,'DEMO_USER_ID', v.* from a1, (values
  ('INR',2820000,'GBP',26508,0.0094, current_date-200, current_date-200,'manual estimate'),
  ('INR',2900000,'GBP',27260,0.0094, current_date-110, current_date-110,'agent valuation'),
  ('INR',3000000,'GBP',28200,0.0094, current_date-20,  current_date-20, 'agent valuation')
) as v(original_currency,original_value,base_currency,converted_value,fx_rate,fx_date,valuation_date,source);

-- Plot of land near Jaipur (INR)
with a2 as (
  insert into assets (user_id, name, asset_class, liquidity, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date, valuation_date, valuation_source)
  values ('DEMO_USER_ID','Plot near Jaipur','land','illiquid','INR',1200000,'GBP',11280,0.0094,current_date,current_date-90,'manual estimate') returning id)
insert into asset_valuations (asset_id, user_id, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date, valuation_date, source)
select id,'DEMO_USER_ID', v.* from a2, (values
  ('INR',1100000,'GBP',10340,0.0094, current_date-300, current_date-300,'manual estimate'),
  ('INR',1200000,'GBP',11280,0.0094, current_date-90,  current_date-90, 'manual estimate')
) as v(original_currency,original_value,base_currency,converted_value,fx_rate,fx_date,valuation_date,source);

-- Gold (GBP)
with a3 as (
  insert into assets (user_id, name, asset_class, liquidity, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date, valuation_date, valuation_source, notes)
  values ('DEMO_USER_ID','Family gold','gold','liquid','GBP',6400,'GBP',6400,1,current_date,current_date-15,'index','~120g, priced off spot') returning id)
insert into asset_valuations (asset_id, user_id, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date, valuation_date, source)
select id,'DEMO_USER_ID', v.* from a3, (values
  ('GBP',5900,'GBP',5900,1, current_date-180, current_date-180,'index'),
  ('GBP',6400,'GBP',6400,1, current_date-15,  current_date-15, 'index')
) as v(original_currency,original_value,base_currency,converted_value,fx_rate,fx_date,valuation_date,source);

-- Pension (GBP)
with a4 as (
  insert into assets (user_id, name, asset_class, liquidity, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date, valuation_date, valuation_source)
  values ('DEMO_USER_ID','Workplace pension — Alex','pension','illiquid','GBP',21800,'GBP',21800,1,current_date,current_date-8,'statement') returning id)
insert into asset_valuations (asset_id, user_id, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date, valuation_date, source)
select id,'DEMO_USER_ID', v.* from a4, (values
  ('GBP',19400,'GBP',19400,1, current_date-190, current_date-190,'statement'),
  ('GBP',21800,'GBP',21800,1, current_date-8,   current_date-8,  'statement')
) as v(original_currency,original_value,base_currency,converted_value,fx_rate,fx_date,valuation_date,source);

-- Cash emergency fund (GBP)
with a5 as (
  insert into assets (user_id, name, asset_class, liquidity, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date, valuation_date, valuation_source)
  values ('DEMO_USER_ID','Emergency fund — Marcus savings','cash','liquid','GBP',11400,'GBP',11400,1,current_date,current_date-2,'statement') returning id)
insert into asset_valuations (asset_id, user_id, original_currency, original_value, base_currency, converted_value, fx_rate, fx_date, valuation_date, source)
select id,'DEMO_USER_ID', v.* from a5, (values
  ('GBP',10200,'GBP',10200,1, current_date-60, current_date-60,'statement'),
  ('GBP',11400,'GBP',11400,1, current_date-2,  current_date-2, 'statement')
) as v(original_currency,original_value,base_currency,converted_value,fx_rate,fx_date,valuation_date,source);

-- ---- liabilities, goals ----
insert into liabilities (user_id, name, amount, interest_rate, monthly_payment, type) values
  ('DEMO_USER_ID','Car finance',6800,6.9,310,'loan'),
  ('DEMO_USER_ID','Credit card',900,21.9,150,'credit_card');

insert into goals (user_id, goal_name, goal_type, target_amount, current_amount, target_date, monthly_contribution) values
  ('DEMO_USER_ID','First UK home deposit','House deposit',62500,31200,'2028-09-01',900),
  ('DEMO_USER_ID','Emergency fund','Emergency fund',20000,11400,null,600),
  ('DEMO_USER_ID','Japan trip','Travel',4500,1200,'2027-04-01',150);

-- ---- monthly snapshots (last 2 months for MoM comparisons) ----
insert into monthly_snapshots (user_id, month, total_income, total_expenses, fixed_expenses, variable_expenses, one_time_expenses, total_savings, savings_rate, total_invested, total_assets, total_liabilities, net_worth, emergency_fund, goal_progress, learning_xp)
values
  ('DEMO_USER_ID', to_char(now() - interval '2 months','YYYY-MM'), 7670, 4310, 3324, 866, 120, 3360, 43.8, 33400, 76300, 8050, 101650, 10200,
    '[{"name":"First UK home deposit","pct":46,"on_track":true},{"name":"Emergency fund","pct":51,"on_track":null}]', 220),
  ('DEMO_USER_ID', to_char(now() - interval '1 month','YYYY-MM'), 7670, 4445, 3324, 1001, 120, 3225, 42.0, 35600, 77900, 7850, 105650, 10800,
    '[{"name":"First UK home deposit","pct":48,"on_track":true},{"name":"Emergency fund","pct":54,"on_track":null}]', 300)
on conflict (user_id, month) do nothing;

-- ---- connected insights ----
insert into insights (user_id, title, detail, severity, source_modules, recommended_module_id) values
  ('DEMO_USER_ID','Eating out (£285) equals 32% of your house-deposit pace','Variable lifestyle spend this month is £285 while the deposit goal needs £900/mo to stay on track. Trimming a third of it would add roughly one extra deposit month per year.','warning','{budget,goals}',4),
  ('DEMO_USER_ID','Emergency fund covers 2.6 months — below the 3-month floor','Cash of £11,400 against ~£4,300 monthly expenses. The £600/mo allocation closes the gap to 3 months in about 2 months.','risk','{networth,budget}',2),
  ('DEMO_USER_ID','Net worth rose £4,000 last month, mostly from investing behaviour','£1,500 of the rise came from contributions, the rest from market movement and the pension statement update — your system is doing the compounding.','good','{networth,portfolio,learn}',3);

-- ---- learning progress & streak (3 lessons done) ----
insert into user_learning_progress (user_id, lesson_id, completed, quiz_correct, xp_earned, completed_at)
select 'DEMO_USER_ID', id, true, true, 20, now() - interval '2 days'
from learn_lessons where title = 'Wealth is what you don''t see' limit 1;
insert into user_learning_progress (user_id, lesson_id, completed, quiz_correct, xp_earned, completed_at)
select 'DEMO_USER_ID', id, true, true, 20, now() - interval '1 day'
from learn_lessons where title = 'The eighth wonder' limit 1;
insert into user_learning_progress (user_id, lesson_id, completed, quiz_correct, xp_earned, completed_at)
select 'DEMO_USER_ID', id, true, false, 15, now()
from learn_lessons where title = 'Systems beat goals' limit 1;

insert into user_streaks (user_id, current_streak, longest_streak, total_xp, last_completed_date)
values ('DEMO_USER_ID', 3, 11, 380, current_date)
on conflict (user_id) do update set current_streak=3, longest_streak=11, total_xp=380, last_completed_date=current_date;

-- ---- Phase 2.1: month-aware income records ----
delete from income_records where user_id = 'DEMO_USER_ID';
insert into income_records (user_id, month, name, amount, type) values
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'Salary — Alex',3720,'salary'),
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'Salary — Partner',3550,'salary'),
  ('DEMO_USER_ID', to_char(now(),'YYYY-MM'),'Locum (monthly avg)',400,'side'),
  ('DEMO_USER_ID', to_char(now() - interval '1 month','YYYY-MM'),'Salary — Alex',3720,'salary'),
  ('DEMO_USER_ID', to_char(now() - interval '1 month','YYYY-MM'),'Salary — Partner',3550,'salary'),
  ('DEMO_USER_ID', to_char(now() - interval '1 month','YYYY-MM'),'Locum (monthly avg)',400,'side');
