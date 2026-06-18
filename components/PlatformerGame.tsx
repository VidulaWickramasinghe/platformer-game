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

type GameMode = "menu" | "playing" | "paused" | "result";

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Player = Rect & {
  vx: number;
  vy: number;
  grounded: boolean;
};

type Coin = {
  x: number;
  y: number;
  collected: boolean;
};

type Enemy = Rect & {
  startX: number;
  endX: number;
  speed: number;
  direction: number;
  defeated: boolean;
};

type LevelState = {
  level: number;
  width: number;
  score: number;
  coinsCollected: number;
  player: Player;
  platforms: Rect[];
  coins: Coin[];
  enemies: Enemy[];
  goal: Rect;
  message: string;
};

const TOTAL_LEVELS = 6;
const GRAVITY = 0.7;
const MOVE_SPEED = 5.4;
const JUMP_SPEED = -14;

function rectsOverlap(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

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
    let animationFrameId = 0;
    let activeLevel = 1;
    let mode: GameMode = "menu";
    let cameraX = 0;
    let levelState: LevelState | null = null;
    const keys = new Set<string>();

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

    let activeLevel = 1;

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

    function updateHud() {
      const hudLevel = document.getElementById("hud-level");
      const hudScore = document.getElementById("hud-score");
      const hudCoins = document.getElementById("hud-coins");
      const hudHint = document.getElementById("hud-hint");

      if (hudLevel) hudLevel.textContent = `Stage ${activeLevel}`;
      if (hudScore) hudScore.textContent = String(levelState?.score ?? 0);
      if (hudCoins) {
        hudCoins.textContent = `${levelState?.coinsCollected ?? 0}/${levelState?.coins.length ?? 0}`;
      }
      if (hudHint) hudHint.textContent = levelState?.message ?? "Collect coins and reach the flag!";
    }

    function drawBackground() {
      context.fillStyle = "#0f172a";
      context.fillRect(0, 0, width, height);

      context.fillStyle = "rgba(255,255,255,0.06)";
      for (let i = 0; i < 8; i++) {
        const x = (i * 260 - cameraX * 0.18 + Date.now() * 0.01) % (width + 260) - 130;
        const y = 70 + (i % 4) * 78;

        context.beginPath();
        context.arc(x, y, 30, 0, Math.PI * 2);
        context.arc(x + 30, y, 40, 0, Math.PI * 2);
        context.arc(x + 60, y, 30, 0, Math.PI * 2);
        context.fill();
      }
    }

    function drawGround() {
      const groundY = height - 90;
      context.fillStyle = "#4ade80";
      context.fillRect(0, groundY, width, 15);

      context.fillStyle = "#854d0e";
      context.fillRect(0, groundY + 15, width, 75);
    }

    function drawPlayer(player: Rect) {
      const x = player.x - cameraX;
      const y = player.y;

      context.fillStyle = "rgba(0,0,0,0.35)";
      context.beginPath();
      context.ellipse(x + 20, y + 55, 26, 7, 0, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#3b82f6";
      context.beginPath();
      context.roundRect(x, y, 40, 50, 8);
      context.fill();

      context.fillStyle = "#fff";
      context.fillRect(x + 8, y + 10, 8, 14);
      context.fillRect(x + 24, y + 10, 8, 14);

      context.fillStyle = "#000";
      context.fillRect(x + 10, y + 14, 4, 6);
      context.fillRect(x + 26, y + 14, 4, 6);
    }

    function drawAttractMode() {
      const playerX = Math.max(80, Math.min(width / 3, width - 160));
      const playerY = height - 180;
      drawPlayer({ x: playerX + cameraX, y: playerY, width: 40, height: 50 });
    }

    function createLevel(level: number): LevelState {
      const groundY = height - 90;
      const levelWidth = Math.max(2400, width + 900 + level * 180);
      const platforms: Rect[] = [
        { x: 0, y: groundY, width: levelWidth, height: 90 },
        { x: 260, y: groundY - 120, width: 170, height: 22 },
        { x: 560, y: groundY - 210, width: 160, height: 22 },
        { x: 900, y: groundY - 150, width: 210, height: 22 },
        { x: 1260, y: groundY - 245, width: 180, height: 22 },
        { x: 1620, y: groundY - 170, width: 250, height: 22 },
        { x: 2040, y: groundY - 260, width: 180, height: 22 },
      ];
      const coins: Coin[] = platforms.slice(1).flatMap((platform, index) => [
        { x: platform.x + 45, y: platform.y - 28, collected: false },
        { x: platform.x + platform.width - 45, y: platform.y - 28 - (index % 2) * 25, collected: false },
      ]);
      const enemies: Enemy[] = [
        {
          x: 720,
          y: groundY - 38,
          width: 38,
          height: 38,
          startX: 650,
          endX: 900,
          speed: 1.5 + level * 0.15,
          direction: 1,
          defeated: false,
        },
        {
          x: 1460,
          y: groundY - 38,
          width: 38,
          height: 38,
          startX: 1380,
          endX: 1660,
          speed: 1.8 + level * 0.15,
          direction: -1,
          defeated: false,
        },
      ];

      return {
        level,
        width: levelWidth,
        score: 0,
        coinsCollected: 0,
        player: {
          x: 80,
          y: groundY - 50,
          width: 40,
          height: 50,
          vx: 0,
          vy: 0,
          grounded: false,
        },
        platforms,
        coins,
        enemies,
        goal: { x: levelWidth - 130, y: groundY - 120, width: 50, height: 120 },
        message: "Use ← → or A/D to move, Space/W/↑ to jump.",
      };
    }

    function renderLevelSelect() {
      const levelsGrid = document.getElementById("levels-grid");
      if (!levelsGrid) return;

      levelsGrid.innerHTML = "";

      for (let level = 1; level <= TOTAL_LEVELS; level++) {
        const isUnlocked = level <= userProfile.levelsUnlocked;
        const levelButton = document.createElement("button");
        levelButton.type = "button";
        levelButton.className = [
          "level-btn",
          "rounded-2xl",
          "p-4",
          "font-black",
          "uppercase",
          "tracking-wide",
          "border-b-4",
          isUnlocked
            ? "bg-blue-500 text-white border-blue-700 cursor-pointer"
            : "locked bg-gray-300 text-gray-600 border-gray-500",
        ].join(" ");
        levelButton.disabled = !isUnlocked;
        levelButton.setAttribute(
          "aria-label",
          isUnlocked ? `Start stage ${level}` : `Stage ${level} locked`
        );
        levelButton.innerHTML = `
          <span class="block text-3xl mb-1">${isUnlocked ? "⭐" : "🔒"}</span>
          <span class="block">Stage ${level}</span>
          <span class="block text-xs font-bold opacity-80 mt-1">${isUnlocked ? "Ready" : "Locked"}</span>
        `;

        if (isUnlocked) {
          levelButton.addEventListener("click", () => startLevel(level));
        }

        levelsGrid.appendChild(levelButton);
      }
    }

    function resetKeys() {
      keys.clear();
    }

    function startLevel(level: number) {
      activeLevel = level;
      mode = "playing";
      cameraX = 0;
      levelState = createLevel(level);
      resetKeys();
      updateHud();
      showScreen("screen-hud");
    }

    function pauseGame() {
      if (mode !== "playing") return;
      mode = "paused";
      showScreen("screen-pause");
    }

    function resumeGame() {
      if (mode !== "paused") return;
      mode = "playing";
      showScreen("screen-hud");
    }

    function finishLevel() {
      if (!levelState) return;

      mode = "result";
      const bonus = 100 * activeLevel + levelState.coinsCollected * 25;
      levelState.score += bonus;
      userProfile.totalScore += levelState.score;
      userProfile.levelsUnlocked = Math.max(
        userProfile.levelsUnlocked,
        Math.min(TOTAL_LEVELS, activeLevel + 1)
      );
      updateMenuUI();
      renderLevelSelect();
      void saveUserData();

      const resultTitle = document.getElementById("result-title");
      const resultMessage = document.getElementById("result-message");
      if (resultTitle) resultTitle.textContent = `Stage ${activeLevel} Complete!`;
      if (resultMessage) {
        resultMessage.textContent = `You collected ${levelState.coinsCollected}/${levelState.coins.length} coins and earned ${levelState.score} points.`;
      }
      showScreen("screen-result");
    }

    function failLevel(message: string) {
      if (!levelState) return;
      levelState.message = message;
      levelState.player.x = 80;
      levelState.player.y = height - 140;
      levelState.player.vx = 0;
      levelState.player.vy = 0;
      cameraX = 0;
      updateHud();
    }

    function updateGame() {
      if (mode !== "playing" || !levelState) return;

      const player = levelState.player;
      const wantsLeft = keys.has("ArrowLeft") || keys.has("KeyA");
      const wantsRight = keys.has("ArrowRight") || keys.has("KeyD");
      const wantsJump = keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW");

      player.vx = 0;
      if (wantsLeft) player.vx -= MOVE_SPEED;
      if (wantsRight) player.vx += MOVE_SPEED;
      if (wantsJump && player.grounded) {
        player.vy = JUMP_SPEED;
        player.grounded = false;
      }

      player.x += player.vx;
      player.x = Math.max(0, Math.min(levelState.width - player.width, player.x));

      for (const platform of levelState.platforms) {
        if (rectsOverlap(player, platform)) {
          if (player.vx > 0) player.x = platform.x - player.width;
          if (player.vx < 0) player.x = platform.x + platform.width;
        }
      }

      player.vy += GRAVITY;
      player.y += player.vy;
      player.grounded = false;

      for (const platform of levelState.platforms) {
        if (!rectsOverlap(player, platform)) continue;

        if (player.vy > 0 && player.y + player.height - player.vy <= platform.y + 4) {
          player.y = platform.y - player.height;
          player.vy = 0;
          player.grounded = true;
        } else if (player.vy < 0) {
          player.y = platform.y + platform.height;
          player.vy = 0;
        }
      }

      for (const enemy of levelState.enemies) {
        if (enemy.defeated) continue;
        enemy.x += enemy.speed * enemy.direction;
        if (enemy.x <= enemy.startX || enemy.x + enemy.width >= enemy.endX) {
          enemy.direction *= -1;
        }

        if (!rectsOverlap(player, enemy)) continue;

        if (player.vy > 0 && player.y + player.height - player.vy <= enemy.y + 8) {
          enemy.defeated = true;
          player.vy = JUMP_SPEED * 0.65;
          levelState.score += 75;
          levelState.message = "Enemy bounced! +75";
        } else {
          failLevel("Ouch! Jump on enemies to defeat them.");
        }
      }

      for (const coin of levelState.coins) {
        if (coin.collected) continue;
        const coinRect = { x: coin.x - 12, y: coin.y - 12, width: 24, height: 24 };
        if (rectsOverlap(player, coinRect)) {
          coin.collected = true;
          levelState.coinsCollected += 1;
          levelState.score += 50;
          levelState.message = "Coin collected! +50";
        }
      }

      if (player.y > height + 120) {
        failLevel("Careful! You fell off the world.");
      }

      if (rectsOverlap(player, levelState.goal)) {
        finishLevel();
      }

      cameraX = Math.max(
        0,
        Math.min(levelState.width - width, player.x - width * 0.35)
      );
      updateHud();
    }

    function drawPlatform(platform: Rect) {
      const x = platform.x - cameraX;
      context.fillStyle = "#854d0e";
      context.fillRect(x, platform.y + 12, platform.width, platform.height);
      context.fillStyle = "#4ade80";
      context.fillRect(x, platform.y, platform.width, 14);
      context.fillStyle = "rgba(255,255,255,0.16)";
      context.fillRect(x + 6, platform.y + 20, platform.width - 12, 5);
    }

    function drawLevel() {
      if (!levelState) {
        drawGround();
        drawAttractMode();
        return;
      }

      for (const platform of levelState.platforms) drawPlatform(platform);

      context.fillStyle = "#fde047";
      for (const coin of levelState.coins) {
        if (coin.collected) continue;
        context.beginPath();
        context.arc(coin.x - cameraX, coin.y, 12, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#f59e0b";
        context.fillRect(coin.x - cameraX - 3, coin.y - 7, 6, 14);
        context.fillStyle = "#fde047";
      }

      for (const enemy of levelState.enemies) {
        if (enemy.defeated) continue;
        const x = enemy.x - cameraX;
        context.fillStyle = "#ef4444";
        context.beginPath();
        context.roundRect(x, enemy.y, enemy.width, enemy.height, 8);
        context.fill();
        context.fillStyle = "#111827";
        context.fillRect(x + 8, enemy.y + 12, 6, 6);
        context.fillRect(x + 24, enemy.y + 12, 6, 6);
      }

      const flagX = levelState.goal.x - cameraX;
      context.fillStyle = "#f8fafc";
      context.fillRect(flagX, levelState.goal.y, 8, levelState.goal.height);
      context.fillStyle = "#22c55e";
      context.beginPath();
      context.moveTo(flagX + 8, levelState.goal.y + 8);
      context.lineTo(flagX + 76, levelState.goal.y + 28);
      context.lineTo(flagX + 8, levelState.goal.y + 52);
      context.closePath();
      context.fill();

      drawPlayer(levelState.player);
    }

    function gameLoop() {
      updateGame();
      drawBackground();
      drawLevel();
      animationFrameId = requestAnimationFrame(gameLoop);
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
      renderLevelSelect();
      showScreen("screen-main-menu");
      animationFrameId = requestAnimationFrame(gameLoop);
    }

    const backstoryBtn = document.getElementById("btn-generate-backstory");
    const backstoryDisplay = document.getElementById("display-backstory");
    const saveSettingsBtn = document.getElementById("btn-save-settings");
    const inputUsername = document.getElementById(
      "input-username"
    ) as HTMLInputElement | null;
    const gotoLevelsBtn = document.getElementById("btn-goto-levels");
    const gotoSettingsBtn = document.getElementById("btn-goto-settings");
    const levelsBackBtn = document.getElementById("btn-levels-back");
    const cancelSettingsBtn = document.getElementById("btn-cancel-settings");
    const pauseBtn = document.getElementById("btn-pause");
    const resumeBtn = document.getElementById("btn-resume");
    const restartBtns = document.querySelectorAll("[data-action='restart-level']");
    const menuBtns = document.querySelectorAll("[data-action='main-menu']");
    const touchLeftBtn = document.getElementById("touch-left");
    const touchRightBtn = document.getElementById("touch-right");
    const touchJumpBtn = document.getElementById("touch-jump");

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

    const onGotoLevels = () => {
      mode = "menu";
      renderLevelSelect();
      showScreen("screen-level-select");
    };

    const onGotoLevels = () => {
      renderLevelSelect();
      showScreen("screen-level-select");
    };

    const onGotoSettings = () => {
      if (inputUsername) inputUsername.value = userProfile.username;
      showScreen("screen-settings");
    };

    const onBackToMenu = () => {
      mode = "menu";
      levelState = null;
      cameraX = 0;
      resetKeys();
      updateMenuUI();
      showScreen("screen-main-menu");
    };

    const onRestartLevel = () => startLevel(activeLevel);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        if (mode === "playing") pauseGame();
        else if (mode === "paused") resumeGame();
        return;
      }

      keys.add(event.code);
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) {
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const createTouchBinding = (button: HTMLElement | null, code: string) => ({
      button,
      onPress: () => keys.add(code),
      onRelease: () => keys.delete(code),
    });

    backstoryBtn?.addEventListener("click", onBackstoryClick);
    gotoLevelsBtn?.addEventListener("click", onGotoLevels);
    saveSettingsBtn?.addEventListener("click", onSaveSettings);
    gotoSettingsBtn?.addEventListener("click", onGotoSettings);
    levelsBackBtn?.addEventListener("click", onBackToMenu);
    cancelSettingsBtn?.addEventListener("click", onBackToMenu);
    pauseBtn?.addEventListener("click", pauseGame);
    resumeBtn?.addEventListener("click", resumeGame);
    restartBtns.forEach((button) => button.addEventListener("click", onRestartLevel));
    menuBtns.forEach((button) => button.addEventListener("click", onBackToMenu));
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const touchBindings = [
      createTouchBinding(touchLeftBtn, "ArrowLeft"),
      createTouchBinding(touchRightBtn, "ArrowRight"),
      createTouchBinding(touchJumpBtn, "Space"),
    ];
    for (const { button, onPress, onRelease } of touchBindings) {
      button?.addEventListener("pointerdown", onPress);
      button?.addEventListener("pointerup", onRelease);
      button?.addEventListener("pointercancel", onRelease);
      button?.addEventListener("pointerleave", onRelease);
    }

    init();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(animationFrameId);

      backstoryBtn?.removeEventListener("click", onBackstoryClick);
      gotoLevelsBtn?.removeEventListener("click", onGotoLevels);
      saveSettingsBtn?.removeEventListener("click", onSaveSettings);
      gotoSettingsBtn?.removeEventListener("click", onGotoSettings);
      levelsBackBtn?.removeEventListener("click", onBackToMenu);
      cancelSettingsBtn?.removeEventListener("click", onBackToMenu);
      pauseBtn?.removeEventListener("click", pauseGame);
      resumeBtn?.removeEventListener("click", resumeGame);
      restartBtns.forEach((button) => button.removeEventListener("click", onRestartLevel));
      menuBtns.forEach((button) => button.removeEventListener("click", onBackToMenu));
      for (const { button, onPress, onRelease } of touchBindings) {
        button?.removeEventListener("pointerdown", onPress);
        button?.removeEventListener("pointerup", onRelease);
        button?.removeEventListener("pointercancel", onRelease);
        button?.removeEventListener("pointerleave", onRelease);
      }
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
          <h2 className="text-3xl font-black text-gray-800 mb-2 uppercase tracking-wide">
            Select Stage
          </h2>
          <p className="text-gray-500 font-bold text-sm mb-6">
            Collect coins, stomp enemies, and reach the flag.
          </p>

          <div id="levels-grid" className="grid grid-cols-2 gap-4 mb-6" />

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

        <div id="screen-hud" className="absolute inset-0 hidden pointer-events-none">
          <div className="absolute left-4 top-4 glass-panel rounded-2xl px-4 py-3 font-black text-white">
            <p id="hud-level" className="text-lg uppercase tracking-wide">
              Stage 1
            </p>
            <p className="text-sm text-yellow-300">
              Score: <span id="hud-score">0</span>
            </p>
            <p className="text-sm text-amber-200">
              Coins: <span id="hud-coins">0/0</span>
            </p>
          </div>

          <p
            id="hud-hint"
            className="absolute left-1/2 top-4 -translate-x-1/2 glass-panel rounded-xl px-4 py-2 text-sm font-bold text-white hidden sm:block"
          >
            Use arrows or A/D to move. Space/W/↑ jumps.
          </p>

          <button
            id="btn-pause"
            className="hud-icon-btn absolute right-4 top-4 text-xl pointer-events-auto"
            aria-label="Pause game"
          >
            ⏸
          </button>

          <div className="absolute bottom-6 left-6 flex gap-4 pointer-events-auto md:hidden">
            <button id="touch-left" className="touch-btn" aria-label="Move left">
              ◀
            </button>
            <button id="touch-right" className="touch-btn" aria-label="Move right">
              ▶
            </button>
          </div>
          <button
            id="touch-jump"
            className="touch-btn absolute bottom-6 right-6 pointer-events-auto md:hidden"
            aria-label="Jump"
          >
            ⤒
          </button>
        </div>

        <div
          id="screen-pause"
          className="interactive-ui panel p-8 rounded-3xl text-center max-w-sm w-full mx-4 hidden fade-in"
        >
          <h2 className="text-4xl font-black text-gray-800 mb-6 uppercase">Paused</h2>
          <div className="space-y-4">
            <button id="btn-resume" className="w-full py-3 btn-success font-black rounded-xl uppercase">
              Resume
            </button>
            <button
              data-action="restart-level"
              className="w-full py-3 btn-primary font-black rounded-xl uppercase"
            >
              Restart Stage
            </button>
            <button
              data-action="main-menu"
              className="w-full py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 font-black rounded-xl uppercase border-b-4 border-gray-500"
            >
              Main Menu
            </button>
          </div>
        </div>

        <div
          id="screen-result"
          className="interactive-ui panel p-8 rounded-3xl text-center max-w-md w-full mx-4 hidden fade-in"
        >
          <h2 id="result-title" className="text-4xl font-black text-blue-600 mb-4 uppercase">
            Stage Complete!
          </h2>
          <p id="result-message" className="text-gray-700 font-bold mb-6">
            Nice run!
          </p>
          <div className="space-y-4">
            <button
              data-action="restart-level"
              className="w-full py-3 btn-primary font-black rounded-xl uppercase"
            >
              Replay Stage
            </button>
            <button
              id="btn-next-levels"
              data-action="main-menu"
              className="w-full py-3 btn-success font-black rounded-xl uppercase"
            >
              Back To Menu
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
