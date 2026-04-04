"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Team = "A" | "B";
type GameState = "idle" | "pregame" | "pregame_paused" | "running" | "paused" | "ended";

const PREGAME_SECONDS = 90;
const DEFAULT_A = "Boys Team";
const DEFAULT_B = "Girls Team";

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

function IconCheck() {
  return (
    <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.6 3.6 0 0112 15.6z" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
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
  const [log, setLog] = useState("Ready. Tap Start.");
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const lastTickRef = useRef<number | null>(null);
  const pregameEndAnnouncedRef = useRef(false);
  const pregameMarksAnnouncedRef = useRef<Set<number>>(new Set());
  const turnMarksAnnouncedRef = useRef<Set<number>>(new Set());
  /** After each reset, alternate who leads the next round (default Boys = A, first reset → Girls = B, …). */
  const nextStarterAfterResetRef = useRef<Team>("B");

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

  /** Active / starting team always first (left); other team second (right). */
  const teamDisplayOrder = useMemo((): Team[] => {
    return currentTeam === "A" ? ["A", "B"] : ["B", "A"];
  }, [currentTeam]);

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

  const onTimeUp = useCallback(
    (timedOut: Team) => {
      turnMarksAnnouncedRef.current = new Set();
      const total = Math.max(1, minutes * 60 + seconds);
      setTimeA(total);
      setTimeB(total);
      const nextTeam: Team = timedOut === "A" ? "B" : "A";
      setCurrentTeam(nextTeam);
      setState("running");
      lastTickRef.current = performance.now();
      pushLog(`Time's up for ${teamName(timedOut)}! It's ${teamName(nextTeam)}'s turn now.`, true);
    },
    [pushLog, teamName, minutes, seconds]
  );

  const updateRunningTime = useCallback(() => {
    if (state !== "running" || lastTickRef.current == null) return;

    const now = performance.now();
    const elapsed = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;

    if (currentTeam === "A") {
      setTimeA((prev) => {
        const next = Math.max(0, prev - elapsed);
        if (next === 0) setTimeout(() => onTimeUp("A"), 0);
        return next;
      });
    } else {
      setTimeB((prev) => {
        const next = Math.max(0, prev - elapsed);
        if (next === 0) setTimeout(() => onTimeUp("B"), 0);
        return next;
      });
    }
  }, [state, currentTeam, onTimeUp]);

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
    setState("running");
    lastTickRef.current = performance.now();
    pushLog(`Thinking time is over! It's ${teamName(currentTeam)}'s turn. Clock is running.`, true);
  }, [state, pregameRemaining, pushLog, teamName, currentTeam]);

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
      pushLog(`Pre-game started. ${teamName(currentTeam)} plays first.`, true);
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
      setState("running");
      pushLog(`Pre-game finished. It's ${teamName(currentTeam)}'s turn! ${formatTime(total)} on the clock.`, true);
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
    const starter = nextStarterAfterResetRef.current;
    nextStarterAfterResetRef.current = starter === "A" ? "B" : "A";
    setCurrentTeam(starter);
    setState("idle");
    lastTickRef.current = null;
  }, [minutes, seconds, pushLog, teamName]);

  const newGame = useCallback(() => {
    setScoreA(0);
    setScoreB(0);
    resetGame();
  }, [resetGame]);

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
          <div className="card-body">
            <header className="header">
              <div className="header-top">
                <div className="header-bar">
                  <div className="header-bar-start">
                    <button type="button" className="btn-header btn-header-new" onClick={newGame} aria-label="New game">
                      New Game
                    </button>
                  </div>
                  <h1 className="title header-title-center">Code-Name timer</h1>
                  <div className="header-bar-end">
                    <button
                      type="button"
                      className="btn-settings"
                      onClick={() => setShowSettings(true)}
                      aria-label="Settings"
                    >
                      <IconSettings />
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings desktop-only">
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
                <button type="button" className="btn-apply" onClick={applyTime} aria-label="Apply">
                  <IconCheck />
                  <span className="btn-word">Apply</span>
                </button>
              </div>
            </header>

            {showSettings && (
              <div className="modal-overlay" onClick={() => setShowSettings(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h2 className="modal-title">Timer Settings</h2>
                    <button type="button" className="btn-modal-close" onClick={() => setShowSettings(false)} aria-label="Close">
                      <IconClose />
                    </button>
                  </div>
                  <div className="settings modal-settings">
                    <div className="setting">
                      <label htmlFor="min-modal">Minutes</label>
                      <input
                        id="min-modal"
                        type="number"
                        min={0}
                        max={99}
                        inputMode="numeric"
                        value={minutes}
                        onChange={(e) => setMinutes(Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="setting">
                      <label htmlFor="sec-modal">Seconds</label>
                      <input
                        id="sec-modal"
                        type="number"
                        min={0}
                        max={59}
                        inputMode="numeric"
                        value={seconds}
                        onChange={(e) => setSeconds(Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
                      />
                    </div>
                    <button type="button" className="btn-apply" onClick={() => { applyTime(); setShowSettings(false); }} aria-label="Apply">
                      <IconCheck />
                      <span className="btn-word">Apply</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(state === "pregame" || state === "pregame_paused") && (
              <div className="pregame-banner pregame-banner-full" aria-live="polite">
                <div className="pregame-label">Pre-game thinking</div>
                <div className="pregame-clock">{formatTime(pregameRemaining)}</div>
                <div className="pregame-sub">{teamName(currentTeam)} plays first</div>
                <div className="pregame-hint">
                  {state === "pregame_paused"
                    ? "Paused — resume when ready. Tap Finish to start play."
                    : "Tap Finish to begin play, or wait for the countdown."}
                </div>
              </div>
            )}

            {state !== "pregame" && state !== "pregame_paused" && (
              <div
                className={`game-timer-hero ${
                  state === "idle"
                    ? "game-timer-hero--idle"
                    : currentTeam === "A"
                      ? "game-timer-hero--team-a"
                      : "game-timer-hero--team-b"
                }`}
                aria-live="polite"
              >
                {state === "idle" ? (
                  <p className="game-timer-eyebrow game-timer-eyebrow-idle">Time per turn</p>
                ) : (
                  <div className="game-timer-turn-block">
                    <p className="game-timer-kicker">Current turn</p>
                    <p className="game-timer-turn-name">{teamName(currentTeam)}</p>
                  </div>
                )}
                <div className="game-timer-clock">
                  {formatTime(currentTeam === "A" ? timeA : timeB)}
                </div>
                <p className="game-timer-status">
                  {state === "idle"
                    ? "Tap Start when ready"
                    : state === "running"
                      ? "Clock running"
                      : state === "paused"
                        ? "Paused"
                        : state === "ended"
                          ? "Ended"
                          : ""}
                </p>
              </div>
            )}

            <div className={`teams ${state === "pregame" || state === "pregame_paused" ? "hide-on-mobile" : ""}`}>
              {teamDisplayOrder.map((team) => {
                const isA = team === "A";
                const nameValue = isA ? teamAName : teamBName;
                const setName = isA ? setTeamAName : setTeamBName;
                const timeValue = isA ? timeA : timeB;
                const scoreValue = isA ? scoreA : scoreB;
                const bumpScore = isA ? () => setScoreA((p) => p + 1) : () => setScoreB((p) => p + 1);
                const lowerScore = isA ? () => setScoreA((p) => Math.max(0, p - 1)) : () => setScoreB((p) => Math.max(0, p - 1));
                const isCurrent = currentTeam === team;
                return (
                  <section
                    key={team}
                    className={`team ${isA ? "team--a" : "team--b"} ${isCurrent ? "active" : ""}`}
                    aria-label={teamName(team)}
                  >
                    <div className="team-head">
                      <input
                        className="team-name-input"
                        value={nameValue}
                        onChange={(e) => setName(e.target.value)}
                        aria-label={`${teamName(team)} name`}
                        autoComplete="off"
                      />
                      <span className={`badge ${isCurrent ? "on" : "wait"}`}>
                        {isCurrent ? (state === "running" ? "Playing" : "Turn") : "Waiting"}
                      </span>
                    </div>

                    <div className="subtext">
                      {isCurrent && state === "running"
                        ? "On the clock"
                        : isCurrent && state === "paused"
                          ? "Paused"
                          : state === "ended"
                            ? "Ended"
                            : "Waiting"}
                    </div>
                    <div className="team-score" aria-label={`${teamName(team)} points`}>
                      <span className="team-score-value">{scoreValue}</span>
                      <div className="team-score-actions">
                        <button type="button" className="team-score-btn" onClick={lowerScore} aria-label={`${teamName(team)} minus one point`}>
                          −
                        </button>
                        <button type="button" className="team-score-btn team-score-btn-plus" onClick={bumpScore} aria-label={`${teamName(team)} plus one point`}>
                          +
                        </button>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
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
            </div>

            <div className="log">{log}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
