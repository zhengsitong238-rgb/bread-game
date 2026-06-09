(() => {
  "use strict";

  const STORAGE_KEY = "haoshiProteinMergeRanks";
  const BEST_KEY = "haoshiProteinMergeBest";
  const MAX_LEVEL = 6;
  const DROP_COOLDOWN = 470;

  const foods = [
    { name: "鸡蛋", short: "鸡蛋", protein: 6, score: 10, radius: 23, color: "#fff5d8", stroke: "#d9b45d", image: "./assets/egg.png" },
    { name: "牛奶", short: "牛奶", protein: 8, score: 24, radius: 29, color: "#fffdf8", stroke: "#d9b45d", image: "./assets/milk.png" },
    { name: "玻利维亚红藜麦", short: "红藜麦", protein: 10, score: 46, radius: 35, color: "#f2d38d", stroke: "#b9483f", image: "./assets/quinoa.png" },
    { name: "高筋面粉", short: "面粉", protein: 12, score: 82, radius: 42, color: "#fff8e9", stroke: "#caa66a", image: "./assets/flour.png" },
    { name: "面团", short: "面团", protein: 14, score: 138, radius: 50, color: "#f3d59a", stroke: "#a77a2b", image: "./assets/dough.png" },
    { name: "无边吐司片", short: "吐司片", protein: 16, score: 220, radius: 59, color: "#ead2a3", stroke: "#8b5523", image: "./assets/toast-slice.png" },
    { name: "豪士藜麦吐司", short: "豪士吐司", protein: 20, score: 360, radius: 69, color: "#e4c36d", stroke: "#123f7a", image: "./assets/haoshi-quinoa-toast.png", product: true }
  ];

  const $ = (selector) => document.querySelector(selector);
  const stage = $("#gameStage");
  const canvas = $("#worldCanvas");
  const effectLayer = $("#effectLayer");
  const dropGuide = $("#dropGuide");
  const proteinValue = $("#proteinValue");
  const scoreValue = $("#scoreValue");
  const bestValue = $("#bestValue");
  const nextIcon = $("#nextIcon");
  const nicknameModal = $("#nicknameModal");
  const rankModal = $("#rankModal");
  const gameOverModal = $("#gameOverModal");
  const certificateModal = $("#certificateModal");
  const rankList = $("#rankList");
  const toastMessage = $("#toastMessage");

  let engine;
  let runner;
  let render;
  let walls = [];
  let labels = new Map();
  let mergingPairs = new Set();
  let width = 0;
  let height = 0;
  let currentX = 0;
  let nextLevel = 0;
  let canDrop = true;
  let isGameOver = false;
  let nickname = "蛋白质工程师";
  let totalProtein = 0;
  let score = 0;
  let bestScore = Number(localStorage.getItem(BEST_KEY) || 0);
  let startedAt = new Date();

  function requireLibraries() {
    if (!window.Matter || !window.html2canvas) {
      showToast("依赖加载失败，请联网后重新打开页面。");
      return false;
    }
    return true;
  }

  function initMatter() {
    const { Engine, Render, Runner, Events } = Matter;
    engine = Engine.create();
    engine.gravity.y = 1.05;
    runner = Runner.create();

    render = Render.create({
      canvas,
      engine,
      options: {
        width,
        height,
        wireframes: false,
        background: "transparent",
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2)
      }
    });

    Render.run(render);
    Runner.run(runner, engine);
    Events.on(engine, "collisionStart", handleCollision);
    Events.on(engine, "afterUpdate", syncLabels);
  }

  function resizeWorld() {
    const rect = stage.getBoundingClientRect();
    width = Math.max(320, Math.floor(rect.width));
    height = Math.max(420, Math.floor(rect.height));
    currentX = currentX || width / 2;
    canvas.width = width * Math.min(window.devicePixelRatio || 1, 2);
    canvas.height = height * Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (render) {
      render.options.width = width;
      render.options.height = height;
      render.canvas.width = width * render.options.pixelRatio;
      render.canvas.height = height * render.options.pixelRatio;
      Matter.Render.setPixelRatio(render, render.options.pixelRatio);
    }

    rebuildWalls();
    updateDropGuide(currentX);
  }

  function rebuildWalls() {
    if (!engine) return;
    const { Bodies, Composite } = Matter;
    if (walls.length) Composite.remove(engine.world, walls);
    const thickness = 44;
    walls = [
      Bodies.rectangle(width / 2, height + thickness / 2 - 6, width + thickness * 2, thickness, wallOptions()),
      Bodies.rectangle(-thickness / 2 + 3, height / 2, thickness, height * 2, wallOptions()),
      Bodies.rectangle(width + thickness / 2 - 3, height / 2, thickness, height * 2, wallOptions())
    ];
    Composite.add(engine.world, walls);
  }

  function wallOptions() {
    return {
      isStatic: true,
      friction: 0.9,
      render: { fillStyle: "transparent" }
    };
  }

  function resetGame() {
    const { Composite } = Matter;
    if (engine) {
      labels.forEach((label) => label.remove());
      labels.clear();
      mergingPairs.clear();
      Composite.clear(engine.world, false);
      rebuildWalls();
    }
    effectLayer.innerHTML = "";
    totalProtein = 0;
    score = 0;
    isGameOver = false;
    canDrop = true;
    startedAt = new Date();
    currentX = width / 2;
    nextLevel = randomNextLevel();
    updateHud();
    updateNextPreview();
    updateDropGuide(currentX);
    hideModal(gameOverModal);
    hideModal(certificateModal);
  }

  function randomNextLevel() {
    const bag = [0, 0, 0, 1, 1, 2];
    return bag[Math.floor(Math.random() * bag.length)];
  }

  function dropFood(x) {
    if (!canDrop || isGameOver) return;
    canDrop = false;
    const level = nextLevel;
    const food = foods[level];
    const radius = scaledRadius(food.radius);
    const safeX = clamp(x, radius + 8, width - radius - 8);
    createFood(level, safeX, Math.max(24, radius + 8), radius);
    nextLevel = randomNextLevel();
    updateNextPreview();
    setTimeout(() => {
      canDrop = !isGameOver;
    }, DROP_COOLDOWN);
  }

  function createFood(level, x, y, forcedRadius) {
    const { Bodies, Composite } = Matter;
    const food = foods[level];
    const radius = forcedRadius || scaledRadius(food.radius);
    const body = Bodies.circle(x, y, radius, {
      restitution: 0.18,
      friction: 0.55,
      frictionAir: 0.012,
      density: 0.0018 + level * 0.00022,
      label: `food-${level}`,
      render: {
        fillStyle: food.color,
        strokeStyle: food.stroke,
        lineWidth: Math.max(3, radius * 0.08)
      }
    });
    body.plugin = { level, radius, foodId: cryptoId() };
    Composite.add(engine.world, body);
    labels.set(body.id, createFoodLabel(body, food));
    return body;
  }

  function createFoodLabel(body, food) {
    const label = document.createElement("div");
    label.className = "food-label";
    const radius = body.plugin.radius;
    label.style.width = `${radius * 1.82}px`;
    label.style.height = `${radius * 1.82}px`;
    label.style.fontSize = `${clamp(radius * 0.29, 11, 18)}px`;
    label.innerHTML = `
      <span class="food-art${food.product ? " product" : ""}" aria-hidden="true"></span>
      <span class="food-name">${food.short}</span>
    `;
    const art = label.querySelector(".food-art");
    art.style.backgroundImage = `url("${food.image}")`;
    effectLayer.appendChild(label);
    return label;
  }

  function syncLabels() {
    const bodies = Matter.Composite.allBodies(engine.world);
    const activeIds = new Set(bodies.map((body) => body.id));
    labels.forEach((label, id) => {
      if (!activeIds.has(id)) {
        label.remove();
        labels.delete(id);
      }
    });

    bodies.forEach((body) => {
      if (!body.plugin || body.plugin.level === undefined) return;
      const label = labels.get(body.id);
      if (!label) return;
      label.style.left = `${body.position.x}px`;
      label.style.top = `${body.position.y}px`;
      label.style.transform = `translate(-50%, -50%) rotate(${body.angle}rad)`;
    });

    checkGameOver(bodies);
  }

  function handleCollision(event) {
    event.pairs.forEach((pair) => {
      const a = pair.bodyA;
      const b = pair.bodyB;
      if (!isMergeable(a, b)) return;
      const level = a.plugin.level;
      const pairKey = [a.id, b.id].sort().join("-");
      if (mergingPairs.has(pairKey)) return;
      mergingPairs.add(pairKey);
      window.requestAnimationFrame(() => mergeBodies(a, b, level, pairKey));
    });
  }

  function isMergeable(a, b) {
    return a.plugin
      && b.plugin
      && a.plugin.level !== undefined
      && b.plugin.level !== undefined
      && a.plugin.level === b.plugin.level
      && a.plugin.level < MAX_LEVEL
      && !a.isRemoving
      && !b.isRemoving;
  }

  function mergeBodies(a, b, level, pairKey) {
    const bodies = Matter.Composite.allBodies(engine.world);
    if (!bodies.includes(a) || !bodies.includes(b)) {
      mergingPairs.delete(pairKey);
      return;
    }

    a.isRemoving = true;
    b.isRemoving = true;
    const x = (a.position.x + b.position.x) / 2;
    const y = (a.position.y + b.position.y) / 2;
    const next = level + 1;
    const food = foods[next];

    removeBody(a);
    removeBody(b);
    createFood(next, x, y);
    addProteinAndScore(food.protein, food.score);
    mergeEffects(x, y, foods[level].protein, next);
    mergingPairs.delete(pairKey);

    if (next === MAX_LEVEL) {
      ultimateEffects();
    }
  }

  function removeBody(body) {
    const label = labels.get(body.id);
    if (label) {
      label.remove();
      labels.delete(body.id);
    }
    Matter.Composite.remove(engine.world, body);
  }

  function addProteinAndScore(protein, points) {
    totalProtein += protein;
    score += points;
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem(BEST_KEY, String(bestScore));
    }
    updateHud();
  }

  function updateHud() {
    proteinValue.textContent = `${totalProtein}g`;
    scoreValue.textContent = String(score);
    bestValue.textContent = String(bestScore);
  }

  function updateNextPreview() {
    const food = foods[nextLevel];
    nextIcon.innerHTML = `<span class="food-art${food.product ? " product" : ""}" aria-hidden="true"></span>`;
    const art = nextIcon.querySelector(".food-art");
    art.style.backgroundImage = `url("${food.image}")`;
  }

  function mergeEffects(x, y, protein, nextLevelValue) {
    flashRing(x, y, scaledRadius(foods[nextLevelValue].radius) * 2);
    particles(x, y, 24);
    floatText(x, y, `+${protein}g Protein`);
  }

  function flashRing(x, y, size) {
    const ring = document.createElement("div");
    ring.className = "flash-ring";
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    effectLayer.appendChild(ring);
    ring.addEventListener("animationend", () => ring.remove(), { once: true });
  }

  function particles(x, y, amount, fullScreen = false) {
    const colors = ["#f8c845", "#fff8df", "#b9483f"];
    for (let i = 0; i < amount; i += 1) {
      const dot = document.createElement("i");
      dot.className = "particle";
      const originX = fullScreen ? Math.random() * width : x;
      const originY = fullScreen ? Math.random() * height : y;
      const angle = Math.random() * Math.PI * 2;
      const distance = (fullScreen ? 80 : 42) + Math.random() * (fullScreen ? 170 : 78);
      dot.style.left = `${originX}px`;
      dot.style.top = `${originY}px`;
      dot.style.background = colors[Math.floor(Math.random() * colors.length)];
      dot.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
      dot.style.setProperty("--ty", `${Math.sin(angle) * distance}px`);
      dot.style.width = `${6 + Math.random() * 9}px`;
      dot.style.height = dot.style.width;
      effectLayer.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove(), { once: true });
    }
  }

  function floatText(x, y, text) {
    const item = document.createElement("div");
    item.className = "float-text";
    item.textContent = text;
    item.style.left = `${x}px`;
    item.style.top = `${y}px`;
    effectLayer.appendChild(item);
    item.addEventListener("animationend", () => item.remove(), { once: true });
  }

  function ultimateEffects() {
    particles(width / 2, height / 2, 120, true);
    document.body.classList.add("shake");
    setTimeout(() => document.body.classList.remove("shake"), 480);

    const trophy = document.createElement("div");
    trophy.className = "trophy";
    trophy.textContent = "🏆";
    effectLayer.appendChild(trophy);
    trophy.addEventListener("animationend", () => trophy.remove(), { once: true });

    const title = document.createElement("div");
    title.className = "burst-title";
    title.textContent = "蛋白质大爆发！";
    effectLayer.appendChild(title);
    title.addEventListener("animationend", () => title.remove(), { once: true });

    const claim = document.createElement("div");
    claim.className = "burst-claim";
    claim.textContent = "1片≈1.5杯牛奶蛋白质";
    effectLayer.appendChild(claim);
    claim.addEventListener("animationend", () => claim.remove(), { once: true });
  }

  function checkGameOver(bodies) {
    if (isGameOver || bodies.length < 14) return;
    const dangerLine = Math.max(88, height * 0.14);
    const crowded = bodies.some((body) => {
      if (!body.plugin || body.speed > 0.7) return false;
      return body.position.y - body.plugin.radius < dangerLine;
    });

    if (!crowded) return;
    isGameOver = true;
    canDrop = false;
    setTimeout(() => {
      saveRank();
      updateCertificate();
      $("#gameOverText").textContent = `${nickname} 合成了 ${totalProtein}g 蛋白质，得分 ${score}。`;
      showModal(gameOverModal);
    }, 650);
  }

  function saveRank() {
    const ranks = getRanks();
    ranks.push({
      nickname,
      protein: totalProtein,
      score,
      time: formatTime(new Date())
    });
    ranks.sort((a, b) => b.score - a.score || b.protein - a.protein);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ranks.slice(0, 10)));
  }

  function getRanks() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function renderRanks() {
    const ranks = getRanks();
    rankList.innerHTML = "";
    if (!ranks.length) {
      const empty = document.createElement("li");
      empty.innerHTML = `<span class="rank-index">-</span><div><div class="rank-name">暂无记录</div><div class="rank-meta">完成一次挑战后会自动上榜</div></div><strong class="rank-score">0</strong>`;
      rankList.appendChild(empty);
      return;
    }

    ranks.forEach((rank, index) => {
      const item = document.createElement("li");
      item.innerHTML = `
        <span class="rank-index">${index + 1}</span>
        <div>
          <div class="rank-name">${escapeHtml(rank.nickname)}</div>
          <div class="rank-meta">${rank.protein}g Protein · ${escapeHtml(rank.time)}</div>
        </div>
        <strong class="rank-score">${rank.score}</strong>
      `;
      rankList.appendChild(item);
    });
  }

  function updateCertificate() {
    $("#certName").textContent = nickname;
    $("#certProtein").textContent = `${totalProtein}g`;
    $("#certScore").textContent = String(score);
    $("#certTime").textContent = `${formatTime(startedAt)} - ${formatTime(new Date())}`;
  }

  async function saveCertificate() {
    updateCertificate();
    try {
      const card = $("#certificateCard");
      const snapshot = await window.html2canvas(card, {
        backgroundColor: null,
        scale: Math.min(window.devicePixelRatio || 2, 3)
      });
      const link = document.createElement("a");
      link.download = `豪士蛋白质认证证书-${nickname}.png`;
      link.href = snapshot.toDataURL("image/png");
      link.click();
      showToast("证书 PNG 已生成。");
    } catch (error) {
      showToast("保存失败，请稍后再试。");
    }
  }

  function updateDropGuide(x) {
    currentX = clamp(x, 12, width - 12);
    dropGuide.style.left = `${currentX}px`;
  }

  function pointerX(event) {
    const point = event.touches ? event.touches[0] : event;
    const rect = stage.getBoundingClientRect();
    return point.clientX - rect.left;
  }

  function scaledRadius(radius) {
    const scale = clamp(width / 390, 0.82, 1.16);
    return Math.round(radius * scale);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cryptoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function formatTime(date) {
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function showModal(modal) {
    modal.classList.add("show");
  }

  function hideModal(modal) {
    modal.classList.remove("show");
  }

  function showToast(text) {
    toastMessage.textContent = text;
    toastMessage.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toastMessage.classList.remove("show"), 1800);
  }

  function bindEvents() {
    stage.addEventListener("pointermove", (event) => updateDropGuide(pointerX(event)));
    stage.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const x = pointerX(event);
      updateDropGuide(x);
      dropFood(x);
    });

    window.addEventListener("resize", () => {
      window.requestAnimationFrame(resizeWorld);
    });

    $("#startButton").addEventListener("click", () => {
      const input = $("#nicknameInput").value.trim();
      nickname = input || "蛋白质工程师";
      hideModal(nicknameModal);
      resetGame();
    });

    $("#restartButton").addEventListener("click", () => {
      saveRank();
      resetGame();
    });

    $("#againButton").addEventListener("click", resetGame);
    $("#rankButton").addEventListener("click", () => {
      renderRanks();
      showModal(rankModal);
    });
    $("#closeRankButton").addEventListener("click", () => hideModal(rankModal));
    $("#certificateButton").addEventListener("click", () => {
      updateCertificate();
      showModal(certificateModal);
    });
    $("#closeCertificateButton").addEventListener("click", () => hideModal(certificateModal));
    $("#saveCertificateButton").addEventListener("click", saveCertificate);
  }

  function boot() {
    updateHud();
    if (!requireLibraries()) return;
    resizeWorld();
    initMatter();
    bindEvents();
    resetGame();
    showModal(nicknameModal);
  }

  window.addEventListener("load", boot);
})();
