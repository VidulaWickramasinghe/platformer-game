"use client";

import { useEffect, useRef } from "react";
import { auth, db, ensureAnonymousAuth } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export default function PlatformerGame() {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement | null;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const appId = "web-platformer-app";
    let currentUser: any = null;

    let userProfile = {
      username: "Player" + Math.floor(Math.random() * 9000 + 1000),
      totalScore: 0,
      levelsUnlocked: 1,
      settings: { particles: true, music: true, sfx: true },
    };

    async function callAI(prompt: string, systemInstruction?: string) {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, systemInstruction }),
      });

      const data = await res.json();
      return data?.text || "No response from AI.";
    }

    async function loadUserData() {
      if (!auth.currentUser) return;
      currentUser = auth.currentUser;

      try {
        const docRef = doc(db, "artifacts", appId, "users", currentUser.uid, "gamedata", "profile");
        const snap = await getDoc(docRef);

        if (snap.exists()) {
          const data = snap.data();
          userProfile.username = data.username || userProfile.username;
          userProfile.totalScore = data.totalScore || 0;
          userProfile.levelsUnlocked = data.levelsUnlocked || 1;
          if (data.settings) {
            userProfile.settings.particles = data.settings.particles ?? true;
            userProfile.settings.music = data.settings.music ?? true;
            userProfile.settings.sfx = data.settings.sfx ?? true;
          }
        } else {
          await saveUserData();
        }
      } catch (err) {
        console.error("Load error", err);
      }
    }

    async function saveUserData() {
      if (!auth.currentUser) return;
      try {
        const docRef = doc(db, "artifacts", appId, "users", auth.currentUser.uid, "gamedata", "profile");
        await setDoc(docRef, userProfile, { merge: true });
      } catch (err) {
        console.error("Save error", err);
      }
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    }

    window.addEventListener("resize", resize);

    async function init() {
      await ensureAnonymousAuth();
      await loadUserData();

      const displayUsername = document.getElementById("display-username");
      const displayTotalScore = document.getElementById("display-total-score");
      const loading = document.getElementById("screen-loading");
      const mainMenu = document.getElementById("screen-main-menu");

      if (displayUsername) displayUsername.textContent = userProfile.username;
      if (displayTotalScore) displayTotalScore.textContent = String(userProfile.totalScore);
      loading?.classList.add("hidden");
      mainMenu?.classList.remove("hidden");
    }

    function loop() {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, width, height);

      // You can paste the rest of your gameLoop, classes, level data,
      // HUD logic, input logic, and entity rendering here.
      requestAnimationFrame(loop);
    }

    init();
    requestAnimationFrame(loop);

    const backstoryBtn = document.getElementById("btn-generate-backstory");
    const backstoryDisplay = document.getElementById("display-backstory");

    const handleBackstory = async () => {
      if (!backstoryBtn || !backstoryDisplay) return;

      backstoryBtn.setAttribute("disabled", "true");
      backstoryBtn.textContent = "Writing...";
      backstoryDisplay.textContent = "Consulting the ancient lore...";

      const prompt = `Write a very short, funny, 2-sentence heroic backstory for a platformer video game character named '${userProfile.username}'. They jump on red block enemies and collect gold coins.`;
      const systemInstruction = "You are a dramatic, fantasy video game narrator.";

      const result = await callAI(prompt, systemInstruction);
      backstoryDisplay.textContent = `"${result.trim()}"`;
      backstoryBtn.textContent = "Generate Backstory ✨";
      backstoryBtn.removeAttribute("disabled");
    };

    backstoryBtn?.addEventListener("click", handleBackstory);

    return () => {
      window.removeEventListener("resize", resize);
      backstoryBtn?.removeEventListener("click", handleBackstory);
    };
  }, []);

  return (
    <>
      <canvas id="gameCanvas" />

      <div id="ui-container" className="flex flex-col justify-center items-center">
        <div
          id="screen-loading"
          className="interactive-ui panel p-8 rounded-3xl text-center max-w-sm w-full mx-4 fade-in"
        >
          <h2 className="text-4xl font-black text-blue-600 mb-4 animate-pulse">Loading...</h2>
          <p className="text-gray-600 font-bold">Connecting to cloud storage...</p>
        </div>

        <div
          id="screen-main-menu"
          className="interactive-ui panel p-8 rounded-3xl text-center max-w-md w-full mx-4 hidden fade-in"
        >
          <div className="mb-2 text-6xl drop-shadow-md animate-bounce" style={{ animationDuration: "2s" }}>
            🌟
          </div>
          <h1 className="text-5xl font-black text-blue-600 mb-1 uppercase tracking-wider drop-shadow-sm">
            Platformer
          </h1>
          <p className="text-blue-500 font-bold mb-6 tracking-[0.2em] text-sm bg-blue-100 inline-block px-3 py-1 rounded-full">
            DELUXE EDITION
          </p>

          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 mb-6 text-left shadow-inner">
            <p className="font-bold text-gray-700 text-lg">
              Welcome, <span id="display-username" className="text-blue-600 font-black">Player</span>!
            </p>
            <div className="flex justify-between items-center mt-2">
              <p className="text-sm font-bold text-gray-500 uppercase">Total Score</p>
              <p
                className="text-xl font-black text-yellow-500 bg-yellow-100 px-3 py-1 rounded-lg"
                id="display-total-score"
              >
                0
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-blue-200">
              <p id="display-backstory" className="text-xs text-gray-600 italic mb-3">
                Every hero needs an origin...
              </p>
              <button
                id="btn-generate-backstory"
                className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-lg text-sm uppercase tracking-wide shadow-[0_3px_0_#4f46e5] active:translate-y-[3px] active:shadow-none transition-all"
              >
                Generate Backstory ✨
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <button className="w-full py-4 btn-success font-black rounded-xl text-xl uppercase tracking-wider">
              Play Game
            </button>
            <button className="w-full py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl uppercase tracking-wide border-b-4 border-gray-400 active:border-b-0 active:translate-y-[4px] transition-all">
              Settings
            </button>
          </div>
        </div>
      </div>
    </>
  );
}