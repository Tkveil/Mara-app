import { useState, useEffect, useRef } from "react";
import Head from "next/head";

// â”€â”€ API â€” calls our own backend, never exposes API key â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function callMara(system, messages) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ system, messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data.text;
}

// â”€â”€ PROMPTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const buildSystem = (p) =>
  `You are Mara â€” a sobriety companion. Calm, grounded, real. Not a therapist, not a recovery program. Like a trusted friend who gets it.
The person: day ${p.days} sober, staying clean from ${p.cleanFrom || "substances"}, goals: ${p.goals || "not specified"}.
Tone: warm, direct, never preachy. 2-4 sentences max. Never say "stay strong." No clinical language. No judgment.
Reference their substance and goals naturally. If crisis: "This sounds big â€” is there someone you can call right now?"`;

const microSystem = (p) =>
  `Give exactly 4 short, immediate, concrete actions for someone staying clean from ${p.cleanFrom || "substances"}. Return ONLY a JSON array of 4 strings. No preamble.`;

const streakSystem = (p) =>
  `Write 3-4 sentences as a personal streak report. Person: day ${p.days} sober, clean from ${p.cleanFrom}, goals: ${p.goals}, ${p.checkIns} check-ins, ${p.cravings} cravings handled. Warm, honest, specific. No fluff.`;

// â”€â”€ CONSTANTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MILES = [
  { d: 1,   l: "First day",    e: "ðŸŒ±" },
  { d: 3,   l: "72 hours",     e: "ðŸ’§" },
  { d: 7,   l: "One week",     e: "ðŸ”¥" },
  { d: 14,  l: "Two weeks",    e: "âš¡" },
  { d: 30,  l: "One month",    e: "ðŸŒ™" },
  { d: 60,  l: "Two months",   e: "ðŸŒŠ" },
  { d: 90,  l: "Three months", e: "âœ¨" },
  { d: 180, l: "Half a year",  e: "ðŸŒ¿" },
  { d: 365, l: "One year",     e: "ðŸ”ï¸" },
];

const QUICK = [
  "I feel off", "I'm having a craving", "I'm bored",
  "I'm doing okay", "I feel triggered", "I just need to talk",
];

const DEF_ACTS = [
  "Drink a full glass of water",
  "Step outside for 5 minutes",
  "Delay 20 minutes and reassess",
  "Text someone you trust",
];

const G = "#c9a96e";
const ld = (k, f) => { try { const v = localStorage.getItem(k); return v != null ? JSON.parse(v) : f; } catch { return f; } };
const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const dc = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0;

// â”€â”€ APP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function Home() {
  const [screen, setScreen]   = useState("home");
  const [step, setStep]       = useState(0);
  const [startDate, setSD]    = useState(null);
  const [cleanFrom, setCF]    = useState("");
  const [goals, setGoals]     = useState("");
  const [notifOn, setNO]      = useState(false);
  const [checkIns, setCI]     = useState(0);
  const [cravings, setCrav]   = useState(0);
  const [journal, setJ]       = useState([]);
  const [acts, setActs]       = useState(DEF_ACTS);
  const [msgs, setMsgs]       = useState([]);
  const [inp, setInp]         = useState("");
  const [busy, setBusy]       = useState(false);
  const [actBusy, setActBusy] = useState(false);
  const [stTxt, setStTxt]     = useState(null);
  const [stBusy, setStBusy]   = useState(false);
  const [sd, setSd]           = useState("");
  const [scf, setScf]         = useState("");
  const [sg, setSg]           = useState("");
  const [ji, setJi]           = useState("");
  const [hydrated, setHydrated] = useState(false);

  const botRef = useRef(null);
  const inRef  = useRef(null);

  // Load from localStorage after hydration (SSR safe)
  useEffect(() => {
    setSD(ld("m_start", null));
    setCF(ld("m_cf", ""));
    setGoals(ld("m_goals", ""));
    setNO(ld("m_notif", false));
    setCI(ld("m_ci", 0));
    setCrav(ld("m_crav", 0));
    setJ(ld("m_j", []));
    setHydrated(true);
  }, []);

  const days  = dc(startDate);
  const done  = MILES.filter((m) => m.d <= days);
  const nxtM  = MILES.find((m) => m.d > days) || null;
  const last  = done[done.length - 1];
  const ob    = !!(startDate && cleanFrom);
  const prof  = { cleanFrom, goals, days, checkIns, cravings };

  useEffect(() => { botRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  useEffect(() => {
    if (screen === "chat" && msgs.length === 0) {
      const h = new Date().getHours();
      const t = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
      setMsgs([{ r: "a", c: `Hey. Good ${t}. Day ${days} â€” you showed up.\n\nWhat's on your mind?` }]);
    }
  }, [screen]);

  useEffect(() => {
    if (screen !== "chat") return;
    const el = inRef.current;
    if (!el) return;
    const fn = () => setTimeout(() => botRef.current?.scrollIntoView({ behavior: "smooth" }), 350);
    el.addEventListener("focus", fn);
    return () => el.removeEventListener("focus", fn);
  }, [screen, msgs]);

  async function send(text) {
    if (!text.trim() || busy) return;
    const um = { r: "u", c: text };
    const next = [...msgs, um];
    setMsgs(next); setInp(""); setBusy(true);
    const ni = checkIns + 1; setCI(ni); sv("m_ci", ni);
    const ic = /craving|urge|tempted|relapse|off|triggered/i.test(text);
    let nc = cravings;
    if (ic) { nc++; setCrav(nc); sv("m_crav", nc); refreshActs(text); }
    const api = next.map((m) => ({ role: m.r === "u" ? "user" : "assistant", content: m.c }));
    try {
      const reply = await callMara(buildSystem({ ...prof, checkIns: ni, cravings: nc }), api);
      setMsgs((p) => [...p, { r: "a", c: reply }]);
    } catch (e) {
      setMsgs((p) => [...p, { r: "a", c: `Something went wrong â€” ${e.message}` }]);
    }
    setBusy(false);
  }

  async function refreshActs(ctx = "I need help right now") {
    setActBusy(true);
    try {
      const raw = await callMara(microSystem(prof), [{ role: "user", content: ctx }]);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed) && parsed.length >= 4) setActs(parsed.slice(0, 4));
    } catch {}
    setActBusy(false);
  }

  async function getStreak() {
    setStBusy(true);
    try {
      const t = await callMara(streakSystem(prof), [{ role: "user", content: "Give me my streak report." }]);
      setStTxt(t);
    } catch (e) { setStTxt(`Error: ${e.message}`); }
    setStBusy(false);
  }

  function saveJ() {
    if (!ji.trim()) return;
    const e = { id: Date.now(), t: ji.trim(), date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }), day: days };
    const u = [e, ...journal].slice(0, 50); setJ(u); sv("m_j", u); setJi("");
  }

  function finish() {
    if (!sd || !scf) return;
    const d = new Date(sd).toISOString();
    setSD(d); sv("m_start", d);
    setCF(scf); sv("m_cf", scf);
    setGoals(sg); sv("m_goals", sg);
    setScreen("home");
  }

  function reset() {
    ["m_start", "m_cf", "m_goals", "m_ci", "m_crav", "m_j", "m_notif"].forEach((k) => { try { localStorage.removeItem(k); } catch {} });
    setSD(null); setCF(""); setGoals(""); setCI(0); setCrav(0);
    setJ([]); setNO(false); setMsgs([]); setStTxt(null);
    setStep(0); setSd(""); setScf(""); setSg(""); setScreen("home");
  }

  async function enableNotif() {
    if (!("Notification" in window)) { alert("Notifications not supported in this browser."); return; }
    const p = await Notification.requestPermission();
    if (p === "granted") { setNO(true); sv("m_notif", true); new Notification("Mara", { body: "Daily check-ins are on." }); }
    else alert("Permission denied â€” enable in your browser settings.");
  }

  if (!hydrated) return null; // avoid SSR mismatch

  // â”€â”€ ONBOARDING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!ob) return (
    <Page title="Mara â€” Setup">
      <div style={S.setupWrap}>
        <Av size={56} fs={26} />
        <h1 style={S.brand}>Mara</h1>
        <p style={S.tagline}>Your sobriety companion.</p>
        <div style={S.card}>
          {step === 0 && <>
            <p style={S.q}>When did you start?</p>
            <p style={S.qs}>The day you decided to show up for yourself.</p>
            <input type="date" value={sd} onChange={(e) => setSd(e.target.value)} style={S.din} max={new Date().toISOString().split("T")[0]} />
            <Btn onClick={() => sd && setStep(1)} dim={!sd}>Next â†’</Btn>
          </>}
          {step === 1 && <>
            <p style={S.q}>What are you staying clean from?</p>
            <p style={S.qs}>Just between you and Mara.</p>
            <textarea value={scf} onChange={(e) => setScf(e.target.value)} placeholder="e.g. alcohol, weed, pills, all of it..." style={S.ta} rows={3} />
            <Row>
              <GBtn onClick={() => setStep(0)}>â† Back</GBtn>
              <Btn onClick={() => scf.trim() && setStep(2)} dim={!scf.trim()} style={{ flex: 1 }}>Next â†’</Btn>
            </Row>
          </>}
          {step === 2 && <>
            <p style={S.q}>What do you want to build?</p>
            <p style={S.qs}>Life on the other side of this.</p>
            <textarea value={sg} onChange={(e) => setSg(e.target.value)} placeholder="e.g. be present for my kids, write my book, feel like myself..." style={S.ta} rows={3} />
            <Row>
              <GBtn onClick={() => setStep(1)}>â† Back</GBtn>
              <Btn onClick={finish} style={{ flex: 1 }}>Let's go</Btn>
            </Row>
          </>}
        </div>
        <Row style={{ gap: 8, marginTop: 8 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === step ? G : "#2a2520", transition: "background 0.3s" }} />)}
        </Row>
        <p style={{ fontSize: 12, color: "#3a3530" }}>No account. No email. Just you and Mara.</p>
      </div>
    </Page>
  );

  // â”€â”€ CHAT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (screen === "chat") return (
    <Page title="Mara â€” Chat">
      <div style={S.chatOuter}>
        <div style={S.chatHead}>
          <button onClick={() => { setScreen("home"); setMsgs([]); }} style={S.back}>â† back</button>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: G }}>Mara</div>
            <div style={{ fontSize: 11, color: "#5a5248" }}>Day {days}</div>
          </div>
        </div>

        <div style={S.msgList}>
          {msgs.map((m, i) => (
            <div key={i} style={m.r === "u" ? S.uRow : S.aRow}>
              {m.r === "a" && <Av size={28} fs={13} />}
              <div style={m.r === "u" ? S.uBub : S.aBub}>{m.c}</div>
            </div>
          ))}
          {busy && (
            <div style={S.aRow}>
              <Av size={28} fs={13} />
              <div style={S.aBub}><span style={{ letterSpacing: 4, color: G }}>Â· Â· Â·</span></div>
            </div>
          )}
          <div ref={botRef} style={{ height: 12 }} />
        </div>

        <div style={S.quickBar}>
          {QUICK.map((p) => (
            <button key={p} onClick={() => send(p)} style={S.qBtn}>{p}</button>
          ))}
        </div>

        <div style={S.inputBar}>
          <input
            ref={inRef}
            value={inp}
            onChange={(e) => setInp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(inp)}
            placeholder="Talk to Mara..."
            style={S.textIn}
            enterKeyHint="send"
            autoComplete="off"
          />
          <button
            onClick={() => send(inp)}
            disabled={!inp.trim() || busy}
            style={{ ...S.sendBtn, opacity: inp.trim() && !busy ? 1 : 0.4 }}
          >â†’</button>
        </div>
      </div>
    </Page>
  );

  // â”€â”€ JOURNAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (screen === "journal") return (
    <Page title="Mara â€” Journal">
      <div style={S.wrap}>
        <button onClick={() => setScreen("home")} style={S.back}>â† back</button>
        <h2 style={S.title}>Journal</h2>
        <p style={{ fontSize: 13, color: "#5a5248", marginBottom: 20 }}>Write it out. No one else reads this.</p>
        <textarea value={ji} onChange={(e) => setJi(e.target.value)} placeholder="What's on your mind today..." style={{ ...S.ta, minHeight: 120, marginBottom: 12 }} />
        <Btn onClick={saveJ} dim={!ji.trim()} style={{ marginBottom: 28 }}>Save entry</Btn>
        {journal.length > 0 && <>
          <p style={S.secLab}>Past entries</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
            {journal.map((e) => (
              <div key={e.id} style={S.jCard}>
                <div style={{ fontSize: 11, color: "#3a3530", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{e.date} Â· Day {e.day}</div>
                <div style={{ fontSize: 14, color: "#8a8278", lineHeight: 1.6 }}>{e.t}</div>
              </div>
            ))}
          </div>
        </>}
      </div>
    </Page>
  );

  // â”€â”€ MILESTONES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (screen === "milestones") return (
    <Page title="Mara â€” Milestones">
      <div style={S.wrap}>
        <button onClick={() => setScreen("home")} style={S.back}>â† back</button>
        <h2 style={S.title}>Your journey</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          {MILES.map((m) => {
            const ok = days >= m.d;
            const pct = ok ? 100 : Math.min(100, Math.round((days / m.d) * 100));
            return (
              <div key={m.d} style={{ display: "flex", alignItems: "center", gap: 14, background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: "16px 18px", opacity: ok ? 1 : 0.4 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{m.e}</span>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 14, color: "#c8c0b5" }}>{m.l}</span>
                  <div style={{ height: 2, background: "#1e1e1e", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: G, width: `${pct}%`, borderRadius: 2 }} />
                  </div>
                </div>
                <span style={{ fontSize: 12, color: "#3a3530", flexShrink: 0 }}>{m.d}d</span>
                {ok && <span style={{ color: G, fontSize: 16 }}>âœ“</span>}
              </div>
            );
          })}
        </div>
      </div>
    </Page>
  );

  // â”€â”€ STREAK REPORT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (screen === "streak") return (
    <Page title="Mara â€” Report">
      <div style={S.wrap}>
        <button onClick={() => { setScreen("home"); setStTxt(null); }} style={S.back}>â† back</button>
        <h2 style={S.title}>Your report</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
          {[{ n: days, l: "days" }, { n: checkIns, l: "check-ins" }, { n: cravings, l: "cravings" }].map(({ n, l }) => (
            <div key={l} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "18px 12px", textAlign: "center" }}>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: "#e8e0d5" }}>{n}</div>
              <div style={{ fontSize: 11, color: "#5a5248", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{l}</div>
            </div>
          ))}
        </div>
        <Bdg label="Staying clean from" val={cleanFrom} />
        {goals && <Bdg label="Building toward" val={goals} />}
        {!stTxt && !stBusy && <Btn onClick={getStreak}>Get Mara's take on your streak</Btn>}
        {stBusy && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "32px 0", color: "#5a5248" }}>
            <Av size={48} fs={22} /><p style={{ fontSize: 13, fontStyle: "italic" }}>Mara is thinking...</p>
          </div>
        )}
        {stTxt && (
          <div style={{ background: "#161616", border: `1px solid ${G}22`, borderRadius: 16, padding: "20px", display: "flex", gap: 14, marginTop: 16 }}>
            <Av size={28} fs={13} />
            <p style={{ fontSize: 15, color: "#c8c0b5", lineHeight: 1.7, fontStyle: "italic", fontFamily: "'DM Serif Display',serif" }}>{stTxt}</p>
          </div>
        )}
        {last && <p style={{ marginTop: 16, textAlign: "center", fontSize: 14, color: G, fontStyle: "italic", fontFamily: "'DM Serif Display',serif" }}>{last.e} {last.l} reached</p>}
      </div>
    </Page>
  );

  // â”€â”€ HOME â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const prog = nxtM ? Math.min(100, Math.round((days / nxtM.d) * 100)) : 100;
  return (
    <Page title="Mara">
      <div style={S.homeWrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: G }}>Mara</span>
          <button onClick={reset} style={{ background: "none", border: "none", color: "#3a3530", fontSize: 12, cursor: "pointer" }}>reset</button>
        </div>

        <div style={S.hero}>
          <div style={S.bigNum}>{days}</div>
          <div style={S.bigLab}>{days === 1 ? "day" : "days"}</div>
          <div style={{ fontSize: 12, color: G, marginTop: 10, opacity: 0.7 }}>clean from {cleanFrom}</div>
          {last && <div style={{ marginTop: 12, fontSize: 14, color: G, fontStyle: "italic", fontFamily: "'DM Serif Display',serif" }}>{last.e} {last.l}</div>}
          {nxtM && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, color: "#5a5248", marginBottom: 8 }}>{nxtM.d - days}d to {nxtM.l} {nxtM.e}</div>
              <div style={{ height: 2, background: "#1e1e1e", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", background: G, width: `${prog}%`, borderRadius: 2, transition: "width 0.8s" }} />
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[{ n: done.length, l: "milestones", fn: () => setScreen("milestones") }, { n: checkIns, l: "check-ins" }, { n: cravings, l: "cravings" }].map(({ n, l, fn }) => (
            <div key={l} onClick={fn} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "18px 12px", textAlign: "center", cursor: fn ? "pointer" : "default" }}>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: "#e8e0d5" }}>{n}</div>
              <div style={{ fontSize: 11, color: "#5a5248", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{l}</div>
            </div>
          ))}
        </div>

        <button onClick={() => setScreen("chat")} style={S.checkBtn}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Av size={28} fs={13} />
            <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: G }}>Check in with Mara</span>
          </div>
          <span style={{ fontSize: 12, color: "#5a5248" }}>How are you right now?</span>
        </button>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={S.secLab}>Right now</p>
            <button onClick={() => refreshActs()} disabled={actBusy} style={{ background: "none", border: "none", color: "#5a5248", fontSize: 12, cursor: "pointer" }}>
              {actBusy ? "..." : "â†» refresh"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {acts.map((a, i) => <div key={i} style={S.actCard}>{a}</div>)}
          </div>
        </div>

        <div style={S.nav}>
          {[
            { icon: "ðŸ““", label: "Journal",    fn: () => setScreen("journal") },
            { icon: "ðŸ“Š", label: "Report",     fn: () => setScreen("streak") },
            { icon: "ðŸ†", label: "Milestones", fn: () => setScreen("milestones") },
            { icon: notifOn ? "ðŸ””" : "ðŸ”•", label: notifOn ? "On" : "Notify", fn: enableNotif, dim: notifOn },
          ].map(({ icon, label, fn, dim }) => (
            <button key={label} onClick={fn} disabled={dim} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: dim ? 0.4 : 1 }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span style={{ fontSize: 10, color: "#5a5248", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
            </button>
          ))}
        </div>

        <p style={{ fontSize: 12, color: "#2a2520", textAlign: "center", fontStyle: "italic", fontFamily: "'DM Serif Display',serif" }}>
          You showed up today. That's enough.
        </p>
      </div>
    </Page>
  );
}

// â”€â”€ SHARED COMPONENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Page({ children, title }) {
  return (
    <>
      <Head>
        <title>{title || "Mara"}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="Mara â€” your sobriety companion." />
        <meta name="theme-color" content="#0d0d0d" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ minHeight: "100vh", background: "#0d0d0d", color: "#e8e0d5", fontFamily: "'DM Sans',sans-serif", display: "flex", justifyContent: "center" }}>
        {children}
      </div>
    </>
  );
}

const Av = ({ size, fs }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: "#c9a96e22", border: "1px solid #c9a96e44", color: G, fontFamily: "'DM Serif Display',serif", fontSize: fs, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>M</div>
);
const Btn = ({ children, onClick, dim, style = {} }) => (
  <button onClick={onClick} style={{ background: G, color: "#0d0d0d", border: "none", borderRadius: 10, padding: "14px", fontSize: 16, fontWeight: 500, cursor: "pointer", width: "100%", opacity: dim ? 0.4 : 1, ...style }}>{children}</button>
);
const GBtn = ({ children, onClick }) => (
  <button onClick={onClick} style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px", fontSize: 14, color: "#7a7066", cursor: "pointer" }}>{children}</button>
);
const Bdg = ({ label, val }) => (
  <div style={{ background: "#161616", border: "1px solid #232323", borderRadius: 12, padding: "14px 16px", marginBottom: 12, display: "flex", flexDirection: "column", gap: 4 }}>
    <span style={{ fontSize: 11, color: "#5a5248", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
    <span style={{ fontSize: 15, color: "#c8c0b5" }}>{val}</span>
  </div>
);
const Row = ({ children, style = {} }) => <div style={{ display: "flex", gap: 10, ...style }}>{children}</div>;

// â”€â”€ STYLES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const S = {
  setupWrap: { width: "100%", maxWidth: 420, padding: "60px 24px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 },
  brand:     { fontFamily: "'DM Serif Display',serif", fontSize: 32, color: "#e8e0d5" },
  tagline:   { fontSize: 14, color: "#7a7066", marginBottom: 8 },
  card:      { width: "100%", background: "#161616", border: "1px solid #232323", borderRadius: 18, padding: "28px 24px", display: "flex", flexDirection: "column", gap: 14 },
  q:         { fontFamily: "'DM Serif Display',serif", fontSize: 20, color: "#e8e0d5" },
  qs:        { fontSize: 13, color: "#5a5248", marginTop: -6 },
  din:       { background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px", color: "#e8e0d5", fontSize: 16, outline: "none", width: "100%" },
  ta:        { background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px", color: "#e8e0d5", fontSize: 16, outline: "none", width: "100%", lineHeight: 1.6 },
  wrap:      { width: "100%", maxWidth: 480, padding: "28px 20px 80px" },
  back:      { background: "none", border: "none", color: "#5a5248", fontSize: 13, cursor: "pointer", marginBottom: 20, display: "block", padding: 0 },
  title:     { fontFamily: "'DM Serif Display',serif", fontSize: 26, color: "#e8e0d5", marginBottom: 6 },
  secLab:    { fontSize: 11, color: "#3a3530", textTransform: "uppercase", letterSpacing: "0.12em" },
  jCard:     { background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: "16px 18px" },
  homeWrap:  { width: "100%", maxWidth: 480, padding: "28px 20px 100px", display: "flex", flexDirection: "column", gap: 16 },
  hero:      { background: "#111", border: "1px solid #1e1e1e", borderRadius: 20, padding: "36px 28px 28px", textAlign: "center" },
  bigNum:    { fontFamily: "'DM Serif Display',serif", fontSize: 84, lineHeight: 1, color: "#e8e0d5", letterSpacing: "-4px" },
  bigLab:    { fontSize: 13, color: "#5a5248", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.15em" },
  checkBtn:  { width: "100%", background: "#161616", border: `1px solid ${G}33`, borderRadius: 16, padding: "18px 20px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 },
  actCard:   { background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: "14px", fontSize: 13, color: "#7a7066", lineHeight: 1.4 },
  nav:       { display: "flex", justifyContent: "space-around", padding: "16px 0", borderTop: "1px solid #1a1a1a" },
  chatOuter: { width: "100%", maxWidth: 480, display: "flex", flexDirection: "column" },
  chatHead:  { position: "sticky", top: 0, zIndex: 10, background: "#0d0d0d", borderBottom: "1px solid #1a1a1a", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  msgList:   { padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 14 },
  aRow:      { display: "flex", alignItems: "flex-end", gap: 8 },
  uRow:      { display: "flex", justifyContent: "flex-end" },
  aBub:      { background: "#161616", border: "1px solid #1e1e1e", borderRadius: "18px 18px 18px 4px", padding: "13px 17px", maxWidth: "78%", fontSize: 15, lineHeight: 1.65, color: "#d8d0c5", whiteSpace: "pre-wrap" },
  uBub:      { background: "#c9a96e18", border: "1px solid #c9a96e30", borderRadius: "18px 18px 4px 18px", padding: "13px 17px", maxWidth: "78%", fontSize: 15, lineHeight: 1.65, color: "#e8e0d5" },
  quickBar:  { display: "flex", gap: 8, overflowX: "auto", padding: "12px 16px 0", scrollbarWidth: "none" },
  qBtn:      { whiteSpace: "nowrap", background: "#111", border: "1px solid #222", borderRadius: 20, padding: "8px 14px", fontSize: 14, color: "#7a7066", cursor: "pointer", flexShrink: 0 },
  inputBar:  { display: "flex", gap: 10, padding: "12px 16px 20px", borderTop: "1px solid #1a1a1a", marginTop: 12, background: "#0d0d0d" },
  textIn:    { flex: 1, background: "#111", border: "1px solid #222", borderRadius: 12, padding: "13px 16px", color: "#e8e0d5", fontSize: 16, outline: "none" },
  sendBtn:   { background: G, border: "none", borderRadius: 12, width: 48, minWidth: 48, color: "#0d0d0d", fontSize: 20, cursor: "pointer" },
};
