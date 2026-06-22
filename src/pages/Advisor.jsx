import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api';

const BUTTONS = [
  ['full-review', 'Full Financial Review'],
  ['budget', 'Budget Analysis'],
  ['portfolio', 'Investment Review'],
  ['goals', 'Goal Check'],
  ['networth', 'Net Worth Review'],
  ['risk', 'Risk Review'],
  ['savings', 'Savings Optimisation'],
  ['changes', 'What Changed?'],
];

export default function Advisor() {
  const [analysis, setAnalysis] = useState(null);
  const [busyType, setBusyType] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages, chatBusy]);

  const run = async (type) => {
    setBusyType(type); setErr(''); setAnalysis(null);
    try { setAnalysis(await api.analyze(type)); }
    catch (e) { setErr(e.message); }
    finally { setBusyType(null); }
  };

  const send = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || chatBusy) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next); setInput(''); setChatBusy(true); setErr('');
    try {
      const { reply } = await api.chat(next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e2) { setErr(e2.message); }
    finally { setChatBusy(false); }  // always clears
  };

  return (
    <div className="page">
      <div className="fade-up" style={{ marginBottom: 24 }}>
        <div className="t-label">Your private analyst</div>
        <h1 style={{ fontSize: '2.3rem', marginTop: 6 }}>AI Advisor</h1>
      </div>

      <div className="chips" style={{ marginBottom: 20 }}>
        {BUTTONS.map(([type, label]) => (
          <button key={type} className="chip" onClick={() => run(type)} disabled={!!busyType}>
            {busyType === type ? 'Analysing…' : label}
          </button>
        ))}
      </div>

      {err && <div className="card" style={{ borderColor: 'var(--c-red)', color: 'var(--c-red)', marginBottom: 18, fontSize: '.8rem' }}>{err}</div>}

      {busyType && <div className="skeleton" style={{ height: 180, marginBottom: 18 }} />}

      {analysis && !busyType && (
        <div className="card fade-up" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: '1.5rem' }}>{analysis.headline}</h2>
            {analysis.health_score != null && (
              <div style={{ textAlign: 'right' }}>
                <span className="num-xl" style={{ fontSize: '2rem' }}>{analysis.health_score}</span>
                <span className="t-label"> / 100</span>
              </div>
            )}
          </div>
          <p style={{ marginTop: 8, fontSize: '.84rem' }}>{analysis.summary}</p>

          {analysis.insights?.length > 0 && (
            <div className="grid g2" style={{ marginTop: 20 }}>
              {analysis.insights.map((ins, i) => (
                <div key={i} style={{ border: '1px solid var(--c-border)', borderRadius: 12, padding: 16 }}>
                  <span className={`badge badge-${ins.sentiment === "good" ? "good" : ins.sentiment === "warning" ? "warn" : ins.sentiment === "risk" ? "risk" : "neutral"}`}>{ins.sentiment}</span>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', margin: '8px 0 4px' }}>{ins.title}</div>
                  <div style={{ fontSize: '.76rem', color: 'var(--c-muted)' }}>{ins.detail}</div>
                </div>
              ))}
            </div>
          )}

          {analysis.actions?.length > 0 && (
            <>
              <div className="t-label" style={{ margin: '22px 0 10px' }}>Recommended actions</div>
              {analysis.actions.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: '1px solid var(--c-border)' }}>
                  <span className={`badge ${a.priority === 'high' ? 'risk' : a.priority === 'medium' ? 'warning' : ''}`}>{a.priority}</span>
                  <div><strong style={{ fontSize: '.82rem' }}>{a.title}</strong>
                    <div style={{ fontSize: '.76rem', color: 'var(--c-muted)' }}>{a.detail}</div></div>
                </div>
              ))}
            </>
          )}

          {analysis.data_gaps?.length > 0 && (
            <p style={{ marginTop: 16, fontSize: '.74rem', color: 'var(--c-amber)' }}>
              Missing data: {analysis.data_gaps.join(' · ')}
            </p>
          )}
          <p style={{ marginTop: 14, fontSize: '.64rem', color: 'var(--c-muted)' }}>{analysis.disclaimer}</p>
        </div>
      )}

      <div className="card">
        <div className="t-label" style={{ marginBottom: 16 }}>Ask anything about your finances</div>
        <div style={{ minHeight: 120, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
          {messages.length === 0 && (
            <div className="chips" style={{ marginBottom: 12 }}>
              {['Am I saving enough?', 'Which investment looks risky?', 'Can I buy a house in 3 years?', 'Explain my net worth like I\u2019m a beginner.']
                .map((q) => <button key={q} className="chip" onClick={() => setInput(q)}>{q}</button>)}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role === 'user' ? 'user' : 'ai'}`}>{m.content}</div>
          ))}
          {chatBusy && <div className="chat-bubble ai" style={{ color: 'var(--c-muted)' }}>Reading your numbers…</div>}
          <div ref={endRef} />
        </div>
        <form onSubmit={send} style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. How can I increase my savings rate?"
            style={{ flex: 1, fontFamily: 'var(--font)', fontSize: '.85rem', padding: '13px 16px', border: '1px solid var(--c-border)', borderRadius: 999, background: 'var(--c-surface)' }} />
          <button className="btn btn-primary" disabled={chatBusy || !input.trim()}>Send</button>
        </form>
        <p style={{ marginTop: 10, fontSize: '.62rem', color: 'var(--c-muted)' }}>
          Educational guidance based on your data — not regulated financial advice.
        </p>
      </div>
    </div>
  );
}
