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
  onstart: (() => void) | null;
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

/** Finish turn (swap) */
function IconFinishTurn() {
  return (
    <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM18 9l-3.99-4v3H10v2h4.01v3L21 9h-3z" />
    </svg>
  );
}

function IconReset() {
  return (
    <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
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

type VoiceAction = "start" | "finish" | "stop" | "resume" | "reset";

function parseVoiceTranscript(text: string): VoiceAction | null {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;

  // Longer phrases first (avoid matching "start" inside "restart")
  if (/\b(restart|start over|begin again)\b/.test(t)) return "reset";
  if (/\b(reset|clear)\b/.test(t)) return "reset";
  if (/\b(stop|pause|hold)\b/.test(t)) return "stop";
  if (/\b(resume|continue)\b/.test(t)) return "resume";
  if (/\b(finish|switch|next|done)\b/.test(t)) return "finish";
  if (/\b(start|begin|go)\b/.test(t)) return "start";

  const words = t.split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1];
  if (lastWord === "start" || lastWord === "begin") return "start";
  if (lastWord === "finish" || lastWord === "switch" || lastWord === "done") return "finish";

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
  const pregameMarksAnnouncedRef = useRef<Set<number>>(new Set());
  const turnMarksAnnouncedRef = useRef<Set<number>>(new Set());
  const handlersRef = useRef({
    startGame: () => {},
    stopGame: () => {},
    resumeGame: () => {},
    finishTurn: () => {},
    resetGame: () => {},
  });
  const voiceRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceBackoffUntilRef = useRef(0);
  const networkFailStreakRef = useRef(0);

  function clearVoiceRestartTimer() {
    if (voiceRestartTimerRef.current != null) {
      clearTimeout(voiceRestartTimerRef.current);
      voiceRestartTimerRef.current = null;
    }
  }

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

  const speak = useCallback((text: string, mode: "replace" | "queue" = "replace") => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (mode === "replace") window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }, []);

  const pushLog = useCallback(
    (message: string, say = false) => {
      setLog(message);
      if (say) speak(message, "replace");
    },
    [speak]
  );

  const endGame = useCallback(
    (timedOut: Team) => {
      turnMarksAnnouncedRef.current = new Set();
      setState("ended");
      lastTickRef.current = null;
      const loser = teamName(timedOut);
      const winner = teamName(timedOut === "A" ? "B" : "A");
      pushLog(`Time's up! ${loser} ran out of time. ${winner} wins!`, true);
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
    turnMarksAnnouncedRef.current = new Set();
    setCurrentTeam("A");
    setState("running");
    lastTickRef.current = performance.now();
    pushLog(`Thinking time is over! It's ${teamName("A")}'s turn. Clock is running.`, true);
  }, [state, pregameRemaining, pushLog, teamName]);

  useEffect(() => {
    if (state !== "pregame") return;
    const sec = Math.ceil(pregameRemaining);
    const marks = [60, 30, 10, 5];
    for (const mark of marks) {
      if (sec === mark && !pregameMarksAnnouncedRef.current.has(mark)) {
        pregameMarksAnnouncedRef.current.add(mark);
        speak(`Pre-game. ${mark} seconds remaining.`, "queue");
      }
    }
  }, [state, pregameRemaining, speak]);

  useEffect(() => {
    if (state !== "running") return;
    const t = currentTeam === "A" ? timeA : timeB;
    const sec = Math.ceil(t);
    const marks = [60, 30, 10, 5];
    for (const mark of marks) {
      if (sec === mark && !turnMarksAnnouncedRef.current.has(mark)) {
        turnMarksAnnouncedRef.current.add(mark);
        speak(`${teamName(currentTeam)}. ${mark} seconds left.`, "queue");
      }
    }
  }, [state, currentTeam, timeA, timeB, teamName, speak]);

  const startGame = useCallback(() => {
    if (state === "ended") return;
    if (state === "idle") {
      pregameEndAnnouncedRef.current = false;
      pregameMarksAnnouncedRef.current = new Set();
      setPregameRemaining(PREGAME_SECONDS);
      setState("pregame");
      lastTickRef.current = performance.now();
      pushLog(`Pre-game started. 90 seconds thinking time. ${teamName("A")} plays first.`, true);
      return;
    }
    if (state === "pregame_paused") {
      setState("pregame");
      lastTickRef.current = performance.now();
      pushLog("Pre-game resumed.", true);
      return;
    }
    if (state === "paused") {
      setState("running");
      lastTickRef.current = performance.now();
      pushLog(`${teamName(currentTeam)} resumed. Clock running.`, true);
    }
  }, [state, currentTeam, pushLog, teamName]);

  const stopGame = useCallback(() => {
    if (state === "running") {
      updateRunningTime();
      setState("paused");
      lastTickRef.current = null;
      pushLog(`Paused. ${teamName(currentTeam)}'s clock stopped.`, true);
      return;
    }
    if (state === "pregame") {
      updatePregameTime();
      setState("pregame_paused");
      lastTickRef.current = null;
      pushLog("Pre-game paused.", true);
    }
  }, [state, currentTeam, pushLog, updateRunningTime, updatePregameTime]);

  const resumeGame = useCallback(() => {
    if (state === "paused") {
      setState("running");
      lastTickRef.current = performance.now();
      pushLog(`Resumed. ${teamName(currentTeam)}'s clock running.`, true);
      return;
    }
    if (state === "pregame_paused") {
      setState("pregame");
      lastTickRef.current = performance.now();
      pushLog("Pre-game resumed.", true);
    }
  }, [state, currentTeam, pushLog]);

  const finishTurn = useCallback(() => {
    if (state === "ended" || state === "idle") return;

    if (state === "pregame" || state === "pregame_paused") {
      turnMarksAnnouncedRef.current = new Set();
      const total = Math.max(1, minutes * 60 + seconds);
      setTimeA(total);
      setTimeB(total);
      lastTickRef.current = performance.now();
      setCurrentTeam("A");
      setState("running");
      pushLog(`Pre-game finished. It's ${teamName("A")}'s turn! ${formatTime(total)} on the clock.`, true);
      return;
    }

    if (state === "running") updateRunningTime();
    turnMarksAnnouncedRef.current = new Set();
    const total = Math.max(1, minutes * 60 + seconds);
    setTimeA(total);
    setTimeB(total);
    const nextTeam: Team = currentTeam === "A" ? "B" : "A";
    setCurrentTeam(nextTeam);
    setState("running");
    lastTickRef.current = performance.now();
    pushLog(`Finish! It's ${teamName(nextTeam)}'s turn now. ${formatTime(total)} on the clock.`, true);
  }, [state, currentTeam, minutes, seconds, pushLog, updateRunningTime, teamName]);

  const resetGame = useCallback(() => {
    const total = Math.max(1, minutes * 60 + seconds);
    setTimeA(total);
    setTimeB(total);
    setPregameRemaining(PREGAME_SECONDS);
    pregameEndAnnouncedRef.current = false;
    pregameMarksAnnouncedRef.current = new Set();
    turnMarksAnnouncedRef.current = new Set();
    setCurrentTeam("A");
    setState("idle");
    lastTickRef.current = null;
    pushLog("Game reset. Tap Start for a new round.", true);
  }, [minutes, seconds, pushLog]);

  const applyTime = useCallback(() => {
    const total = Math.max(1, minutes * 60 + seconds);
    setTimeA(total);
    setTimeB(total);
    setPregameRemaining(PREGAME_SECONDS);
    pregameEndAnnouncedRef.current = false;
    pregameMarksAnnouncedRef.current = new Set();
    turnMarksAnnouncedRef.current = new Set();
    setCurrentTeam("A");
    setState("idle");
    lastTickRef.current = null;
    pushLog(`Time set to ${formatTime(total)} each.`);
  }, [minutes, seconds, pushLog]);

  const shouldThrottleVoice = useCallback((action: VoiceAction) => {
    const now = Date.now();
    const last = lastVoiceFireRef.current;
    const windowMs =
      action === "finish" ? 700 : action === "start" ? 550 : action === "reset" ? 500 : 450;
    if (last && last.action === action && now - last.at < windowMs) return true;
    lastVoiceFireRef.current = { action, at: now };
    return false;
  }, []);

  handlersRef.current = {
    startGame,
    stopGame,
    resumeGame,
    finishTurn,
    resetGame,
  };

  const dispatchVoiceAction = useCallback((action: VoiceAction) => {
    if (shouldThrottleVoice(action)) return;
    const h = handlersRef.current;
    switch (action) {
      case "start":
        h.startGame();
        break;
      case "finish":
        h.finishTurn();
        break;
      case "stop":
        h.stopGame();
        break;
      case "resume":
        h.resumeGame();
        break;
      case "reset":
        h.resetGame();
        break;
      default:
        break;
    }
  }, [shouldThrottleVoice]);

  const processRecognitionResult = useCallback(
    (transcript: string, isFinal: boolean) => {
      const action = parseVoiceTranscript(transcript);
      if (!action) {
        if (isFinal && transcript.trim().length > 0)
          setLog(`Heard: "${transcript.trim()}" — no command.`);
        return;
      }
      setLog(`Voice: "${transcript.trim()}" → ${action}`);
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

    const scheduleRestart = (recognition: WebSpeechRecognition) => {
      clearVoiceRestartTimer();
      if (!listeningRef.current) return;

      const now = Date.now();
      const backoffWait = Math.max(0, voiceBackoffUntilRef.current - now);
      const delay = Math.max(450, backoffWait);

      voiceRestartTimerRef.current = setTimeout(() => {
        voiceRestartTimerRef.current = null;
        if (!listeningRef.current || recognitionRef.current !== recognition) return;
        try {
          recognition.start();
        } catch {
          /* InvalidStateError: already started — next onend will reschedule */
        }
      }, delay);
    };

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      networkFailStreakRef.current = 0;
      voiceBackoffUntilRef.current = 0;
    };

    recognition.onresult = (event) => {
      networkFailStreakRef.current = 0;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (transcript.trim()) {
          processVoiceRef.current(transcript.trim(), result.isFinal);
        }
      }
    };

    recognition.onerror = (event) => {
      const err = event.error;
      if (err === "no-speech" || err === "aborted") return;

      if (err === "not-allowed" || err === "service-not-allowed") {
        clearVoiceRestartTimer();
        listeningRef.current = false;
        setVoiceOn(false);
        pushLog("Voice: microphone access denied.");
        return;
      }

      if (err === "audio-capture") {
        clearVoiceRestartTimer();
        listeningRef.current = false;
        setVoiceOn(false);
        pushLog("Voice: no microphone available.");
        return;
      }

      if (err === "network") {
        networkFailStreakRef.current += 1;
        const n = networkFailStreakRef.current;
        const backoffMs = Math.min(25_000, 1200 * 2 ** Math.min(n - 1, 4));
        voiceBackoffUntilRef.current = Date.now() + backoffMs;

        if (n >= 5) {
          clearVoiceRestartTimer();
          listeningRef.current = false;
          setVoiceOn(false);
          networkFailStreakRef.current = 0;
          voiceBackoffUntilRef.current = 0;
          pushLog("Voice: network unstable. Tap Voice again when online.");
          return;
        }

        setLog(`Voice: network. Next retry in ${Math.ceil(backoffMs / 1000)}s…`);
        return;
      }

      setLog(`Voice: ${err}.`);
    };

    recognition.onend = () => {
      if (!listeningRef.current) return;
      scheduleRestart(recognition);
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
      clearVoiceRestartTimer();
      networkFailStreakRef.current = 0;
      voiceBackoffUntilRef.current = 0;
      try {
        recognition.start();
        pushLog("Voice on. Say start, pause, finish, or reset.", true);
      } catch {
        setVoiceOn(false);
        listeningRef.current = false;
        pushLog("Could not start voice. Try again.");
      }
    } else {
      clearVoiceRestartTimer();
      listeningRef.current = false;
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
      pushLog("Voice off.");
    }
  }, [voiceOn, setupVoice, pushLog]);

  useEffect(() => {
    return () => {
      clearVoiceRestartTimer();
      recognitionRef.current?.stop();
      listeningRef.current = false;
    };
  }, []);

  const primaryWord =
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
                {state === "pregame_paused"
                  ? "Paused — resume when ready. Tap Finish to start play."
                  : "Tap Finish to begin play, or wait for the countdown."}
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
          

            <div className="button-grid">
              <button
                type="button"
                className="btn primary btn-labeled"
                onClick={onPrimary}
                disabled={state === "ended"}
                aria-label={primaryWord}
              >
                {primaryIcon}
                <span className="btn-word">{primaryWord}</span>
              </button>
              <button
                type="button"
                className="btn good btn-labeled"
                onClick={finishTurn}
                disabled={state === "idle" || state === "ended"}
                aria-label="Finish"
              >
                <IconFinishTurn />
                <span className="btn-word">Finish</span>
              </button>
              <button
                type="button"
                className="btn bad btn-labeled btn-span-2"
                onClick={resetGame}
                aria-label="Reset game"
              >
                <IconReset />
                <span className="btn-word">Reset</span>
              </button>
              <button
                type="button"
                className={`btn neutral btn-span-2 btn-labeled ${voiceOn ? "voice-on" : "voice-off"}`}
                onClick={toggleVoice}
                aria-pressed={voiceOn}
                aria-label={voiceOn ? "Voice off" : "Voice on"}
              >
                <IconMic muted={!voiceOn} />
                <span className="btn-word">Voice</span>
              </button>
            </div>

            <div className="log">{log}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
