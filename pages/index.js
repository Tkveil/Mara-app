import { useState, useEffect, useRef } from "react";
import Head from "next/head";

async function callMara(system, messages, max = 400) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ system, messages, max }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data.text;
}

function buildSystem(p, mode = "normal") {
  const mem = p.memory?.length ? `\nWhat you know about this person:\n${p.memory.join("\n")}` : "";
  const pat = p.patterns?.length ? `\nIdentified patterns:\n${p.patterns.join("\n")}` : "";

  const base = `You are Mara. Not a therapist. Not a sponsor. Something better for this moment — a presence that knows this person and tells them the truth.

Person: day ${p.days} sober, clean from ${p.cleanFrom || "substances"}, goals: ${p.goals || "not set"}.
Check-ins: ${p.checkIns}. Cravings handled: ${p.cravings}.${mem}${pat}

Rules:
- Never say "stay strong" "you got this" "I'm proud of you" or any affirmation
- No therapy language. No clinical tone. No motivational quotes.
- Mirror how they talk. If they're blunt, be blunt. If they're tired, be quiet and direct.
- Reference what you know about them. Make it feel like you remember.
- 2-4 sentences MAX unless they clearly need more`;

  if (mode === "crisis") return base + `

CRISIS MODE — they are about to use or deciding right now.
- Drop everything soft. Be direct, sharp, immediate.
- Name it: "Your brain is negotiating right now."
- ONE action only. Not a list. No questions. No processing.
- If patterns exist, call it: "This is the same loop as before."
- Under 3 sentences. Fast is everything.`;

  if (mode === "snapback") return base + `

SNAPBACK MODE — they're justifying or spiraling.
- Pattern interrupt. Say the thing they don't want to hear.
- Hard truth, delivered with care. Real, not harsh.
- Redirect to one physical action immediately after.
- Under 3 sentences.`;

  return base + `

Normal check-in. Meet them where they are. One real question or observation that shows you actually know them. Don't perform caring — just be present.`;
}

function extractMemorySystem() {
  return `Extract key facts from this sobriety check-in to remember for next time.
Return ONLY a JSON array of short factual strings. Max 5 items. Only NEW information.
Examples: "Struggles most on weekend evenings", "Works a stressful job", "Triggers include boredom and isolation"
If nothing new, return: []`;
}

function extractPatternSystem(p) {
  return `Analyze these check-in records for someone staying clean from ${p.cleanFrom}.
Records: ${JSON.stringify(p.recentCheckIns || [])}
Return ONLY a JSON array of pattern strings. Max 3. Be specific.
If no clear patterns yet, return: []`;
}

function microSystem(p) {
  return `Give 4 immediate physical actions for someone staying clean from ${p.cleanFrom || "substances"} who needs to move RIGHT NOW.
Body-first. Concrete. No thinking required.
Return ONLY a JSON array of 4 strings.`;
}

function streakSystem(p) {
  const mem = p.memory?.length ? `What you know: ${p.memory.join(", ")}.` : "";
  const pat = p.patterns?.length ? `Patterns: ${p.patterns.join(", ")}.` : "";
  return `Write a personal streak report. Not generic. Make it feel like you know this person.
Person: day ${p.days} sober, clean from ${p.cleanFrom}, goals: ${p.goals}.
${p.checkIns} check-ins, ${p.cravings} cravings handled. ${mem} ${pat}
3-4 sentences. Sharp, honest, specific. Call the streak "days you kept your word." No fluff. No affirmations.`;
}

function dailyPromptSystem(p) {
  const h = new Date().getHours();
  const t = h < 9 ? "morning" : h < 12 ? "mid-morning" : h < 17 ? "afternoon" : h < 21 ? "evening (high risk time)" : "late night";
  const mem = p.memory?.length ? `Known context: ${p.memory.join(", ")}.` : "";
  return `One specific check-in question for someone on day ${p.days} of sobriety, clean from ${p.cleanFrom}.
Time: ${t}. ${mem}
Make it feel personal. Under 15 words. Return only the question.`;
}

const MILES = [
  { d: 1, l: "First day", e: "🌱" }, { d: 3, l: "72 hours", e: "💧" },
  { d: 7, l: "One week", e: "🔥" }, { d: 14, l: "Two weeks", e: "⚡" },
  { d: 30, l: "One month", e: "🌙" }, { d: 60, l: "Two months", e: "🌊" },
  { d: 90, l: "Three months", e: "✨" }, { d: 180, l: "Half a year", e: "🌿" },
  { d: 365, l: "One year", e: "🏔️" },
];

const DEF_ACTS = [
  "Walk to a different room right now",
  "Drink a full glass of water",
  "Step outside — even just the doorway",
  "Delay 20 minutes. Set a timer.",
];

const G = "#c9a96e";
const RED = "#e05555";
const ld = (k, f) => { try { const v = localStorage.getItem(k); return v != null ? JSON.parse(v) : f; } catch { return f; } };
const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const dc = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0;

export default function Home() {
  const [screen, setScreen]     = useState("home");
  const [step, setStep]         = useState(0);
  const [startDate, setSD]      = useState(null);
  const [cleanFrom, setCF]      = useState("");
  const [goals, setGoals]       = useState("");
  const [notifOn, setNO]        = useState(false);
  const [checkIns, setCI]       = useState(0);
  const [cravings, setCrav]     = useState(0);
  const [journal, setJ]         = useState([]);
  const [acts, setActs]         = useState(DEF_ACTS);
  const [msgs, setMsgs]         = useState([]);
  const [inp, setInp]           = useState("");
  const [busy, setBusy]         = useState(false);
  const [actBusy, setActBusy]   = useState(false);
  const [stTxt, setStTxt]       = useState(null);
  const [stBusy, setStBusy]     = useState(false);
  const [memory, setMemory]     = useState([]);
  const [patterns, setPat]      = useState([]);
  const [recentCI, setRCI]      = useState([]);
  const [dailyQ, setDailyQ]     = useState(null);
  const [crisisMode, setCM]     = useState(false);
  const [listening, setListen]  = useState(false);
  const [showMood, setShowMood] = useState(false);
  const [sd, setSd]             = useState("");
  const [scf, setScf]           = useState("");
  const [sg, setSg]             = useState("");
  const [ji, setJi]             = useState("");
  const [hydrated, setHyd]      = useState(false);

  const botRef   = useRef(null);
  const inRef    = useRef(null);
  const recRef   = useRef(null);

  const days = dc(startDate);
  const done = MILES.filter(m => m.d <= days);
  const nxtM = MILES.find(m => m.d > days) || null;
  const last = done[done.length - 1];
  const ob   = !!(startDate && cleanFrom);
  const prof = { cleanFrom, goals, days, checkIns, cravings, memory, patterns, recentCheckIns: recentCI };

  useEffect(() => {
    setSD(ld("m_start", null)); setCF(ld("m_cf", "")); setGoals(ld("m_goals", ""));
    setNO(ld("m_notif", false)); setCI(ld("m_ci", 0)); setCrav(ld("m_crav", 0));
    setJ(ld("m_j", [])); setMemory(ld("m_memory", [])); setPat(ld("m_patterns", []));
    setRCI(ld("m_rci", [])); setHyd(true);
  }, []);

  useEffect(() => {
    if (!ob || dailyQ) return;
    const today = new Date().toDateString();
    const cached = ld("m_dq", null);
    if (cached?.date === today) { setDailyQ(cached.q); return; }
    callMara(dailyPromptSystem(prof), [{ role: "user", content: "go" }], 60)
      .then(q => { setDailyQ(q); sv("m_dq", { date: today, q }); })
      .catch(() => setDailyQ("How are you actually doing right now?"));
  }, [ob, memory.length]);

  useEffect(() => { botRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  useEffect(() => {
    if (screen === "chat" && msgs.length === 0) {
      const h = new Date().getHours();
      const t = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
      const greeting = memory.length > 0
        ? `Hey. Good ${t}. Day ${days}.\n\n${dailyQ || "What's going on?"}`
        : `Hey. Good ${t}. Day ${days} — you showed up.\n\nWhat's on your mind?`;
      setMsgs([{ r: "a", c: greeting }]);
    }
  }, [screen]);

  useEffect(() => {
    if (screen !== "chat") return;
    const el = inRef.current; if (!el) return;
    const fn = () => setTimeout(() => botRef.current?.scrollIntoView({ behavior: "smooth" }), 350);
    el.addEventListener("focus", fn); return () => el.removeEventListener("focus", fn);
  }, [screen, msgs]);

  function detectMode(text) {
    if (/about to|going to drink|going to use|can't stop|losing it|fuck it|one drink|one hit|just this once|about to relapse/i.test(text)) return "crisis";
    if (/deserve|everyone does it|just tonight|not that bad|been so long|maybe i can|what's the point/i.test(text)) return "snapback";
    if (/craving|urge|tempted|triggered|off|want to use|want to drink/i.test(text)) return "craving";
    return "normal";
  }

  async function send(text) {
    if (!text.trim() || busy) return;
    const mode = detectMode(text);
    if (mode === "crisis") setCM(true);
    const um = { r: "u", c: text };
    const next = [...msgs, um];
    setMsgs(next); setInp(""); setBusy(true);
    const ni = checkIns + 1; setCI(ni); sv("m_ci", ni);
    const ciR = { time: Date.now(), hour: new Date().getHours(), text: text.slice(0, 80), mode };
    const newRCI = [...recentCI, ciR].slice(-30); setRCI(newRCI); sv("m_rci", newRCI);
    let nc = cravings;
    if (mode === "crisis" || mode === "craving") { nc++; setCrav(nc); sv("m_crav", nc); refreshActs(text); }
    const api = next.map(m => ({ role: m.r === "u" ? "user" : "assistant", content: m.c }));
    const sysMode = mode === "crisis" ? "crisis" : mode === "snapback" ? "snapback" : "normal";
    try {
      const reply = await callMara(buildSystem({ ...prof, checkIns: ni, cravings: nc }, sysMode), api);
      setMsgs(p => [...p, { r: "a", c: reply, mode: sysMode }]);
      if (next.length >= 4 && next.length % 4 === 0) extractMemory(next);
      if (next.length === 3) setShowMood(true);
    } catch (e) {
      setMsgs(p => [...p, { r: "a", c: `Something went wrong — ${e.message}` }]);
    }
    setBusy(false);
  }

  async function extractMemory(conv) {
    try {
      const raw = await callMara(extractMemorySystem(),
        [{ role: "user", content: conv.map(m => `${m.r === "u" ? "Person" : "Mara"}: ${m.c}`).join("\n") }], 200);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        const nm = [...new Set([...memory, ...parsed])].slice(-20);
        setMemory(nm); sv("m_memory", nm);
      }
    } catch {}
  }

  async function crisisTap() {
    setCM(true); setScreen("chat");
    const opening = { r: "a", c: "I'm here. What's happening right now?" };
    setMsgs([opening]);
    setTimeout(async () => {
      try {
        const reply = await callMara(buildSystem(prof, "crisis"), [
          { role: "user", content: "I'm about to use. I tapped the crisis button." }
        ]);
        setMsgs(p => [...p,
          { r: "u", c: "I'm about to use. I tapped the crisis button." },
          { r: "a", c: reply, mode: "crisis" }
        ]);
      } catch {}
    }, 600);
  }

  async function refreshActs(ctx = "I need to do something right now") {
    setActBusy(true);
    try {
      const raw = await callMara(microSystem(prof), [{ role: "user", content: ctx }], 150);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed) && parsed.length >= 4) setActs(parsed.slice(0, 4));
    } catch {}
    setActBusy(false);
  }

  async function getStreak() {
    setStBusy(true);
    try {
      if (recentCI.length >= 5) {
        const raw = await callMara(extractPatternSystem(prof), [{ role: "user", content: "analyze" }], 200);
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        if (Array.isArray(parsed) && parsed.length > 0) { setPat(parsed); sv("m_patterns", parsed); }
      }
      const t = await callMara(streakSystem(prof), [{ role: "user", content: "streak report" }]);
      setStTxt(t);
    } catch (e) { setStTxt(`Error: ${e.message}`); }
    setStBusy(false);
  }

  function toggleVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice not supported. Try Chrome or Safari."); return; }
    if (listening) { recRef.current?.stop(); setListen(false); return; }
    const r = new SR();
    r.continuous = false; r.interimResults = false; r.lang = "en-US";
    r.onresult = e => { setInp(e.results[0][0].transcript); setListen(false); };
    r.onerror = () => setListen(false);
    r.onend = () => setListen(false);
    recRef.current = r; r.start(); setListen(true);
  }

  function saveMood(val) {
    setShowMood(false);
    const moods = ld("m_moods", []);
    sv("m_moods", [...moods, { mood: val, day: days, time: Date.now(), hour: new Date().getHours() }].slice(-90));
  }

  function saveJ() {
    if (!ji.trim()) return;
    const e = { id: Date.now(), t: ji.trim(), date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }), day: days };
    const u = [e, ...journal].slice(0, 50); setJ(u); sv("m_j", u); setJi("");
  }

  function finish() {
    if (!sd || !scf) return;
    const d = new Date(sd).toISOString();
    setSD(d); sv("m_start", d); setCF(scf); sv("m_cf", scf); setGoals(sg); sv("m_goals", sg);
    setScreen("home");
  }

  function reset() {
    ["m_start","m_cf","m_goals","m_ci","m_crav","m_j","m_notif","m_memory","m_patterns","m_rci","m_dq","m_moods"]
      .forEach(k => { try { localStorage.removeItem(k); } catch {} });
    setSD(null); setCF(""); setGoals(""); setCI(0); setCrav(0); setJ([]); setNO(false);
    setMsgs([]); setStTxt(null); setMemory([]); setPat([]); setRCI([]); setDailyQ(null); setCM(false);
    setStep(0); setSd(""); setScf(""); setSg(""); setScreen("home");
  }

  async function enableNotif() {
    if (!("Notification" in window)) { alert("Not supported in this browser."); return; }
    const p = await Notification.requestPermission();
    if (p === "granted") { setNO(true); sv("m_notif", true); new Notification("Mara", { body: "I'll check in with you daily." }); }
    else alert("Enable notifications in your browser settings.");
  }

  if (!hydrated) return null;

  // ── ONBOARDING ─────────────────────────────────────────────────
  if (!ob) return (
    <Page title="Mara">
      <div style={S.setupWrap}>
        <Av size={56} fs={26} />
        <h1 style={S.brand}>Mara</h1>
        <p style={S.tagline}>Your sobriety companion.</p>
        <div style={S.card}>
          {step === 0 && <>
            <p style={S.q}>When did you start?</p>
            <p style={S.qs}>The day you decided to show up for yourself.</p>
            <input type="date" value={sd} onChange={e => setSd(e.target.value)} style={S.din} max={new Date().toISOString().split("T")[0]} />
            <Btn onClick={() => sd && setStep(1)} dim={!sd}>Next →</Btn>
          </>}
          {step === 1 && <>
            <p style={S.q}>What are you staying clean from?</p>
            <p style={S.qs}>Just between you and Mara.</p>
            <textarea value={scf} onChange={e => setScf(e.target.value)} placeholder="e.g. alcohol, weed, pills, all of it..." style={S.ta} rows={3} />
            <Row><GBtn onClick={() => setStep(0)}>← Back</GBtn><Btn onClick={() => scf.trim() && setStep(2)} dim={!scf.trim()} style={{ flex: 1 }}>Next →</Btn></Row>
          </>}
          {step === 2 && <>
            <p style={S.q}>What do you want to build?</p>
            <p style={S.qs}>Life on the other side of this.</p>
            <textarea value={sg} onChange={e => setSg(e.target.value)} placeholder="e.g. be present for my kids, write my book..." style={S.ta} rows={3} />
            <Row><GBtn onClick={() => setStep(1)}>← Back</GBtn><Btn onClick={finish} style={{ flex: 1 }}>Let's go</Btn></Row>
          </>}
        </div>
        <Row style={{ gap: 8, marginTop: 8 }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === step ? G : "#2a2520", transition: "background 0.3s" }} />)}
        </Row>
        <p style={{ fontSize: 12, color: "#3a3530" }}>No account. No email. Just you and Mara.</p>
      </div>
    </Page>
  );

  // ── CHAT ─────────────────────────────────────────────────────────
  if (screen === "chat") return (
    <Page title="Mara">
      <div style={S.chatOuter}>
        <div style={S.chatHead}>
          <button onClick={() => { setScreen("home"); setMsgs([]); setCM(false); }} style={S.back}>← back</button>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: crisisMode ? RED : G }}>Mara</div>
            <div style={{ fontSize: 11, color: "#5a5248" }}>Day {days}</div>
          </div>
        </div>

        {crisisMode && (
          <div style={{ background: "#1a0a0a", borderBottom: `1px solid ${RED}44`, padding: "8px 16px", fontSize: 11, color: RED, textAlign: "center", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Crisis mode — Mara is focused on right now
          </div>
        )}

        <div style={S.msgList}>
          {msgs.map((m, i) => (
            <div key={i} style={m.r === "u" ? S.uRow : S.aRow}>
              {m.r === "a" && <Av size={28} fs={13} crisis={m.mode === "crisis" || m.mode === "snapback"} />}
              <div style={m.r === "u" ? S.uBub : { ...S.aBub, borderColor: m.mode === "crisis" ? `${RED}44` : "#1e1e1e" }}>{m.c}</div>
            </div>
          ))}
          {busy && (
            <div style={S.aRow}>
              <Av size={28} fs={13} crisis={crisisMode} />
              <div style={S.aBub}><span style={{ letterSpacing: 4, color: crisisMode ? RED : G }}>· · ·</span></div>
            </div>
          )}
          {showMood && !busy && (
            <div style={{ padding: "8px 0 4px" }}>
              <p style={{ fontSize: 12, color: "#5a5248", marginBottom: 8 }}>How are you feeling right now? (1–10)</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button key={n} onClick={() => saveMood(n)} style={{ background: "#111", border: "1px solid #222", borderRadius: 8, padding: "8px 11px", color: "#e8e0d5", fontSize: 14, cursor: "pointer" }}>{n}</button>
                ))}
              </div>
            </div>
          )}
          <div ref={botRef} style={{ height: 12 }} />
        </div>

        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "8px 16px 0", scrollbarWidth: "none" }}>
          {["I feel off","I'm having a craving","I'm bored","I'm doing okay","I feel triggered","I just need to talk"].map(p => (
            <button key={p} onClick={() => send(p)} style={S.qBtn}>{p}</button>
          ))}
        </div>

        <div style={S.inputBar}>
          <button onClick={toggleVoice} style={{ background: listening ? G : "#111", border: `1px solid ${listening ? G : "#222"}`, borderRadius: 12, width: 44, minWidth: 44, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>🎙</button>
          <input ref={inRef} value={inp} onChange={e => setInp(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(inp)}
            placeholder={listening ? "Listening..." : "Talk to Mara..."}
            style={S.textIn} enterKeyHint="send" autoComplete="off" />
          <button onClick={() => send(inp)} disabled={!inp.trim() || busy}
            style={{ ...S.sendBtn, opacity: inp.trim() && !busy ? 1 : 0.4 }}>→</button>
        </div>
      </div>
    </Page>
  );

  // ── JOURNAL ──────────────────────────────────────────────────────
  if (screen === "journal") return (
    <Page title="Mara — Journal">
      <div style={S.wrap}>
        <button onClick={() => setScreen("home")} style={S.back}>← back</button>
        <h2 style={S.title}>Journal</h2>
        <p style={{ fontSize: 13, color: "#5a5248", marginBottom: 20 }}>Write it out. No one else reads this.</p>
        <textarea value={ji} onChange={e => setJi(e.target.value)} placeholder="What's on your mind today..." style={{ ...S.ta, minHeight: 120, marginBottom: 12 }} />
        <Btn onClick={saveJ} dim={!ji.trim()} style={{ marginBottom: 28 }}>Save entry</Btn>
        {journal.length > 0 && <>
          <p style={S.secLab}>Past entries</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
            {journal.map(e => (
              <div key={e.id} style={S.jCard}>
                <div style={{ fontSize: 11, color: "#3a3530", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{e.date} · Day {e.day}</div>
                <div style={{ fontSize: 14, color: "#8a8278", lineHeight: 1.6 }}>{e.t}</div>
              </div>
            ))}
          </div>
        </>}
      </div>
    </Page>
  );

  // ── MILESTONES ───────────────────────────────────────────────────
  if (screen === "milestones") return (
    <Page title="Mara — Milestones">
      <div style={S.wrap}>
        <button onClick={() => setScreen("home")} style={S.back}>← back</button>
        <h2 style={S.title}>Your journey</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          {MILES.map(m => {
            const ok = days >= m.d, pct = ok ? 100 : Math.min(100, Math.round((days / m.d) * 100));
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
                {ok && <span style={{ color: G, fontSize: 16 }}>✓</span>}
              </div>
            );
          })}
        </div>
      </div>
    </Page>
  );

  // ── STREAK ───────────────────────────────────────────────────────
  if (screen === "streak") return (
    <Page title="Mara — Report">
      <div style={S.wrap}>
        <button onClick={() => { setScreen("home"); setStTxt(null); }} style={S.back}>← back</button>
        <h2 style={S.title}>Your report</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
          {[{ n: days, l: "days kept" }, { n: checkIns, l: "check-ins" }, { n: cravings, l: "cravings" }].map(({ n, l }) => (
            <div key={l} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "18px 12px", textAlign: "center" }}>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: "#e8e0d5" }}>{n}</div>
              <div style={{ fontSize: 11, color: "#5a5248", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{l}</div>
            </div>
          ))}
        </div>
        <Bdg label="Staying clean from" val={cleanFrom} />
        {goals && <Bdg label="Building toward" val={goals} />}
        {patterns.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ ...S.secLab, marginBottom: 8 }}>Mara has noticed</p>
            {patterns.map((p, i) => <div key={i} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 10, padding: "10px 14px", marginBottom: 6, fontSize: 13, color: "#8a8278" }}>{p}</div>)}
          </div>
        )}
        {!stTxt && !stBusy && <Btn onClick={getStreak}>Get Mara's read on your streak</Btn>}
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

  // ── HOME ─────────────────────────────────────────────────────────
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
          <div style={S.bigLab}>days you kept your word</div>
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

        {/* CRISIS BUTTON */}
        <button onClick={crisisTap} style={S.crisisBtn}>
          <span style={{ fontSize: 22 }}>🚨</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e8e0d5", fontFamily: "'DM Serif Display',serif" }}>I'm about to use</div>
            <div style={{ fontSize: 12, color: "#7a7066", marginTop: 2 }}>Mara responds immediately — no typing needed</div>
          </div>
        </button>

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
            <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: G }}>Check in with Mara</span>
          </div>
          {dailyQ && <span style={{ fontSize: 13, color: "#7a7066", textAlign: "left", fontStyle: "italic" }}>"{dailyQ}"</span>}
        </button>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={S.secLab}>Do this right now</p>
            <button onClick={() => refreshActs()} disabled={actBusy} style={{ background: "none", border: "none", color: "#5a5248", fontSize: 12, cursor: "pointer" }}>{actBusy ? "..." : "↻ refresh"}</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {acts.map((a, i) => <div key={i} style={S.actCard}>{a}</div>)}
          </div>
        </div>

        {memory.length > 0 && (
          <div style={{ background: "#111", border: `1px solid ${G}22`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <Av size={24} fs={11} />
            <p style={{ fontSize: 12, color: "#5a5248" }}>Mara remembers {memory.length} things about you — gets more specific over time.</p>
          </div>
        )}

        <div style={S.nav}>
          {[
            { icon: "📓", label: "Journal", fn: () => setScreen("journal") },
            { icon: "📊", label: "Report", fn: () => setScreen("streak") },
            { icon: "🏆", label: "Milestones", fn: () => setScreen("milestones") },
            { icon: notifOn ? "🔔" : "🔕", label: notifOn ? "On" : "Notify", fn: enableNotif, dim: notifOn },
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

function Page({ children, title }) {
  return (
    <>
      <Head>
        <title>{title || "Mara"}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="Mara — your sobriety companion." />
        <meta name="theme-color" content="#0d0d0d" />
      </Head>
      <div style={{ minHeight: "100vh", background: "#0d0d0d", color: "#e8e0d5", fontFamily: "'DM Sans',sans-serif", display: "flex", justifyContent: "center" }}>
        {children}
      </div>
    </>
  );
}

const Av = ({ size, fs, crisis }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: crisis ? "#e0555522" : "#c9a96e22", border: `1px solid ${crisis ? "#e0555544" : "#c9a96e44"}`, color: crisis ? RED : G, fontFamily: "'DM Serif Display',serif", fontSize: fs, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>M</div>
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

const S = {
  setupWrap: { width: "100%", maxWidth: 420, padding: "60px 24px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 },
  brand: { fontFamily: "'DM Serif Display',serif", fontSize: 32, color: "#e8e0d5" },
  tagline: { fontSize: 14, color: "#7a7066", marginBottom: 8 },
  card: { width: "100%", background: "#161616", border: "1px solid #232323", borderRadius: 18, padding: "28px 24px", display: "flex", flexDirection: "column", gap: 14 },
  q: { fontFamily: "'DM Serif Display',serif", fontSize: 20, color: "#e8e0d5" },
  qs: { fontSize: 13, color: "#5a5248", marginTop: -6 },
  din: { background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px", color: "#e8e0d5", fontSize: 16, outline: "none", width: "100%" },
  ta: { background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px", color: "#e8e0d5", fontSize: 16, outline: "none", width: "100%", lineHeight: 1.6 },
  wrap: { width: "100%", maxWidth: 480, padding: "28px 20px 80px" },
  back: { background: "none", border: "none", color: "#5a5248", fontSize: 13, cursor: "pointer", marginBottom: 20, display: "block", padding: 0 },
  title: { fontFamily: "'DM Serif Display',serif", fontSize: 26, color: "#e8e0d5", marginBottom: 6 },
  secLab: { fontSize: 11, color: "#3a3530", textTransform: "uppercase", letterSpacing: "0.12em" },
  jCard: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: "16px 18px" },
  homeWrap: { width: "100%", maxWidth: 480, padding: "28px 20px 100px", display: "flex", flexDirection: "column", gap: 16 },
  hero: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 20, padding: "36px 28px 28px", textAlign: "center" },
  bigNum: { fontFamily: "'DM Serif Display',serif", fontSize: 84, lineHeight: 1, color: "#e8e0d5", letterSpacing: "-4px" },
  bigLab: { fontSize: 11, color: "#5a5248", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.12em" },
  crisisBtn: { width: "100%", background: "#1a0a0a", border: `1px solid ${RED}55`, borderRadius: 16, padding: "18px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 },
  checkBtn: { width: "100%", background: "#161616", border: `1px solid ${G}33`, borderRadius: 16, padding: "18px 20px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 },
  actCard: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: "14px", fontSize: 13, color: "#7a7066", lineHeight: 1.4 },
  nav: { display: "flex", justifyContent: "space-around", padding: "16px 0", borderTop: "1px solid #1a1a1a" },
  chatOuter: { width: "100%", maxWidth: 480, display: "flex", flexDirection: "column" },
  chatHead: { position: "sticky", top: 0, zIndex: 10, background: "#0d0d0d", borderBottom: "1px solid #1a1a1a", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  msgList: { padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 14 },
  aRow: { display: "flex", alignItems: "flex-end", gap: 8 },
  uRow: { display: "flex", justifyContent: "flex-end" },
  aBub: { background: "#161616", border: "1px solid #1e1e1e", borderRadius: "18px 18px 18px 4px", padding: "13px 17px", maxWidth: "78%", fontSize: 15, lineHeight: 1.65, color: "#d8d0c5", whiteSpace: "pre-wrap" },
  uBub: { background: "#c9a96e18", border: "1px solid #c9a96e30", borderRadius: "18px 18px 4px 18px", padding: "13px 17px", maxWidth: "78%", fontSize: 15, lineHeight: 1.65, color: "#e8e0d5" },
  qBtn: { whiteSpace: "nowrap", background: "#111", border: "1px solid #222", borderRadius: 20, padding: "8px 14px", fontSize: 14, color: "#7a7066", cursor: "pointer", flexShrink: 0 },
  inputBar: { display: "flex", gap: 8, padding: "12px 16px 20px", borderTop: "1px solid #1a1a1a", marginTop: 12, background: "#0d0d0d" },
  textIn: { flex: 1, background: "#111", border: "1px solid #222", borderRadius: 12, padding: "13px 16px", color: "#e8e0d5", fontSize: 16, outline: "none" },
  sendBtn: { background: G, border: "none", borderRadius: 12, width: 48, minWidth: 48, color: "#0d0d0d", fontSize: 20, cursor: "pointer" },
};
