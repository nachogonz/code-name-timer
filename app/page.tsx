"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Team = "A" | "B";
type GameState = "idle" | "pregame" | "pregame_paused" | "running" | "paused" | "ended";

const PREGAME_SECONDS = 90;
const DEFAULT_A = "Boys Team";
const DEFAULT_B = "Girls Team";

type WebSpeechResultEvent = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type WebSpeechErrorEvent = Event & {
  error: string;
};

type WebSpeechRecognition = EventTarget & {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives?: number;
  onresult: ((event: WebSpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: WebSpeechErrorEvent) => void) | null;
  start(): void;
  stop(): void;
};

function getSpeechRecognitionConstructor(): (new () => WebSpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => WebSpeechRecognition;
    webkitSpeechRecognition?: new () => WebSpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function IconPlay() {
  return (
    <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}

/** Finish turn (swap) */
function IconFinishTurn() {
  return (
    <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM18 9l-3.99-4v3H10v2h4.01v3L21 9h-3z" />
    </svg>
  );
}

function IconSkipForward() {
  return (
    <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 18l8.5-6L6 6v12zm8-12v12h2V6h-2z" />
    </svg>
  );
}

function IconMic({ muted }: { muted?: boolean }) {
  if (muted) {
    return (
      <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0 .06.02.11.02.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l8.97 8.97L13 16h-2v2h2v2.18l4.01 4.01L22 22.27 4.27 3zM12 19c-3.87 0-7-3.13-7-7v-.18l2 2V12c0 2.76 2.24 5 5 5 .34 0 .67-.03 1-.09l1.56 1.56c-.62.35-1.3.58-2.05.65v2.05c1.45-.02 2.82-.45 4-1.19l1.42 1.42A9.96 9.96 0 0112 23v-2zm5.9-2.09l-1.42-1.41c.36-.76.52-1.61.52-2.5H19c0 1.28-.34 2.5-.95 3.59l1.85 1.85A8.91 8.91 0 0021 12h-2c0 .65-.08 1.29-.23 1.91l2.12 2.12c.92-1.35 1.48-2.97 1.58-4.73h-2.02c-.1 1.1-.45 2.13-.98 3.03z" />
      </svg>
    );
  }
  return (
    <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.18 15.06 14.37 16.5 12 16.5s-4.18-1.44-4.93-3.65c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.76 3.26 3.47 5.51 6.91 5.86V21h2v-2.08c3.44-.35 6.15-2.6 6.91-5.86.1-.6-.39-1.14-1-1.14z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

type VoiceAction = "start" | "finish" | "stop" | "resume" | "reset" | "skip_pregame";

function parseVoiceTranscript(text: string, opts: { interimOnlyUrgent: boolean }): VoiceAction | null {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;

  if (opts.interimOnlyUrgent) {
    if (/\b(restart|start over|begin again|reset|clear)\b/.test(t)) return "reset";
    if (/\b(stop|pause|hold)\b/.test(t)) return "stop";
    return null;
  }

  if (/\b(restart|start over|begin again)\b/.test(t)) return "reset";
  if (/\b(reset|clear)\b/.test(t)) return "reset";
  if (/\b(stop|pause|hold)\b/.test(t)) return "stop";
  if (/\b(resume|continue)\b/.test(t)) return "resume";
  if (/\b(finish|switch|next|done)\b/.test(t)) return "finish";
  if (/\bskip\b/.test(t)) return "skip_pregame";
  if (/\b(start|begin)\b/.test(t)) return "start";

  return null;
}

export default function Page() {
  const [minutes, setMinutes] = useState(1);
  const [seconds, setSeconds] = useState(30);
  const [timeA, setTimeA] = useState(90);
  const [timeB, setTimeB] = useState(90);
  const [teamAName, setTeamAName] = useState(DEFAULT_A);
  const [teamBName, setTeamBName] = useState(DEFAULT_B);
  const [currentTeam, setCurrentTeam] = useState<Team>("A");
  const [state, setState] = useState<GameState>("idle");
  const [pregameRemaining, setPregameRemaining] = useState(PREGAME_SECONDS);
  const [log, setLog] = useState("Ready. Tap Start or turn on voice.");
  const [voiceOn, setVoiceOn] = useState(false);

  const lastTickRef = useRef<number | null>(null);
  const recognitionRef = useRef<WebSpeechRecognition | null>(null);
  const listeningRef = useRef(false);
  const lastVoiceFireRef = useRef<{ action: VoiceAction; at: number } | null>(null);
  const processVoiceRef = useRef<(transcript: string, isFinal: boolean) => void>(() => {});
  const pregameEndAnnouncedRef = useRef(false);

  const teamName = useCallback(
    (team: Team) => (team === "A" ? teamAName.trim() || DEFAULT_A : teamBName.trim() || DEFAULT_B),
    [teamAName, teamBName]
  );

  const phaseLabel = useMemo(() => {
    switch (state) {
      case "idle":
        return "Idle";
      case "pregame":
      case "pregame_paused":
        return "Pre-game";
      case "running":
        return "Live";
      case "paused":
        return "Paused";
      case "ended":
        return "Ended";
      default:
        return state;
    }
  }, [state]);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }, []);

  const pushLog = useCallback(
    (message: string, say = false) => {
      setLog(message);
      if (say) speak(message);
    },
    [speak]
  );

  const endGame = useCallback(
    (timedOut: Team) => {
      setState("ended");
      lastTickRef.current = null;
      const loser = teamName(timedOut);
      const winner = teamName(timedOut === "A" ? "B" : "A");
      pushLog(`${loser} is out of time. ${winner} wins.`, true);
    },
    [pushLog, teamName]
  );

  const updateRunningTime = useCallback(() => {
    if (state !== "running" || lastTickRef.current == null) return;

    const now = performance.now();
    const elapsed = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;

    if (currentTeam === "A") {
      setTimeA((prev) => {
        const next = Math.max(0, prev - elapsed);
        if (next === 0) setTimeout(() => endGame("A"), 0);
        return next;
      });
    } else {
      setTimeB((prev) => {
        const next = Math.max(0, prev - elapsed);
        if (next === 0) setTimeout(() => endGame("B"), 0);
        return next;
      });
    }
  }, [state, currentTeam, endGame]);

  const updatePregameTime = useCallback(() => {
    if (state !== "pregame" || lastTickRef.current == null) return;

    const now = performance.now();
    const elapsed = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;

    setPregameRemaining((prev) => Math.max(0, prev - elapsed));
  }, [state]);

  useEffect(() => {
    const id = window.setInterval(() => {
      updateRunningTime();
      updatePregameTime();
    }, 100);
    return () => window.clearInterval(id);
  }, [updateRunningTime, updatePregameTime]);

  useEffect(() => {
    if (state !== "pregame" || pregameRemaining > 0) return;
    if (pregameEndAnnouncedRef.current) return;
    pregameEndAnnouncedRef.current = true;
    setCurrentTeam("A");
    setState("running");
    lastTickRef.current = performance.now();
    pushLog(`Thinking time over. ${teamName("A")} to play.`, true);
  }, [state, pregameRemaining, pushLog, teamName]);

  const startGame = useCallback(() => {
    if (state === "ended") return;
    if (state === "idle") {
      pregameEndAnnouncedRef.current = false;
      setPregameRemaining(PREGAME_SECONDS);
      setState("pregame");
      lastTickRef.current = performance.now();
      pushLog(`90 seconds thinking time. Then ${teamName("A")} starts.`, true);
      return;
    }
    if (state === "pregame_paused") {
      setState("pregame");
      lastTickRef.current = performance.now();
      pushLog("Pre-game resumed.", false);
      return;
    }
    if (state === "paused") {
      setState("running");
      lastTickRef.current = performance.now();
      pushLog(`${teamName(currentTeam)} resumed.`, true);
    }
  }, [state, currentTeam, pushLog, teamName]);

  const stopGame = useCallback(() => {
    if (state === "running") {
      updateRunningTime();
      setState("paused");
      lastTickRef.current = null;
      pushLog(`Paused on ${teamName(currentTeam)}.`, true);
      return;
    }
    if (state === "pregame") {
      updatePregameTime();
      setState("pregame_paused");
      lastTickRef.current = null;
      pushLog("Pre-game paused.", false);
    }
  }, [state, currentTeam, pushLog, updateRunningTime, updatePregameTime]);

  const resumeGame = useCallback(() => {
    if (state === "paused") {
      setState("running");
      lastTickRef.current = performance.now();
      pushLog(`${teamName(currentTeam)} resumed.`, true);
      return;
    }
    if (state === "pregame_paused") {
      setState("pregame");
      lastTickRef.current = performance.now();
      pushLog("Pre-game resumed.", false);
    }
  }, [state, currentTeam, pushLog]);

  const skipPregame = useCallback(() => {
    if (state !== "pregame" && state !== "pregame_paused") return;
    lastTickRef.current = performance.now();
    setCurrentTeam("A");
    setState("running");
    pushLog(`${teamName("A")} to play.`, true);
  }, [state, pushLog, teamName]);

  const finishTurn = useCallback(() => {
    if (state === "ended" || state === "idle" || state === "pregame" || state === "pregame_paused") return;
    if (state === "running") updateRunningTime();
    const total = Math.max(1, minutes * 60 + seconds);
    setTimeA(total);
    setTimeB(total);
    const nextTeam: Team = currentTeam === "A" ? "B" : "A";
    setCurrentTeam(nextTeam);
    setState("running");
    lastTickRef.current = performance.now();
    pushLog(`${teamName(nextTeam)} turn. Clocks reset.`, true);
  }, [state, currentTeam, minutes, seconds, pushLog, updateRunningTime, teamName]);

  const resetGame = useCallback(() => {
    const total = Math.max(1, minutes * 60 + seconds);
    setTimeA(total);
    setTimeB(total);
    setPregameRemaining(PREGAME_SECONDS);
    pregameEndAnnouncedRef.current = false;
    setCurrentTeam("A");
    setState("idle");
    lastTickRef.current = null;
    pushLog("Timer reset.", true);
  }, [minutes, seconds, pushLog]);

  const applyTime = useCallback(() => {
    const total = Math.max(1, minutes * 60 + seconds);
    setTimeA(total);
    setTimeB(total);
    setPregameRemaining(PREGAME_SECONDS);
    pregameEndAnnouncedRef.current = false;
    setCurrentTeam("A");
    setState("idle");
    lastTickRef.current = null;
    pushLog(`Time set to ${formatTime(total)} each.`);
  }, [minutes, seconds, pushLog]);

  const shouldThrottleVoice = useCallback((action: VoiceAction) => {
    const now = Date.now();
    const last = lastVoiceFireRef.current;
    const windowMs = action === "finish" ? 600 : 450;
    if (last && last.action === action && now - last.at < windowMs) return true;
    lastVoiceFireRef.current = { action, at: now };
    return false;
  }, []);

  const dispatchVoiceAction = useCallback(
    (action: VoiceAction) => {
      if (shouldThrottleVoice(action)) return;
      switch (action) {
        case "start":
          if (state === "idle") startGame();
          else if (state === "pregame_paused" || state === "paused") resumeGame();
          break;
        case "finish":
          finishTurn();
          break;
        case "stop":
          stopGame();
          break;
        case "resume":
          resumeGame();
          break;
        case "reset":
          resetGame();
          break;
        case "skip_pregame":
          skipPregame();
          break;
        default:
          break;
      }
    },
    [state, shouldThrottleVoice, startGame, resumeGame, finishTurn, stopGame, resetGame, skipPregame]
  );

  const processRecognitionResult = useCallback(
    (transcript: string, isFinal: boolean) => {
      const interimOnlyUrgent = !isFinal;
      const action = parseVoiceTranscript(transcript, { interimOnlyUrgent });
      if (!action) {
        if (isFinal && transcript.trim().length > 0)
          setLog(`Heard: "${transcript.trim()}" — no command matched.`);
        return;
      }
      if (interimOnlyUrgent) {
        const urgent: VoiceAction[] = ["stop", "reset"];
        if (!urgent.includes(action)) return;
      }
      dispatchVoiceAction(action);
    },
    [dispatchVoiceAction]
  );

  processVoiceRef.current = processRecognitionResult;

  const setupVoice = useCallback(() => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      pushLog("Voice recognition is not supported in this browser.");
      return null;
    }
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        processVoiceRef.current(transcript, result.isFinal);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setLog(`Voice: ${event.error}. Buttons still work.`);
    };

    recognition.onend = () => {
      if (listeningRef.current) {
        try {
          recognition.start();
        } catch {
          /* already started */
        }
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [pushLog]);

  const toggleVoice = useCallback(async () => {
    if (!recognitionRef.current) setupVoice();
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (!voiceOn) {
      try {
        await navigator.mediaDevices?.getUserMedia?.({ audio: true });
      } catch {
        pushLog("Microphone permission denied.");
        return;
      }
    }

    const next = !voiceOn;
    setVoiceOn(next);
    listeningRef.current = next;

    if (next) {
      try {
        recognition.start();
        pushLog("Voice on. Say stop, reset, resume, switch, finish, or skip.");
      } catch {
        setVoiceOn(false);
        listeningRef.current = false;
        pushLog("Could not start voice. Try again.");
      }
    } else {
      recognition.stop();
      pushLog("Voice off.");
    }
  }, [voiceOn, setupVoice, pushLog]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      listeningRef.current = false;
    };
  }, []);

  const primaryAriaLabel =
    state === "idle"
      ? "Start"
      : state === "pregame"
        ? "Pause"
        : state === "pregame_paused" || state === "paused"
          ? "Resume"
          : state === "running"
            ? "Pause"
            : "Start";

  const primaryIcon =
    state === "pregame" || state === "running" ? <IconPause /> : <IconPlay />;

  const showSkipPregame = state === "pregame" || state === "pregame_paused";

  const onPrimary = () => {
    if (state === "ended") return;
    if (state === "running" || state === "pregame") stopGame();
    else startGame();
  };

  return (
    <main className="page">
      <div className="app">
        <div className="card">
          <header className="header">
            <h1 className="title">Skip-Bo voice timer</h1>
            <div className="status-row" role="status" aria-live="polite">
              <span className="chip">
                <strong>{phaseLabel}</strong>
                <span aria-hidden> · </span>
                {teamName(currentTeam)}
              </span>
              {voiceOn ? (
                <span className="chip" style={{ borderColor: "rgba(52, 211, 153, 0.35)" }}>
                  <strong style={{ color: "#6ee7b7" }}>Listening</strong>
                </span>
              ) : null}
            </div>
          </header>

          {(state === "pregame" || state === "pregame_paused") && (
            <div className="pregame-banner" aria-live="polite">
              <div className="pregame-label">Pre-game thinking</div>
              <div className="pregame-clock">{formatTime(pregameRemaining)}</div>
              <div className="pregame-hint">
                {state === "pregame_paused" ? "Paused — resume when ready." : "Team clocks start after this."}
              </div>
            </div>
          )}

          <div className="teams">
            <section className={`team ${currentTeam === "A" ? "active" : ""}`} aria-label={teamName("A")}>
              <div className="team-head">
                <input
                  className="team-name-input"
                  value={teamAName}
                  onChange={(e) => setTeamAName(e.target.value)}
                  aria-label="First team name"
                  autoComplete="off"
                />
                <span className={`badge ${currentTeam === "A" ? "on" : "wait"}`}>
                  {currentTeam === "A" ? (state === "running" ? "Playing" : "Turn") : "Waiting"}
                </span>
              </div>
              <div className="clock">{formatTime(timeA)}</div>
              <div className="subtext">
                {state === "ended" && timeA === 0
                  ? "Time up"
                  : currentTeam === "A" && state === "running"
                    ? "Clock running"
                    : currentTeam === "A" && state === "paused"
                      ? "Paused"
                      : "Ready"}
              </div>
            </section>

            <section className={`team ${currentTeam === "B" ? "active" : ""}`} aria-label={teamName("B")}>
              <div className="team-head">
                <input
                  className="team-name-input"
                  value={teamBName}
                  onChange={(e) => setTeamBName(e.target.value)}
                  aria-label="Second team name"
                  autoComplete="off"
                />
                <span className={`badge ${currentTeam === "B" ? "on" : "wait"}`}>
                  {currentTeam === "B" ? (state === "running" ? "Playing" : "Turn") : "Waiting"}
                </span>
              </div>
              <div className="clock">{formatTime(timeB)}</div>
              <div className="subtext">
                {state === "ended" && timeB === 0
                  ? "Time up"
                  : currentTeam === "B" && state === "running"
                    ? "Clock running"
                    : currentTeam === "B" && state === "paused"
                      ? "Paused"
                      : "Ready"}
              </div>
            </section>
          </div>

          <div className="controls">
            <div className="settings">
              <div className="setting">
                <label htmlFor="min">Minutes</label>
                <input
                  id="min"
                  type="number"
                  min={0}
                  max={99}
                  inputMode="numeric"
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value) || 0)}
                />
              </div>
              <div className="setting">
                <label htmlFor="sec">Seconds</label>
                <input
                  id="sec"
                  type="number"
                  min={0}
                  max={59}
                  inputMode="numeric"
                  value={seconds}
                  onChange={(e) => setSeconds(Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
                />
              </div>
              <button type="button" className="btn-apply" onClick={applyTime} aria-label="Apply time">
                <IconCheck />
              </button>
            </div>

            <div className="button-grid">
              <button
                type="button"
                className="btn primary btn-icon-only"
                onClick={onPrimary}
                disabled={state === "ended"}
                aria-label={primaryAriaLabel}
              >
                {primaryIcon}
              </button>
              <button type="button" className="btn good btn-icon-only" onClick={finishTurn} aria-label="Finish turn">
                <IconFinishTurn />
              </button>
              <button type="button" className="btn warn btn-icon-only" onClick={stopGame} aria-label="Stop">
                <IconStop />
              </button>
              <button type="button" className="btn neutral btn-icon-only" onClick={resumeGame} aria-label="Resume">
                <IconPlay />
              </button>
              {showSkipPregame ? (
                <button
                  type="button"
                  className="btn neutral btn-span-2 btn-icon-only"
                  onClick={skipPregame}
                  aria-label="Skip pre-game"
                >
                  <IconSkipForward />
                </button>
              ) : null}
              <button
                type="button"
                className={`btn neutral btn-span-2 btn-icon-only ${voiceOn ? "voice-on" : "voice-off"}`}
                onClick={toggleVoice}
                aria-pressed={voiceOn}
                aria-label={voiceOn ? "Turn voice off" : "Turn voice on"}
              >
                <IconMic muted={!voiceOn} />
              </button>
            </div>

            <div className="log">{log}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
