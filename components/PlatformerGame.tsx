"use client";

import { useEffect, useRef } from "react";
import { ensureAnonymousAuth, getFirebaseServices } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

type UserProfile = {
  username: string;
  totalScore: number;
  levelsUnlocked: number;
  settings: {
    particles: boolean;
    music: boolean;
    sfx: boolean;
  };
};

export default function PlatformerGame() {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const canvasEl = document.getElementById("gameCanvas");
    if (!(canvasEl instanceof HTMLCanvasElement)) return;

    const canvas = canvasEl;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const context = ctx;

    const firebaseServices = getFirebaseServices();

    let width = 0;
    let height = 0;

    const appId = "web-platformer-app";

    const userProfile: UserProfile = {
      username: "Player" + Math.floor(Math.random() * 9000 + 1000),
      totalScore: 0,
      levelsUnlocked: 1,
      settings: {
        particles: true,
        music: true,
        sfx: true,
      },
    };

    async function callAI(prompt: string, systemInstruction?: string) {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          systemInstruction,
        }),
      });

      const data = await response.json();
      return data?.text || "No response from AI.";
    }

    async function loadUserData() {
      if (!firebaseServices?.auth || !firebaseServices.db || !firebaseServices.auth.currentUser) return;

      try {
        const docRef = doc(
          firebaseServices.db,
          "artifacts",
          appId,
          "users",
          firebaseServices.auth.currentUser.uid,
          "gamedata",
          "profile"
        );

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
      } catch (error) {
        console.error("Load error", error);
      }
    }

    async function saveUserData() {
      if (!firebaseServices?.auth || !firebaseServices.db || !firebaseServices.auth.currentUser) return;

      try {
        const docRef = doc(
          firebaseServices.db,
          "artifacts",
          appId,
          "users",
          firebaseServices.auth.currentUser.uid,
          "gamedata",
          "profile"
        );

        await setDoc(docRef, userProfile, { merge: true });
      } catch (error) {
        console.error("Save error", error);
      }
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    }

    function drawBackground() {
      context.fillStyle = "#0f172a";
      context.fillRect(0, 0, width, height);

      context.fillStyle = "rgba(255,255,255,0.06)";
      for (let i = 0; i < 8; i++) {
        const x = (i * 220 + Date.now() * 0.01) % (width + 200) - 100;
        const y = 60 + (i % 4) * 70;

        context.beginPath();
        context.arc(x, y, 30, 0, Math.PI * 2);
        context.arc(x + 30, y, 40, 0, Math.PI * 2);
        context.arc(x + 60, y, 30, 0, Math.PI * 2);
        context.fill();
      }
    }

    function drawPlaceholderPlayer() {
      const playerX = Math.max(80, Math.min(width / 3, width - 160));
      const playerY = height - 180;

      context.fillStyle = "rgba(0,0,0,0.35)";
      context.beginPath();
      context.ellipse(playerX + 20, playerY + 55, 26, 7, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#3b82f6";
      context.beginPath();
      context.roundRect(playerX, playerY, 40, 50, 8);
      context.fill();

      context.fillStyle = "#fff";
      context.fillRect(playerX + 8, playerY + 10, 8, 14);
      context.fillRect(playerX + 24, playerY + 10, 8, 14);

      context.fillStyle = "#000";
      context.fillRect(playerX + 10, playerY + 14, 4, 6);
      context.fillRect(playerX + 26, playerY + 14, 4, 6);
    }

    function drawGround() {
      context.fillStyle = "#4ade80";
      context.fillRect(0, height - 90, width, 15);

      context.fillStyle = "#854d0e";
      context.fillRect(0, height - 75, width, 75);
    }

    let animationFrameId = 0;

    function gameLoop() {
      drawBackground();
      drawGround();
      drawPlaceholderPlayer();
      animationFrameId = requestAnimationFrame(gameLoop);
    }

    function updateMenuUI() {
      const displayUsername = document.getElementById("display-username");
      const displayTotalScore = document.getElementById("display-total-score");
      const inputUsername = document.getElementById(
        "input-username"
      ) as HTMLInputElement | null;

      if (displayUsername) displayUsername.textContent = userProfile.username;
      if (displayTotalScore) {
        displayTotalScore.textContent = String(userProfile.totalScore);
      }
      if (inputUsername) inputUsername.value = userProfile.username;
    }

    function showScreen(targetId: string) {
      const screens = [
        "screen-loading",
        "screen-main-menu",
        "screen-level-select",
        "screen-settings",
        "screen-hud",
        "screen-pause",
        "screen-result",
      ];

      for (const id of screens) {
        const el = document.getElementById(id);
        if (el) el.classList.add("hidden");
      }

      const target = document.getElementById(targetId);
      if (target) target.classList.remove("hidden");
    }

    async function init() {
      resize();
      window.addEventListener("resize", resize);

      try {
        await ensureAnonymousAuth();
        await loadUserData();
      } catch (error) {
        console.error("Init error", error);
      }

      updateMenuUI();
      showScreen("screen-main-menu");
      animationFrameId = requestAnimationFrame(gameLoop);
    }

    const backstoryBtn = document.getElementById("btn-generate-backstory");
    const backstoryDisplay = document.getElementById("display-backstory");
    const saveSettingsBtn = document.getElementById("btn-save-settings");
    const inputUsername = document.getElementById(
      "input-username"
    ) as HTMLInputElement | null;

    const onBackstoryClick = async () => {
      if (!backstoryBtn || !backstoryDisplay) return;

      backstoryBtn.setAttribute("disabled", "true");
      backstoryBtn.textContent = "Writing...";
      backstoryDisplay.textContent = "Consulting the ancient lore...";

      const prompt = `Write a very short, funny, 2-sentence heroic backstory for a platformer video game character named '${userProfile.username}'. They jump on red block enemies and collect gold coins.`;
      const systemInstruction = "You are a dramatic, fantasy video game narrator.";

      try {
        const result = await callAI(prompt, systemInstruction);
        backstoryDisplay.textContent = `"${result.trim()}"`;
      } catch {
        backstoryDisplay.textContent = "The ancient scrolls are unavailable right now.";
      }

      backstoryBtn.textContent = "Generate Backstory ✨";
      backstoryBtn.removeAttribute("disabled");
    };

    const onSaveSettings = async () => {
      if (inputUsername) {
        const newName = inputUsername.value.trim();
        if (newName) {
          userProfile.username = newName;
          updateMenuUI();
          await saveUserData();
        }
      }

      showScreen("screen-main-menu");
    };

    const gotoLevelsBtn = document.getElementById("btn-goto-levels");
    const gotoSettingsBtn = document.getElementById("btn-goto-settings");
    const levelsBackBtn = document.getElementById("btn-levels-back");
    const cancelSettingsBtn = document.getElementById("btn-cancel-settings");

    const onGotoLevels = () => {
      showScreen("screen-level-select");
    };

    const onGotoSettings = () => {
      if (inputUsername) inputUsername.value = userProfile.username;
      showScreen("screen-settings");
    };

    const onBackToMenu = () => {
      showScreen("screen-main-menu");
    };

    backstoryBtn?.addEventListener("click", onBackstoryClick);
    gotoLevelsBtn?.addEventListener("click", onGotoLevels);
    saveSettingsBtn?.addEventListener("click", onSaveSettings);
    gotoSettingsBtn?.addEventListener("click", onGotoSettings);
    levelsBackBtn?.addEventListener("click", onBackToMenu);
    cancelSettingsBtn?.addEventListener("click", onBackToMenu);

    init();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);

      backstoryBtn?.removeEventListener("click", onBackstoryClick);
      gotoLevelsBtn?.removeEventListener("click", onGotoLevels);
      saveSettingsBtn?.removeEventListener("click", onSaveSettings);
      gotoSettingsBtn?.removeEventListener("click", onGotoSettings);
      levelsBackBtn?.removeEventListener("click", onBackToMenu);
      cancelSettingsBtn?.removeEventListener("click", onBackToMenu);
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
          <h2 className="text-4xl font-black text-blue-600 mb-4 animate-pulse">
            Loading...
          </h2>
          <p className="text-gray-600 font-bold">Connecting to cloud storage...</p>
        </div>

        <div
          id="screen-main-menu"
          className="interactive-ui panel p-8 rounded-3xl text-center max-w-md w-full mx-4 hidden fade-in"
        >
          <div
            className="mb-2 text-6xl drop-shadow-md animate-bounce"
            style={{ animationDuration: "2s" }}
          >
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
              Welcome,{" "}
              <span id="display-username" className="text-blue-600 font-black">
                Player
              </span>
              !
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
            <button
              id="btn-goto-levels"
              className="w-full py-4 btn-success font-black rounded-xl text-xl uppercase tracking-wider"
            >
              Play Game
            </button>

            <button
              id="btn-goto-settings"
              className="w-full py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl uppercase tracking-wide border-b-4 border-gray-400 active:border-b-0 active:translate-y-[4px] transition-all"
            >
              Settings
            </button>
          </div>
        </div>

        <div
          id="screen-level-select"
          className="interactive-ui panel p-6 rounded-3xl text-center max-w-lg w-full mx-4 hidden fade-in"
        >
          <h2 className="text-3xl font-black text-gray-800 mb-6 uppercase tracking-wide">
            Select Stage
          </h2>

          <div id="levels-grid" className="grid grid-cols-2 gap-4 mb-6"></div>

          <button
            id="btn-levels-back"
            className="w-full py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold rounded-xl uppercase tracking-wide border-b-4 border-gray-500 active:border-b-0 active:translate-y-[4px] transition-all"
          >
            Back
          </button>
        </div>

        <div
          id="screen-settings"
          className="interactive-ui panel p-8 rounded-3xl max-w-md w-full mx-4 hidden text-left fade-in"
        >
          <h2 className="text-3xl font-black text-gray-800 mb-6 uppercase text-center">
            Settings
          </h2>

          <div className="space-y-4 mb-8">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Display Name
              </label>
              <input
                type="text"
                id="input-username"
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-blue-500 outline-none font-bold text-lg text-gray-800 bg-gray-50"
                maxLength={15}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button
              id="btn-save-settings"
              className="flex-1 py-3 btn-primary font-bold rounded-xl uppercase tracking-wide"
            >
              Apply
            </button>
            <button
              id="btn-cancel-settings"
              className="flex-1 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold rounded-xl uppercase tracking-wide border-b-4 border-gray-500 active:border-b-0 active:translate-y-[4px] transition-all"
            >
              Cancel
            </button>
          </div>
        </div>

        <div id="screen-hud" className="absolute inset-0 hidden" />
        <div id="screen-pause" className="absolute inset-0 hidden" />
        <div id="screen-result" className="absolute inset-0 hidden" />
      </div>
    </>
  );
}