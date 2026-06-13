import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

const todayStr = () => new Date().toISOString().slice(0, 10);
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

export default function Learn() {
  const { user } = useAuth();
  const [streak, setStreak] = useState(null);
  const [modules, setModules] = useState([]);
  const [progress, setProgress] = useState([]);
  const [card, setCard] = useState(null);          // { lesson, reason }
  const [stage, setStage] = useState('loading');   // loading | lesson | quiz | done | finished | error
  const [choice, setChoice] = useState(null);
  const [result, setResult] = useState(null);      // { correct, xp }
  const [err, setErr] = useState('');

  const load = async () => {
    setStage('loading'); setChoice(null); setResult(null); setErr('');
    try {
      const [st, mods, prog, pick] = await Promise.all([
        supabase.from('user_streaks').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('learn_modules').select('*').order('sort_order'),
        supabase.from('user_learning_progress').select('lesson_id, quiz_correct, completed_at').eq('user_id', user.id),
        api.learningCard(),
      ]);
      setStreak(st.data || { current_streak: 0, longest_streak: 0, total_xp: 0, last_completed_date: null });
      setModules(mods.data || []);
      setProgress(prog.data || []);
      if (!pick.lesson_id) { setCard({ reason: pick.reason }); setStage('finished'); return; }
      const { data: lesson } = await supabase.from('learn_lessons').select('*').eq('id', pick.lesson_id).single();
      setCard({ lesson, reason: pick.reason });
      setStage('lesson');
    } catch (e) { setErr(e.message); setStage('error'); }
  };
  useEffect(() => { load(); }, [user.id]);

  const completedToday = streak?.last_completed_date === todayStr();

  const submitQuiz = async () => {
    const lesson = card.lesson;
    const correct = choice === lesson.correct_answer;
    const xp = 10 + (correct ? 5 : 0) + (completedToday ? 0 : 5); // base + correct bonus + first-of-day bonus
    setResult({ correct, xp });
    setStage('done');
    try {
      await supabase.from('user_learning_progress').upsert({
        user_id: user.id, lesson_id: lesson.id, completed: true,
        quiz_correct: correct, xp_earned: xp, completed_at: new Date().toISOString(),
      }, { onConflict: 'user_id,lesson_id' });

      // streak logic
      const s = streak || {};
      let current = s.current_streak || 0;
      if (s.last_completed_date !== todayStr()) {
        current = s.last_completed_date === yesterdayStr() ? current + 1 : 1;
      }
      const updated = {
        user_id: user.id,
        current_streak: current,
        longest_streak: Math.max(current, s.longest_streak || 0),
        total_xp: (s.total_xp || 0) + xp,
        last_completed_date: todayStr(),
      };
      await supabase.from('user_streaks').upsert(updated);
      setStreak(updated);
      setProgress([...progress, { lesson_id: lesson.id, quiz_correct: correct }]);
    } catch (e) { setErr(e.message); }
  };

  const lesson = card?.lesson;
  const doneIds = new Set(progress.map((p) => p.lesson_id));

  return (
    <div className="page">
      <div className="rise" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 26 }}>
        <div>
          <div className="eyebrow">Duolingo for your money · Psychology of Money × Atomic Habits</div>
          <h1 style={{ fontSize: '2.3rem', marginTop: 6 }}>Learn</h1>
        </div>
        <div style={{ display: 'flex', gap: 26, textAlign: 'right' }}>
          <div><div className="stat-value" style={{ fontSize: '1.8rem' }}>{streak?.current_streak ?? 0}<span className="unit"> 🔥</span></div>
            <div className="eyebrow">day streak</div></div>
          <div><div className="stat-value" style={{ fontSize: '1.8rem' }}>{streak?.total_xp ?? 0}</div>
            <div className="eyebrow">XP</div></div>
          <div><div className="stat-value" style={{ fontSize: '1.8rem' }}>{progress.length}</div>
            <div className="eyebrow">lessons done</div></div>
        </div>
      </div>

      {stage === 'loading' && <div className="skeleton" style={{ height: 320 }} />}
      {stage === 'error' && <div className="card" style={{ color: 'var(--risk)' }}>{err} <button className="chip" onClick={load} style={{ marginLeft: 10 }}>Retry</button></div>}

      {stage === 'finished' && (
        <div className="card empty rise">
          <div className="display">All lessons complete ✦</div>
          <p>{card.reason}</p>
        </div>
      )}

      {(stage === 'lesson' || stage === 'quiz' || stage === 'done') && lesson && (
        <div className="card rise" style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span className="badge good">Today's lesson · Module {lesson.module_id}</span>
            {completedToday && stage === 'lesson' && <span className="badge">streak already safe today</span>}
          </div>
          <h2 style={{ fontSize: '1.9rem', marginTop: 14 }}>{lesson.title}</h2>
          <p style={{ marginTop: 6, fontSize: '.78rem', color: 'var(--brass)', fontStyle: 'italic' }}>{card.reason}</p>

          {stage === 'lesson' && (
            <>
              <p style={{ marginTop: 18, fontSize: '.92rem', lineHeight: 1.75 }}>{lesson.content}</p>
              {lesson.example && (
                <div style={{ marginTop: 16, padding: 16, background: 'var(--brass-soft)', borderRadius: 12, fontSize: '.82rem' }}>
                  <span className="eyebrow">Real life</span>
                  <p style={{ marginTop: 6 }}>{lesson.example}</p>
                </div>
              )}
              {lesson.reflection && (
                <p style={{ marginTop: 16, fontSize: '.84rem', fontStyle: 'italic', color: 'var(--muted)' }}>
                  Reflect: {lesson.reflection}
                </p>
              )}
              <button className="btn brass" style={{ marginTop: 24 }} onClick={() => setStage('quiz')}>Take the quiz →</button>
            </>
          )}

          {stage === 'quiz' && (
            <>
              <p style={{ marginTop: 20, fontSize: '.95rem', fontWeight: 600 }}>{lesson.quiz_question}</p>
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                {(typeof lesson.quiz_options === 'string' ? JSON.parse(lesson.quiz_options) : lesson.quiz_options).map((opt, i) => (
                  <button key={i} type="button"
                    className={'chip' + (choice === i ? ' on' : '')}
                    style={{ textAlign: 'left', borderRadius: 12, padding: '14px 18px' }}
                    onClick={() => setChoice(i)}>
                    {String.fromCharCode(65 + i)}. {opt}
                  </button>
                ))}
              </div>
              <button className="btn brass" style={{ marginTop: 20 }} disabled={choice == null} onClick={submitQuiz}>Check answer</button>
            </>
          )}

          {stage === 'done' && result && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: result.correct ? 'var(--good)' : 'var(--warn)' }}>
                {result.correct ? 'Correct ✦' : 'Not quite — but the lesson stuck.'}
              </div>
              {!result.correct && (
                <p style={{ marginTop: 8, fontSize: '.82rem' }}>
                  The answer was: <strong>{(typeof card.lesson.quiz_options === 'string' ? JSON.parse(card.lesson.quiz_options) : card.lesson.quiz_options)[card.lesson.correct_answer]}</strong>
                </p>
              )}
              <p style={{ marginTop: 10, fontSize: '.9rem' }}>
                +{result.xp} XP · streak {streak?.current_streak} day{streak?.current_streak === 1 ? '' : 's'} 🔥
              </p>
              {lesson.action_challenge && (
                <div style={{ marginTop: 16, padding: 16, border: '1px dashed var(--brass)', borderRadius: 12, fontSize: '.84rem' }}>
                  <span className="eyebrow">Today's action</span>
                  <p style={{ marginTop: 6 }}>{lesson.action_challenge}</p>
                </div>
              )}
              <button className="btn" style={{ marginTop: 22 }} onClick={load}>Next lesson →</button>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 30 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Your path</div>
        <div className="grid g2">
          {modules.map((m) => {
            return (
              <div key={m.id} className="card" style={{ padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>{m.id}. {m.title}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{m.description}</div>
                </div>
                <span className="badge" style={{ flexShrink: 0 }}>
                  {m.theme === 'atomic_habits' ? 'Habits' : 'Psychology'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
