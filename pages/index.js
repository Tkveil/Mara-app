
import { useState, useEffect, useRef } from "react";
import Head from "next/head";

// -- API -----------------------------------------------------------
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

// -- SYSTEM PROMPTS ------------------------------------------------
function buildSystem(p) {
  const programContext = {
    "AA / NA": "They attend AA or NA. You can reference the program naturally -- sponsors, steps, meetings, chips -- but never preach about it. Meet them where they are.",
    "Therapy": "They work with a therapist. You can suggest bringing things up in therapy. They're used to self-reflection. Ask deeper questions.",
    "Outpatient / IOP": "They're in outpatient or IOP. They have structure and professional support. You fill the gaps -- evenings, weekends, hard moments between sessions.",
    "Going it alone": "They have no formal support system. You may be one of their only anchors. Lean in more. Be more proactive. More micro-actions.",
    "Prefer not to say": "Don't assume anything about their support system. Read the conversation and adapt.",
  };

  return `You are Mara -- a sobriety companion. Calm, grounded, real. Not a therapist, not a recovery program. Like a trusted friend who genuinely gets it.

Person: day ${p.days} sober, staying clean from ${p.cleanFrom || "substances"}, goals: ${p.goals || "not specified"}.
Support: ${programContext[p.program] || "Unknown -- read the conversation and adapt."}
${p.memory?.length ? `\nWhat you know about them:\n${p.memory.join("\n")}` : ""}

Tone: warm, direct, never preachy. 2-4 sentences max. No judgment. No clinical language.
Never say "stay strong" or "you've got this" or any affirmation.
Reference what they're staying clean from and their goals naturally.
Mirror how they talk. If they're blunt, be blunt. If they're quiet, be quiet.
If crisis: "This sounds big -- is there someone you can call right now?"

Mara is a personal companion, not a treatment program. If someone is in crisis they can call or text 988.`;
}

function crisisSystem(p) {
  return `You are Mara in CRISIS MODE. Someone is about to use after ${p.days} days sober.
Drop everything soft. Be direct, sharp, immediate.
Name it: "Your brain is negotiating right now."
ONE action only. Not a list. No questions. No processing.
Under 3 sentences. Fast is everything.`;
}

function microSystem(p) {
  return `Give exactly 4 short, immediate, concrete actions for someone staying clean from ${p.cleanFrom || "substances"}. Return ONLY a JSON array of 4 strings. No preamble.`;
}

function streakSystem(p) {
  return `Write 3-4 sentences as a personal streak report. Person: day ${p.days} sober, clean from ${p.cleanFrom}, goals: ${p.goals}, support: ${p.program}, ${p.checkIns} check-ins, ${p.cravings} cravings handled. Warm, honest, specific. No fluff. No "you've got this."`;
}

// -- CONSTANTS -----------------------------------------------------
const MILES = [
  { d: 1,   l: "First day",    e: "*" },
  { d: 3,   l: "72 hours",     e: "*" },
  { d: 7,   l: "One week",     e: "*" },
  { d: 14,  l: "Two weeks",    e: "*" },
  { d: 30,  l: "One month",    e: "*" },
  { d: 60,  l: "Two months",   e: "*" },
  { d: 90,  l: "Three months", e: "*" },
  { d: 180, l: "Half a year",  e: "*" },
  { d: 365, l: "One year",     e: "*" },
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

const PROGRAMS = [
  "AA / NA",
  "Therapy",
  "Outpatient / IOP",
  "Going it alone",
  "Prefer not to say",
];

const G = "#c9a96e";
const ld = (k, f) => { try { const v = localStorage.getItem(k); return v != null ? JSON.parse(v) : f; } catch { return f; } };
const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const dc = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0;

// -- APP -----------------------------------------------------------
export default function Home() {
  const [screen, setScreen]     = useState("home");
  const [step, setStep]         = useState(0);
  const [startDate, setSD]      = useState(null);
  const [cleanFrom, setCF]      = useState("");
  const [goals, setGoals]       = useState("");
  const [program, setProg]      = useState("");
  const [checkInTime, setCIT]   = useState("09:00");
  const [notifOn, setNO]        = useState(false);
  const [checkIns, setCI]       = useState(0);
  const [cravings, setCrav]     = useState(0);
  const [journal, setJ]         = useState([]);
  const [memory, setMemory]     = useState([]);
  const [acts, setActs]         = useState(DEF_ACTS);
  const [msgs, setMsgs]         = useState([]);
  const [inp, setInp]           = useState("");
  const [busy, setBusy]         = useState(false);
  const [actBusy, setActBusy]   = useState(false);
  const [stTxt, setStTxt]       = useState(null);
  const [stBusy, setStBusy]     = useState(false);
  const [sd, setSd]             = useState("");
  const [scf, setScf]           = useState("");
  const [sg, setSg]             = useState("");
  const [sp, setSp]             = useState("");
  const [sct, setSct]           = useState("09:00");
  const [ji, setJi]             = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [crisisMode, setCrisis] = useState(false);

  const botRef = useRef(null);
  const inRef  = useRef(null);

  useEffect(() => {
    setSD(ld("m_start", null));
    setCF(ld("m_cf", ""));
    setGoals(ld("m_goals", ""));
    setProg(ld("m_prog", ""));
    setCIT(ld("m_cit", "09:00"));
    setNO(ld("m_notif", false));
    setCI(ld("m_ci", 0));
    setCrav(ld("m_crav", 0));
    setJ(ld("m_j", []));
    setMemory(ld("m_memory", []));
    setHydrated(true);
  }, []);

  const days    = dc(startDate);
  const done    = MILES.filter((m) => m.d <= days);
  const nxtM    = MILES.find((m) => m.d > days) || null;
  const last    = done[done.length - 1];
  const ob      = !!(startDate && cleanFrom && program);
  const prof    = { cleanFrom, goals, days, checkIns, cravings, program, memory };

  useEffect(() => { botRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  useEffect(() => {
    if (screen === "chat" && msgs.length === 0) {
      const h = new Date().getHours();
      const t = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
      setMsgs([{ r: "a", c: `Hey. Good ${t}. Day ${days} -- you showed up.\n\nWhat's on your mind?` }]);
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
    const sys = crisisMode ? crisisSystem(prof) : buildSystem({ ...prof, checkIns: ni, cravings: nc });
    try {
      const reply = await callMara(sys, api);
      setMsgs((p) => [...p, { r: "a", c: reply }]);
      // save notable things to memory
      if (text.length > 30) {
        const newMem = [`Day ${days}: "${text.slice(0, 80)}"`,...memory].slice(0, 20);
        setMemory(newMem); sv("m_memory", newMem);
      }
    } catch (e) {
      setMsgs((p) => [...p, { r: "a", c: `Something went wrong -- ${e.message}` }]);
    }
    setBusy(false);
  }

  async function triggerCrisis() {
    setCrisis(true);
    setScreen("chat");
    setMsgs([{ r: "a", c: `Stop.\n\nDay ${days}. You've handled ${cravings} cravings before this one.\n\nWhat's happening right now -- one sentence.` }]);
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

  function shareStreak() {
    const text = `Day ${days} sober. ${last ? last.l + " " + last.e : ""}\nClean from ${cleanFrom}.\n\nTracking with Mara -- mymara.app`;
    if (navigator.share) {
      navigator.share({ text });
    } else {
      navigator.clipboard?.writeText(text);
      alert("Copied to clipboard!");
    }
  }

  async function enableNotif() {
    if (!("Notification" in window)) { alert("Notifications not supported here."); return; }
    const p = await Notification.requestPermission();
    if (p === "granted") {
      setNO(true); sv("m_notif", true);
      new Notification("Mara", { body: `Daily check-in set for ${checkInTime}. I'll be here.` });
    } else alert("Permission denied -- enable in browser settings.");
  }

  function finish() {
    if (!sd || !scf || !sp) return;
    const d = new Date(sd).toISOString();
    setSD(d); sv("m_start", d);
    setCF(scf); sv("m_cf", scf);
    setGoals(sg); sv("m_goals", sg);
    setProg(sp); sv("m_prog", sp);
    setCIT(sct); sv("m_cit", sct);
    setScreen("home");
  }

  function reset() {
    ["m_start","m_cf","m_goals","m_prog","m_cit","m_ci","m_crav","m_j","m_notif","m_memory"]
      .forEach((k) => { try { localStorage.removeItem(k); } catch {} });
    setSD(null); setCF(""); setGoals(""); setProg(""); setCI(0); setCrav(0);
    setJ([]); setMemory([]); setNO(false); setMsgs([]); setStTxt(null); setCrisis(false);
    setStep(0); setSd(""); setScf(""); setSg(""); setSp(""); setScreen("home");
  }

  if (!hydrated) return null;

  // -- ONBOARDING -------------------------------------------------
  if (!ob) return (
    <Page title="Mara -- Setup">
      <div style={S.setupWrap}>
        <Av size={56} fs={26} />
        <h1 style={S.brand}>Mara</h1>
        <p style={S.tagline}>Your sobriety companion.</p>
        <div style={S.card}>
          {step === 0 && <>
            <p style={S.q}>When did you start?</p>
            <p style={S.qs}>The day you decided to show up for yourself.</p>
            <input type="date" value={sd} onChange={(e) => setSd(e.target.value)} style={S.din} max={new Date().toISOString().split("T")[0]} />
            <Btn onClick={() => sd && setStep(1)} dim={!sd}>Next</Btn>
          </>}
          {step === 1 && <>
            <p style={S.q}>What are you staying clean from?</p>
            <p style={S.qs}>Just between you and Mara.</p>
            <textarea value={scf} onChange={(e) => setScf(e.target.value)} placeholder="e.g. alcohol, weed, pills, all of it..." style={S.ta} rows={3} />
            <Row><GBtn onClick={() => setStep(0)}>Back</GBtn><Btn onClick={() => scf.trim() && setStep(2)} dim={!scf.trim()} style={{ flex: 1 }}>Next</Btn></Row>
          </>}
          {step === 2 && <>
            <p style={S.q}>What do you want to build?</p>
            <p style={S.qs}>Life on the other side of this.</p>
            <textarea value={sg} onChange={(e) => setSg(e.target.value)} placeholder="e.g. be present for my kids, write my book..." style={S.ta} rows={3} />
            <Row><GBtn onClick={() => setStep(1)}>Back</GBtn><Btn onClick={() => setStep(3)} style={{ flex: 1 }}>Next</Btn></Row>
          </>}
          {step === 3 && <>
            <p style={S.q}>Do you have a support system?</p>
            <p style={S.qs}>Helps Mara speak your language.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PROGRAMS.map((prog) => (
                <button key={prog} onClick={() => setSp(prog)}
                  style={{ ...S.optBtn, borderColor: sp === prog ? G : "#2a2a2a", color: sp === prog ? "#e8e0d5" : "#7a7066" }}>
                  {prog}
                </button>
              ))}
            </div>
            <Row style={{ marginTop: 8 }}><GBtn onClick={() => setStep(2)}>Back</GBtn><Btn onClick={() => sp && setStep(4)} dim={!sp} style={{ flex: 1 }}>Next</Btn></Row>
          </>}
          {step === 4 && <>
            <p style={S.q}>When should Mara check in?</p>
            <p style={S.qs}>We'll send you a daily reminder.</p>
            <input type="time" value={sct} onChange={(e) => setSct(e.target.value)} style={S.din} />
            <Row><GBtn onClick={() => setStep(3)}>Back</GBtn><Btn onClick={finish} style={{ flex: 1 }}>Let's go</Btn></Row>
          </>}
        </div>
        <Row style={{ gap: 8, marginTop: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === step ? G : "#2a2520", transition: "background 0.3s" }} />)}
        </Row>
        <p style={{ fontSize: 11, color: "#3a3530", textAlign: "center" }}>No account. No email. Just you and Mara.</p>
        <p style={{ fontSize: 11, color: "#2a2520", textAlign: "center" }}>Mara is a personal companion, not a treatment program.</p>
      </div>
    </Page>
  );

  // -- CHAT ---------------------------------------------------------
  if (screen === "chat") return (
    <Page title="Mara -- Chat">
      <div style={S.chatOuter}>
        <div style={S.chatHead}>
          <button onClick={() => { setScreen("home"); setMsgs([]); setCrisis(false); }} style={S.back}>back</button>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: crisisMode ? "#e05555" : G }}>
              {crisisMode ? "Crisis mode" : "Mara"}
            </div>
            <div style={{ fontSize: 11, color: "#5a5248" }}>Day {days}</div>
          </div>
        </div>
        <div style={S.msgList}>
          {msgs.map((m, i) => (
            <div key={i} style={m.r === "u" ? S.uRow : S.aRow}>
              {m.r === "a" && <Av size={28} fs={13} crisis={crisisMode} />}
              <div style={m.r === "u" ? S.uBub : { ...S.aBub, borderColor: crisisMode ? "#e0555533" : "#1e1e1e" }}>{m.c}</div>
            </div>
          ))}
          {busy && <div style={S.aRow}><Av size={28} fs={13} crisis={crisisMode} /><div style={S.aBub}><span style={{ letterSpacing: 4, color: crisisMode ? "#e05555" : G }}>. . .</span></div></div>}
          <div ref={botRef} style={{ height: 12 }} />
        </div>
        {!crisisMode && (
          <div style={S.quickBar}>
            {QUICK.map((p) => <button key={p} onClick={() => send(p)} style={S.qBtn}>{p}</button>)}
          </div>
        )}
        <div style={S.inputBar}>
          <input ref={inRef} value={inp} onChange={(e) => setInp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(inp)}
            placeholder={crisisMode ? "What's happening right now..." : "Talk to Mara..."}
            style={{ ...S.textIn, borderColor: crisisMode ? "#e05555" : "#222" }}
            enterKeyHint="send" autoComplete="off" />
          <button onClick={() => send(inp)} disabled={!inp.trim() || busy}
            style={{ ...S.sendBtn, background: crisisMode ? "#e05555" : G, opacity: inp.trim() && !busy ? 1 : 0.4 }}>Send</button>
        </div>
      </div>
    </Page>
  );

  // -- JOURNAL ------------------------------------------------------
  if (screen === "journal") return (
    <Page title="Mara -- Journal">
      <div style={S.wrap}>
        <button onClick={() => setScreen("home")} style={S.back}>back</button>
        <h2 style={S.title}>Journal</h2>
        <p style={{ fontSize: 13, color: "#5a5248", marginBottom: 20 }}>Write it out. No one else reads this.</p>
        <textarea value={ji} onChange={(e) => setJi(e.target.value)} placeholder="What's on your mind today..." style={{ ...S.ta, minHeight: 120, marginBottom: 12 }} />
        <Btn onClick={saveJ} dim={!ji.trim()} style={{ marginBottom: 28 }}>Save entry</Btn>
        {journal.length > 0 && <>
          <p style={S.secLab}>Past entries</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
            {journal.map((e) => (
              <div key={e.id} style={S.jCard}>
                <div style={{ fontSize: 11, color: "#3a3530", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{e.date} . Day {e.day}</div>
                <div style={{ fontSize: 14, color: "#8a8278", lineHeight: 1.6 }}>{e.t}</div>
              </div>
            ))}
          </div>
        </>}
      </div>
    </Page>
  );

  // -- MILESTONES ---------------------------------------------------
  if (screen === "milestones") return (
    <Page title="Mara -- Milestones">
      <div style={S.wrap}>
        <button onClick={() => setScreen("home")} style={S.back}>back</button>
        <h2 style={S.title}>Your journey</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          {MILES.map((m) => {
            const ok = days >= m.d;
            const pct = ok ? 100 : Math.min(100, Math.round((days / m.d) * 100));
            return (
              <div key={m.d} style={{ display: "flex", alignItems: "center", gap: 14, background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: "16px 18px", opacity: ok ? 1 : 0.4 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}></span>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 14, color: "#c8c0b5" }}>{m.l}</span>
                  <div style={{ height: 2, background: "#1e1e1e", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: G, width: `${pct}%`, borderRadius: 2 }} />
                  </div>
                </div>
                <span style={{ fontSize: 12, color: "#3a3530", flexShrink: 0 }}>{m.d}d</span>
                {ok && <span style={{ color: G, fontSize: 16 }}>done</span>}
              </div>
            );
          })}
        </div>
      </div>
    </Page>
  );

  // -- STREAK REPORT ------------------------------------------------
  if (screen === "streak") return (
    <Page title="Mara -- Report">
      <div style={S.wrap}>
        <button onClick={() => { setScreen("home"); setStTxt(null); }} style={S.back}>back</button>
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
        <Bdg label="Support" val={program} />
        {!stTxt && !stBusy && <Btn onClick={getStreak}>Get Mara's take on your streak</Btn>}
        {stBusy && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "32px 0", color: "#5a5248" }}>
          <Av size={48} fs={22} /><p style={{ fontSize: 13, fontStyle: "italic" }}>Mara is thinking...</p>
        </div>}
        {stTxt && <>
          <div style={{ background: "#161616", border: `1px solid ${G}22`, borderRadius: 16, padding: "20px", display: "flex", gap: 14, marginTop: 16 }}>
            <Av size={28} fs={13} />
            <p style={{ fontSize: 15, color: "#c8c0b5", lineHeight: 1.7, fontStyle: "italic", fontFamily: "'DM Serif Display',serif" }}>{stTxt}</p>
          </div>
          <button onClick={shareStreak} style={{ ...S.shareBtn, marginTop: 16 }}>
            Share my streak 
          </button>
        </>}
        {last && <p style={{ marginTop: 16, textAlign: "center", fontSize: 14, color: G, fontStyle: "italic", fontFamily: "'DM Serif Display',serif" }}>{last.l} reached</p>}
      </div>
    </Page>
  );

  // -- PRIVACY POLICY -----------------------------------------------
  if (screen === "privacy") return (
    <Page title="Mara -- Privacy Policy">
      <div style={S.wrap}>
        <button onClick={() => setScreen("home")} style={S.back}>back</button>
        <h2 style={S.title}>Privacy Policy</h2>
        <p style={{ fontSize: 12, color: "#5a5248", marginBottom: 20 }}>Last updated: April 2026</p>
        {[
          { h: "Your data stays on your device", b: "Mara stores all personal information -- your sobriety date, journal entries, check-ins, and goals -- locally on your device using your browser's storage. We do not have access to this data. We do not store it on any server." },
          { h: "AI conversations", b: "When you chat with Mara, your messages are sent to Anthropic's API to generate responses. Anthropic's privacy policy applies to this processing. We do not store your conversation history on our servers." },
          { h: "No account required", b: "Mara does not require you to create an account. We do not collect your name, email address, or any identifying information." },
          { h: "No tracking or advertising", b: "We do not use analytics, tracking pixels, or advertising networks. We do not sell your data to anyone." },
          { h: "Crisis resources", b: "Mara is a personal companion, not a treatment program. If you are in crisis, please call or text 988 (Suicide & Crisis Lifeline)." },
          { h: "Contact", b: "Questions? Email hello@mymara.app" },
        ].map(({ h, b }) => (
          <div key={h} style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: "#c8c0b5", fontWeight: 500, marginBottom: 6 }}>{h}</p>
            <p style={{ fontSize: 13, color: "#7a7066", lineHeight: 1.7 }}>{b}</p>
          </div>
        ))}
      </div>
    </Page>
  );

  // -- HOME ---------------------------------------------------------
  const prog = nxtM ? Math.min(100, Math.round((days / nxtM.d) * 100)) : 100;
  return (
    <Page title="Mara">
      <div style={S.homeWrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: G }}>Mara</span>
          <button onClick={reset} style={{ background: "none", border: "none", color: "#3a3530", fontSize: 12, cursor: "pointer" }}>reset</button>
        </div>

        {/* Hero */}
        <div style={S.hero}>
          <div style={S.bigNum}>{days}</div>
          <div style={S.bigLab}>DAYS YOU KEPT YOUR WORD</div>
          <div style={{ fontSize: 12, color: G, marginTop: 10, opacity: 0.7 }}>clean from {cleanFrom}</div>
          {last && <div style={{ marginTop: 12, fontSize: 14, color: G, fontStyle: "italic", fontFamily: "'DM Serif Display',serif" }}>{last.l}</div>}
          {nxtM && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, color: "#5a5248", marginBottom: 8 }}>{nxtM.d - days}d to {nxtM.l}</div>
              <div style={{ height: 2, background: "#1e1e1e", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", background: G, width: `${prog}%`, borderRadius: 2, transition: "width 0.8s" }} />
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[{ n: done.length, l: "milestones", fn: () => setScreen("milestones") }, { n: checkIns, l: "check-ins" }, { n: cravings, l: "cravings" }].map(({ n, l, fn }) => (
            <div key={l} onClick={fn} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "18px 12px", textAlign: "center", cursor: fn ? "pointer" : "default" }}>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: "#e8e0d5" }}>{n}</div>
              <div style={{ fontSize: 11, color: "#5a5248", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Check in */}
        <button onClick={() => setScreen("chat")} style={S.checkBtn}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Av size={28} fs={13} />
            <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: G }}>Check in with Mara</span>
          </div>
          <span style={{ fontSize: 12, color: "#5a5248" }}>How are you right now?</span>
        </button>

        {/* Micro actions */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={S.secLab}>Do this right now</p>
            <button onClick={() => refreshActs()} disabled={actBusy} style={{ background: "none", border: "none", color: "#5a5248", fontSize: 12, cursor: "pointer" }}>
              {actBusy ? "..." : "refresh"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {acts.map((a, i) => <div key={i} style={S.actCard}>{a}</div>)}
          </div>
        </div>

        {/* Crisis button */}
        <button onClick={triggerCrisis} style={S.crisisBtn}>
          <span style={{ fontSize: 18 }}>!!</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>I'm about to use</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>Mara responds immediately -- no typing needed</div>
          </div>
        </button>

        {/* Nav */}
        <div style={S.nav}>
          {[
            { icon: "J", label: "Journal", fn: () => setScreen("journal") },
            { icon: "R", label: "Report", fn: () => setScreen("streak") },
            { icon: "M", label: "Milestones", fn: () => setScreen("milestones") },
            { icon: notifOn ? "ON" : "OFF", label: "Notify", fn: enableNotif, dim: notifOn },
          ].map(({ icon, label, fn, dim }) => (
            <button key={label} onClick={fn} disabled={dim} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: dim ? 0.4 : 1 }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span style={{ fontSize: 10, color: "#5a5248", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
            </button>
          ))}
        </div>

        <button onClick={() => setScreen("privacy")} style={{ background: "none", border: "none", color: "#2a2520", fontSize: 11, cursor: "pointer", textAlign: "center" }}>
          Privacy Policy
        </button>

        <p style={{ fontSize: 12, color: "#2a2520", textAlign: "center", fontStyle: "italic", fontFamily: "'DM Serif Display',serif" }}>
          You showed up today. That's enough.
        </p>
      </div>
    </Page>
  );
}

// -- COMPONENTS ----------------------------------------------------
function Page({ children, title }) {
  return (
    <>
      <Head>
        <title>{title || "Mara"}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="Mara -- your sobriety companion." />
        <meta name="theme-color" content="#0d0d0d" />
      </Head>
      <div style={{ minHeight: "100vh", background: "#0d0d0d", color: "#e8e0d5", fontFamily: "'DM Sans',sans-serif", display: "flex", justifyContent: "center" }}>
        {children}
      </div>
    </>
  );
}

const Av = ({ size, fs, crisis }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: crisis ? "#e0555522" : "#c9a96e22", border: `1px solid ${crisis ? "#e0555544" : "#c9a96e44"}`, color: crisis ? "#e05555" : "#c9a96e", fontFamily: "'DM Serif Display',serif", fontSize: fs, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>M</div>
);
const Btn = ({ children, onClick, dim, style = {} }) => (
  <button onClick={onClick} style={{ background: "#c9a96e", color: "#0d0d0d", border: "none", borderRadius: 10, padding: "14px", fontSize: 16, fontWeight: 500, cursor: "pointer", width: "100%", opacity: dim ? 0.4 : 1, ...style }}>{children}</button>
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
  brand:     { fontFamily: "'DM Serif Display',serif", fontSize: 32, color: "#e8e0d5" },
  tagline:   { fontSize: 14, color: "#7a7066", marginBottom: 8 },
  card:      { width: "100%", background: "#161616", border: "1px solid #232323", borderRadius: 18, padding: "28px 24px", display: "flex", flexDirection: "column", gap: 14 },
  q:         { fontFamily: "'DM Serif Display',serif", fontSize: 20, color: "#e8e0d5" },
  qs:        { fontSize: 13, color: "#5a5248", marginTop: -6 },
  din:       { background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px", color: "#e8e0d5", fontSize: 16, outline: "none", width: "100%" },
  ta:        { background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px", color: "#e8e0d5", fontSize: 16, outline: "none", width: "100%", lineHeight: 1.6 },
  optBtn:    { background: "#0d0d0d", border: "1px solid", borderRadius: 10, padding: "14px 16px", fontSize: 14, cursor: "pointer", textAlign: "left", transition: "border-color 0.2s, color 0.2s" },
  wrap:      { width: "100%", maxWidth: 480, padding: "28px 20px 80px" },
  back:      { background: "none", border: "none", color: "#5a5248", fontSize: 13, cursor: "pointer", marginBottom: 20, display: "block", padding: 0 },
  title:     { fontFamily: "'DM Serif Display',serif", fontSize: 26, color: "#e8e0d5", marginBottom: 6 },
  secLab:    { fontSize: 11, color: "#3a3530", textTransform: "uppercase", letterSpacing: "0.12em" },
  jCard:     { background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: "16px 18px" },
  homeWrap:  { width: "100%", maxWidth: 480, padding: "28px 20px 100px", display: "flex", flexDirection: "column", gap: 16 },
  hero:      { background: "#111", border: "1px solid #1e1e1e", borderRadius: 20, padding: "36px 28px 28px", textAlign: "center" },
  bigNum:    { fontFamily: "'DM Serif Display',serif", fontSize: 84, lineHeight: 1, color: "#e8e0d5", letterSpacing: "-4px" },
  bigLab:    { fontSize: 11, color: "#5a5248", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.15em" },
  checkBtn:  { width: "100%", background: "#161616", border: `1px solid #c9a96e33`, borderRadius: 16, padding: "18px 20px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 },
  actCard:   { background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: "14px", fontSize: 13, color: "#7a7066", lineHeight: 1.4 },
  crisisBtn: { width: "100%", background: "#1a0a0a", border: "1px solid #e0555533", borderRadius: 16, padding: "18px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, color: "#e05555" },
  shareBtn:  { width: "100%", background: "#161616", border: `1px solid #c9a96e33`, borderRadius: 12, padding: "14px", fontSize: 14, color: G, cursor: "pointer" },
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
  sendBtn:   { border: "none", borderRadius: 12, width: 48, minWidth: 48, color: "#0d0d0d", fontSize: 20, cursor: "pointer" },
};
