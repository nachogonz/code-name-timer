"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Team = "A" | "B";
type GameState = "idle" | "running" | "paused" | "ended";

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognition;
    SpeechRecognition?: new () => SpeechRecognition;
  }

  interface SpeechRecognition extends EventTarget {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onend: (() => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    start(): void;
    stop(): void;
  }

  interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionResultList {
    length: number;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionResult {
    length: number;
    [index: number]: SpeechRecognitionAlternative;
  }

  interface SpeechRecognitionAlternative {
    transcript: string;
  }

  interface SpeechRecognitionErrorEvent {
    error: string;
  }
}

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function Page() {
  const [initialSeconds, setInitialSeconds] = useState(90);
  const [minutes, setMinutes] = useState(1);
  const [seconds, setSeconds] = useState(30);
  const [timeA, setTimeA] = useState(90);
  const [timeB, setTimeB] = useState(90);
  const [teamAName, setTeamAName] = useState("Team A");
  const [teamBName, setTeamBName] = useState("Team B");
  const [currentTeam, setCurrentTeam] = useState<Team>("A");
  const [state, setState] = useState<GameState>("idle");
  const [log, setLog] = useState("Ready. Tap Start or turn on voice control.");
  const [voiceOn, setVoiceOn] = useState(false);

  const lastTickRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const listeningRef = useRef(false);

  const teamName = (team: Team) => (team === "A" ? teamAName.trim() || "Team A" : teamBName.trim() || "Team B");

  const statusLabel = useMemo(() => `State: ${state} · Turn: ${teamName(currentTeam)}`, [state, currentTeam, teamAName, teamBName]);

  const speak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  const pushLog = (message: string, say = false) => {
    setLog(message);
    if (say) speak(message);
  };

  const endGame = (timedOut: Team) => {
    setState("ended");
    lastTickRef.current = null;
    const loser = teamName(timedOut);
    const winner = teamName(timedOut === "A" ? "B" : "A");
    pushLog(`${loser} is out of time. ${winner} wins on clock.`, true);
  };

  const updateRunningTime = () => {
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
  };

  useEffect(() => {
    const id = window.setInterval(updateRunningTime, 100);
    return () => window.clearInterval(id);
  }, [state, currentTeam]);

  const startGame = () => {
    if (state === "ended") return;
    setCurrentTeam((prev) => (state === "idle" ? "A" : prev));
    setState("running");
    lastTickRef.current = performance.now();
    pushLog(`${teamName(state === "idle" ? "A" : currentTeam)} started.`, true);
  };

  const stopGame = () => {
    if (state !== "running") return;
    updateRunningTime();
    setState("paused");
    lastTickRef.current = null;
    pushLog(`Paused on ${teamName(currentTeam)}.`, true);
  };

  const resumeGame = () => {
    if (state !== "paused") return;
    setState("running");
    lastTickRef.current = performance.now();
    pushLog(`${teamName(currentTeam)} resumed.`, true);
  };

  const finishTurn = () => {
    if (state === "ended") return;
    if (state === "running") updateRunningTime();
    const nextTeam: Team = currentTeam === "A" ? "B" : "A";
    setCurrentTeam(nextTeam);
    setState("running");
    lastTickRef.current = performance.now();
    pushLog(`${teamName(nextTeam)} turn.`, true);
  };

  const resetGame = (ask = true) => {
    if (ask && !window.confirm("Reset both team clocks?")) return;
    const total = Math.max(1, minutes * 60 + seconds);
    setInitialSeconds(total);
    setTimeA(total);
    setTimeB(total);
    setCurrentTeam("A");
    setState("idle");
    lastTickRef.current = null;
    pushLog("Timer reset.", true);
  };

  const statusReport = () => {
    pushLog(
      `${teamName("A")}: ${formatTime(timeA)}. ${teamName("B")}: ${formatTime(timeB)}. ${teamName(currentTeam)} to play. State ${state}.`,
      true
    );
  };

  const applyTime = () => {
    const total = Math.max(1, minutes * 60 + seconds);
    setInitialSeconds(total);
    setTimeA(total);
    setTimeB(total);
    setCurrentTeam("A");
    setState("idle");
    lastTickRef.current = null;
    pushLog(`New time applied: ${formatTime(total)} per team.`);
  };

  const handleCommand = (raw: string) => {
    const cmd = raw.toLowerCase().trim();
    if (cmd.includes("start")) return startGame();
    if (cmd.includes("finish") || cmd.includes("switch") || cmd.includes("next")) return finishTurn();
    if (cmd.includes("stop") || cmd.includes("pause")) return stopGame();
    if (cmd.includes("resume") || cmd.includes("continue")) return resumeGame();
    if (cmd.includes("reset")) return resetGame(true);
    if (cmd.includes("status") || cmd.includes("time")) return statusReport();
    pushLog(`Heard: "${raw}" — no matching command.`);
  };

  const setupVoice = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      pushLog("Voice recognition is not supported in this browser. Buttons still work.");
      return null;
    }
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = last?.[0]?.transcript;
      if (transcript) handleCommand(transcript);
    };

    recognition.onerror = (event) => {
      pushLog(`Voice error: ${event.error}. Buttons still work.`);
    };

    recognition.onend = () => {
      if (listeningRef.current) {
        try {
          recognition.start();
        } catch {}
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  };

  const toggleVoice = async () => {
    if (!recognitionRef.current) setupVoice();
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (!voiceOn) {
      try {
        await navigator.mediaDevices?.getUserMedia?.({ audio: true });
      } catch {
        pushLog("Microphone permission denied. Buttons still work.");
        return;
      }
    }

    const next = !voiceOn;
    setVoiceOn(next);
    listeningRef.current = next;

    if (next) {
      try {
        recognition.start();
        pushLog("Voice control on. Say start, finish, stop, resume, reset, or status.");
      } catch {
        setVoiceOn(false);
        listeningRef.current = false;
        pushLog("Could not start voice control. Try again.");
      }
    } else {
      recognition.stop();
      pushLog("Voice control off.");
    }
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      listeningRef.current = false;
    };
  }, []);

  return (
    <main className="page">
      <div className="app">
        <div className="topbar">
          <div>
            <h1>Skip-Bo Voice Timer</h1>
            <p>Say or tap: start, finish, stop, resume, reset, status</p>
          </div>
          <div className="chip">{statusLabel}</div>
        </div>

        <div className="teams">
          <section className={`team ${currentTeam === "A" ? "active" : ""}`}>
            <div className="teamRow">
              <input value={teamAName} onChange={(e) => setTeamAName(e.target.value)} />
              <span className="badge">
                {currentTeam === "A" ? (state === "running" ? "Active turn" : "Current turn") : "Waiting"}
              </span>
            </div>
            <div className="clock">{formatTime(timeA)}</div>
            <div className="subtext">
              {state === "ended" && timeA === 0 ? "Time up" : currentTeam === "A" && state === "running" ? "Clock running" : currentTeam === "A" && state === "paused" ? "Paused" : "Ready"}
            </div>
          </section>

          <section className={`team ${currentTeam === "B" ? "active" : ""}`}>
            <div className="teamRow">
              <input value={teamBName} onChange={(e) => setTeamBName(e.target.value)} />
              <span className="badge">
                {currentTeam === "B" ? (state === "running" ? "Active turn" : "Current turn") : "Waiting"}
              </span>
            </div>
            <div className="clock">{formatTime(timeB)}</div>
            <div className="subtext">
              {state === "ended" && timeB === 0 ? "Time up" : currentTeam === "B" && state === "running" ? "Clock running" : currentTeam === "B" && state === "paused" ? "Paused" : "Ready"}
            </div>
          </section>
        </div>

        <div className="controls">
          <div className="settings">
            <div className="setting">
              <label>Minutes</label>
              <input type="number" min={0} max={99} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 0)} />
            </div>
            <div className="setting">
              <label>Seconds</label>
              <input type="number" min={0} max={59} value={seconds} onChange={(e) => setSeconds(Math.min(59, Math.max(0, Number(e.target.value) || 0)))} />
            </div>
            <button className="neutral" onClick={applyTime}>Apply Time</button>
          </div>

          <div className="buttonRow">
            <button className="primary" onClick={startGame}>Start</button>
            <button className="good" onClick={finishTurn}>Finish / Switch</button>
            <button className="warn" onClick={stopGame}>Stop</button>
            <button className="neutral" onClick={resumeGame}>Resume</button>
            <button className="bad" onClick={() => resetGame(true)}>Reset</button>
            <button className="neutral" onClick={statusReport}>Status</button>
            <button className="neutral" onClick={toggleVoice}>🎤 Voice: {voiceOn ? "On" : "Off"}</button>
          </div>

          <div className="log">{log}</div>
        </div>
      </div>
    </main>
  );
}
