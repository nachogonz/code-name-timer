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

type VoiceAction =
  | "start"
  | "finish"
  | "stop"
  | "resume"
  | "reset"
  | "status"
  | "skip_pregame";

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
  if (/\b(status|times?|clock)\b/.test(t)) return "status";
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
    const nextTeam: Team = currentTeam === "A" ? "B" : "A";
    setCurrentTeam(nextTeam);
    setState("running");
    lastTickRef.current = performance.now();
    pushLog(`${teamName(nextTeam)} turn.`, true);
  }, [state, currentTeam, pushLog, updateRunningTime]);

  const resetGame = useCallback(
    (askConfirm: boolean) => {
      if (askConfirm && !window.confirm("Reset both clocks and pre-game?")) return;
      const total = Math.max(1, minutes * 60 + seconds);
      setTimeA(total);
      setTimeB(total);
      setPregameRemaining(PREGAME_SECONDS);
      pregameEndAnnouncedRef.current = false;
      setCurrentTeam("A");
      setState("idle");
      lastTickRef.current = null;
      pushLog("Timer reset.", true);
    },
    [minutes, seconds, pushLog]
  );

  const statusReport = useCallback(() => {
    const pre =
      state === "pregame" || state === "pregame_paused" ? ` Pre-game ${formatTime(pregameRemaining)}.` : "";
    pushLog(
      `${teamName("A")}: ${formatTime(timeA)}. ${teamName("B")}: ${formatTime(timeB)}.${pre} ${teamName(currentTeam)} is up. ${phaseLabel}.`,
      true
    );
  }, [state, pregameRemaining, timeA, timeB, currentTeam, phaseLabel, pushLog, teamName]);

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
    const windowMs = action === "status" ? 1200 : 450;
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
          resetGame(false);
          break;
        case "status":
          statusReport();
          break;
        case "skip_pregame":
          skipPregame();
          break;
        default:
          break;
      }
    },
    [state, shouldThrottleVoice, startGame, resumeGame, finishTurn, stopGame, resetGame, statusReport, skipPregame]
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
        pushLog("Voice on. Say stop, reset, restart, resume, switch, status, or skip.");
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

  const primaryLabel =
    state === "idle"
      ? "Start"
      : state === "pregame"
        ? "Pause"
        : state === "pregame_paused" || state === "paused"
          ? "Resume"
          : state === "running"
            ? "Pause"
            : "Start";

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
            <p className="subtitle">
              Voice or tap: start, resume, switch, stop, reset, restart, status. Pre-game: 90s thinking, then play.
            </p>
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
              <button type="button" className="btn-apply" onClick={applyTime}>
                Apply time
              </button>
            </div>

            <div className="button-grid">
              <button
                type="button"
                className="btn primary"
                onClick={onPrimary}
                disabled={state === "ended"}
              >
                {primaryLabel}
              </button>
              <button type="button" className="btn good" onClick={finishTurn}>
                Switch turn
              </button>
              <button type="button" className="btn warn" onClick={stopGame}>
                Stop
              </button>
              <button type="button" className="btn neutral" onClick={resumeGame}>
                Resume
              </button>
              <button type="button" className="btn bad" onClick={() => resetGame(true)}>
                Reset
              </button>
              <button type="button" className="btn neutral" onClick={statusReport}>
                Status
              </button>
              {showSkipPregame ? (
                <button type="button" className="btn neutral btn-span-2" onClick={skipPregame}>
                  Skip pre-game
                </button>
              ) : null}
              <button
                type="button"
                className={`btn neutral btn-span-2 ${voiceOn ? "voice-on" : "voice-off"}`}
                onClick={toggleVoice}
                aria-pressed={voiceOn}
              >
                <span aria-hidden>{voiceOn ? "●" : "○"}</span> Voice {voiceOn ? "on" : "off"}
              </button>
            </div>

            <div className="log">{log}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
