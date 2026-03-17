// ===== Canvas Setup =====
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GAME_W = 600;
const GAME_H = 700;
canvas.width = GAME_W;
canvas.height = GAME_H;

// ===== DOM References =====
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const uiOverlay = document.getElementById('ui-overlay');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const finalScoreEl = document.getElementById('final-score');
const finalHighEl = document.getElementById('final-high-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

// ===== Game State =====
let state = 'menu'; // menu | playing | gameover
let score = 0;
let highScore = parseInt(localStorage.getItem('ballDodgeHigh') || '0', 10);
let difficulty = 1;
let frameCount = 0;
let shakeTimer = 0;
let particles = [];
let stars = [];
let trailParticles = [];
let globalDifficulty = 1;

// ===== Ball Color System =====
const BALL_COLORS = [
  { name: 'Gold', color: '#f5c842', glow: 'rgba(245,200,66,0.4)', highlight: '#ffe88a', shadow: '#c9961a', unlock: 0 },
  { name: 'Cyan', color: '#42daf5', glow: 'rgba(66,218,245,0.4)', highlight: '#9aefff', shadow: '#2098b5', unlock: 0 },
  { name: 'Crimson', color: '#ff4455', glow: 'rgba(255, 19, 38, 0.4)', highlight: '#ff9b9bff', shadow: '#a81322ff', unlock: 50 },
  { name: 'Emerald', color: '#3ddc84', glow: 'rgba(61,220,132,0.4)', highlight: '#8aefb8', shadow: '#00b957c9', unlock: 100 },
  { name: 'Violet', color: '#9a2effff', glow: 'rgba(168,85,247,0.4)', highlight: '#d4a5ff', shadow: '#6b21a8', unlock: 250 },
  //{ name: 'Hot Pink', color: '#ff3daa', glow: 'rgba(255,61,170,0.4)', highlight: '#ff8ad4', shadow: '#b82080', unlock: 200 },
  { name: 'Ice White', color: '#e0f0ff', glow: 'rgba(224,240,255,0.4)', highlight: '#ffffff', shadow: '#a9cde4ff', unlock: 500 },
  { name: 'Obsidian', color: '#4a4a5a', glow: 'rgba(100,100,130,0.5)', highlight: '#8888a0', shadow: '#1a1a2a', unlock: 1000 },
];
let selectedColorIndex = parseInt(localStorage.getItem('ballDodgeColor') || '0', 10);

function applyBallColor(index) {
  const c = BALL_COLORS[index];
  if (!c) return;
  player.color = c.color;
  player.glowColor = c.glow;
  player._highlight = c.highlight;
  player._shadow = c.shadow;
}

// ===== Powerup System =====
// Registry — add new powerups by pushing to this array.
// Each entry: { name, icon (emoji), duration (frames, 0=instant/permanent), color, glowColor,
//   onCollect(activeEffects), onTick(activeEffects, player), onEnd(player) }
const POWERUP_TYPES = [
  {
    name: 'speed',
    icon: '⚡',
    duration: 480,            // ~8 seconds at 60fps
    color: '#ffaa00',
    glowColor: 'rgba(255,170,0,0.6)',
    onCollect(fx) { /* handled by onTick */ },
    onTick(fx, p) { p.maxSpeed = 9; p.accel = 0.45; },
    onEnd(p) { p.maxSpeed = 5; p.accel = 0.25; },
  },
  {
    name: 'invulnerable',
    icon: '👻',
    duration: 480,
    color: '#c0e8ff',
    glowColor: 'rgba(192,232,255,0.5)',
    onCollect(fx) { /* flag checked in collision */ },
    onTick() { },
    onEnd() { },
  },
  {
    name: 'shield',
    icon: '🛡️',
    duration: 0,              // 0 = lasts until consumed
    color: '#5e9eff',
    glowColor: 'rgba(94,158,255,0.6)',
    onCollect(fx) { fx.shieldHits = (fx.shieldHits || 0) + 1; },
    onTick() { },
    onEnd() { },
  },
];

let powerups = [];            // on-screen orbs
let activeEffects = {};       // { effectName: { type, timer } }
let powerupSpawnTimer = 0;
const POWERUP_SPAWN_MIN = 360; // 6-10 seconds at 60fps
const POWERUP_SPAWN_MAX = 600;
let nextPowerupSpawn = 400;

// ===== Input =====
const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// ===== Player =====
const player = {
  x: GAME_W / 2,
  y: GAME_H - 55,
  radius: 20,
  speed: 0,
  maxSpeed: 5,
  accel: 0.25,
  friction: 0.9,
  color: '#f5c842',
  glowColor: 'rgba(245, 200, 66, 0.4)',
  rollAngle: 0,
};

// ===== Falling Objects =====
let obstacles = [];

const OBSTACLE_TYPES = [
  { name: 'rock', minR: 12, maxR: 22, color: '#ff6f61', glow: 'rgba(255,111,97,0.5)', weight: 5 },
  { name: 'crystal', minR: 10, maxR: 16, color: '#6e3cff', glow: 'rgba(110,60,255,0.5)', weight: 3 },
  { name: 'meteor', minR: 18, maxR: 30, color: '#ff3d3d', glow: 'rgba(255,61,61,0.6)', weight: 1 },
  { name: 'ice', minR: 8, maxR: 14, color: '#42daf5', glow: 'rgba(66,218,245,0.5)', weight: 6 },
];

function weightedRandom(types) {
  const totalWeight = types.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * totalWeight;
  for (const t of types) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return types[0];
}

function spawnObstacle() {
  const type = weightedRandom(OBSTACLE_TYPES);
  const radius = type.minR + Math.random() * (type.maxR - type.minR);
  obstacles.push({
    x: radius + Math.random() * (GAME_W - radius * 2),
    y: -radius * 2,
    radius,
    speed: 2.2 + Math.random() * 1.5 + (1 + 1/difficulty) * 0.35,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.08,
    type,
  });
}

// ===== Stars (background) =====
function initStars() {
  stars = [];
  for (let i = 0; i < 100; i++) {
    const size = 0.5 + Math.random() * 1.8;
    stars.push({
      x: Math.random() * GAME_W,
      y: Math.random() * GAME_H,
      size,
      alpha: 0.2 + Math.random() * 0.6,
      twinkleSpeed: 0.005 + Math.random() * 0.02,
      twinklePhase: Math.random() * Math.PI * 2,
      speed: 0.15 + size * 0.35,   // parallax: bigger = closer = faster
    });
  }
}
initStars();

// ===== Background Themes (cycle every 100 score) =====
const BG_THEMES = [
  { top: '#0a0a2e', mid: '#0f1035', bot: '#1a1a3e', ground: '110,60,255' },  // deep purple
  { top: '#1a0a1a', mid: '#2d0f2d', bot: '#3e1a3e', ground: '200,60,255' },  // neon violet
  { top: '#0a0a1a', mid: '#10102d', bot: '#1a1a3e', ground: '60,120,255' },  // ocean
  { top: '#0a1a0f', mid: '#0f2d18', bot: '#1a3e22', ground: '60,255,110' },  // emerald
  { top: '#1a0a0a', mid: '#2d0f10', bot: '#3e1a1a', ground: '255,60,60' },  // crimson
  { top: '#1a1a0a', mid: '#2d2d0f', bot: '#3e3e1a', ground: '255,200,60' },  // gold
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function lerpColor(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return rgbToHex(
    Math.round(ca[0] + (cb[0] - ca[0]) * t),
    Math.round(ca[1] + (cb[1] - ca[1]) * t),
    Math.round(ca[2] + (cb[2] - ca[2]) * t),
  );
}
function lerpRgbStr(a, b, t) {
  const pa = a.split(',').map(Number), pb = b.split(',').map(Number);
  return [
    Math.round(pa[0] + (pb[0] - pa[0]) * t),
    Math.round(pa[1] + (pb[1] - pa[1]) * t),
    Math.round(pa[2] + (pb[2] - pa[2]) * t),
  ].join(',');
}

// ===== Particles =====
function spawnExplosion(x, y, color, count = 24) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + Math.random() * 0.3;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 3,
      color,
      alpha: 1,
      decay: 0.015 + Math.random() * 0.02,
    });
  }
}

function spawnTrail(x, y) {
  trailParticles.push({
    x: x + (Math.random() - 0.5) * 8,
    y: y + player.radius * 0.6,
    radius: 2 + Math.random() * 3,
    alpha: 0.5 + Math.random() * 0.3,
    decay: 0.025 + Math.random() * 0.015,
    color: player.color,
  });
}

// ===== Drawing Helpers =====
function drawBackground() {
  // Determine current and next theme
  const themeIndex = Math.floor(score / 100) % BG_THEMES.length;
  const nextIndex = (themeIndex + 1) % BG_THEMES.length;
  const blend = (score % 100) / 100;  // 0..1 transition within the 100-score window
  // Smooth ease curve for the first 30 points of each century
  const t = Math.min(blend * (100 / 30), 1); // transition happens over first 30 score of each 100
  const eased = t * t * (3 - 2 * t); // smoothstep

  const curr = BG_THEMES[themeIndex];
  const next = BG_THEMES[nextIndex];

  const cTop = lerpColor(curr.top, next.top, eased);
  const cMid = lerpColor(curr.mid, next.mid, eased);
  const cBot = lerpColor(curr.bot, next.bot, eased);
  const cGround = lerpRgbStr(curr.ground, next.ground, eased);

  // Gradient sky
  const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
  grad.addColorStop(0, cTop);
  grad.addColorStop(0.5, cMid);
  grad.addColorStop(1, cBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Scrolling stars with parallax
  const scrollMult = state === 'playing' ? 1 : 0.3; // slow scroll on menu
  for (const s of stars) {
    s.twinklePhase += s.twinkleSpeed;
    s.y += s.speed * scrollMult;
    if (s.y > GAME_H + s.size) {
      s.y = -s.size;
      s.x = Math.random() * GAME_W;
    }
    const alpha = s.alpha * (0.5 + 0.5 * Math.sin(s.twinklePhase));
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fill();
  }

  // Ground line
  const gy = GAME_H - 25;
  const groundGrad = ctx.createLinearGradient(0, gy, GAME_W, gy);
  groundGrad.addColorStop(0, `rgba(${cGround},0)`);
  groundGrad.addColorStop(0.5, `rgba(${cGround},0.35)`);
  groundGrad.addColorStop(1, `rgba(${cGround},0)`);
  ctx.strokeStyle = groundGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, gy);
  ctx.lineTo(GAME_W, gy);
  ctx.stroke();
}

function drawPlayer() {
  const p = player;

  // Shield ring (if shield active)
  if (activeEffects.shield) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius + 8, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(94,158,255,${0.5 + 0.3 * Math.sin(frameCount * 0.08)})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(94,158,255,0.7)';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.restore();
  }

  // Ghost effect (invulnerability)
  const isGhost = !!activeEffects.invulnerable;
  if (isGhost) {
    // Flickering transparency
    const flicker = 0.28 + 0.15 * Math.sin(frameCount * 0.18) + 0.08 * Math.sin(frameCount * 0.47);
    ctx.globalAlpha = flicker;

    // Ghostly afterimage trail
    ctx.save();
    ctx.globalAlpha = flicker * 0.15;
    ctx.beginPath();
    ctx.arc(p.x - p.speed * 3, p.y, p.radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(192,232,255,0.5)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x - p.speed * 6, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(192,232,255,0.3)';
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = flicker;
  }

  // Glow
  ctx.save();
  const activeTimedEffect = activeEffects.speed || activeEffects.invulnerable;
  if (isGhost) {
    ctx.shadowColor = 'rgba(192,232,255,0.6)';
  } else {
    ctx.shadowColor = activeTimedEffect ? activeTimedEffect.type.glowColor : p.glowColor;
  }
  ctx.shadowBlur = isGhost ? 36 : 28;

  // Ball body
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  if (isGhost) {
    // Spectral blueish ball
    const ghostGrad = ctx.createRadialGradient(p.x - 5, p.y - 6, 2, p.x, p.y, p.radius);
    ghostGrad.addColorStop(0, '#e8f4ff');
    ghostGrad.addColorStop(0.6, '#8ec8e8');
    ghostGrad.addColorStop(1, '#5a9ab5');
    ctx.fillStyle = ghostGrad;
  } else {
    const ballGrad = ctx.createRadialGradient(p.x - 5, p.y - 6, 2, p.x, p.y, p.radius);
    ballGrad.addColorStop(0, p._highlight || '#ffe88a');
    ballGrad.addColorStop(0.6, p.color);
    ballGrad.addColorStop(1, p._shadow || '#c9961a');
    ctx.fillStyle = ballGrad;
  }
  ctx.fill();

  // Rolling line (visual indicator)
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rollAngle);
  ctx.beginPath();
  ctx.moveTo(-p.radius * 0.6, 0);
  ctx.lineTo(p.radius * 0.6, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Cross line
  ctx.beginPath();
  ctx.moveTo(0, -p.radius * 0.6);
  ctx.lineTo(0, p.radius * 0.6);
  ctx.stroke();
  ctx.restore();

  // Reset alpha after ghost
  if (isGhost) ctx.globalAlpha = 1;

  ctx.restore();
}

// ===== Powerup Drawing =====
function drawPowerup(pu) {
  ctx.save();
  const pulse = 0.85 + 0.15 * Math.sin(frameCount * 0.1 + pu.phase);
  const r = pu.radius * pulse;

  // Outer glow
  ctx.shadowColor = pu.type.glowColor;
  ctx.shadowBlur = 24;

  // Orb body
  ctx.beginPath();
  ctx.arc(pu.x, pu.y, r, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(pu.x - 2, pu.y - 3, 1, pu.x, pu.y, r);
  grad.addColorStop(0, '#fff4e0');
  grad.addColorStop(0.45, pu.type.color);
  grad.addColorStop(1, '#cc7700');
  ctx.fillStyle = grad;
  ctx.fill();

  // Icon
  ctx.shadowBlur = 0;
  ctx.font = `${Math.round(r * 1.1)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pu.type.icon, pu.x, pu.y + 1);

  ctx.restore();
}

function drawPowerupHUD() {
  let x = GAME_W / 2;
  const y = 50;
  const entries = Object.values(activeEffects).filter(fx => fx && fx.type);
  if (entries.length === 0) return;

  const totalW = entries.length * 60;
  let sx = x - totalW / 2 + 30;

  for (const fx of entries) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fx.type.icon, sx, y);

    // Timer bar (skip for permanent effects like shield)
    if (fx.type.duration > 0) {
      const pct = fx.timer / fx.type.duration;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(sx - 16, y + 14, 32, 4);
      ctx.fillStyle = fx.type.color;
      ctx.fillRect(sx - 16, y + 14, 32 * pct, 4);
    } else if (fx.type.name === 'shield') {
      // Show hit count
      ctx.font = '11px Outfit, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`x${activeEffects.shieldHits || 0}`, sx, y + 18);
    }

    ctx.restore();
    sx += 60;
  }
}

function drawObstacle(ob) {
  ctx.save();
  ctx.translate(ob.x, ob.y);
  ctx.rotate(ob.rotation);

  ctx.shadowColor = ob.type.glow;
  ctx.shadowBlur = 18;

  if (ob.type.name === 'crystal') {
    // Diamond shape
    const r = ob.radius;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.7, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.7, 0);
    ctx.closePath();
    const cGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, r);
    cGrad.addColorStop(0, '#b88aff');
    cGrad.addColorStop(1, ob.type.color);
    ctx.fillStyle = cGrad;
    ctx.fill();
  } else if (ob.type.name === 'meteor') {
    // Spiky circle
    const r = ob.radius;
    const spikes = 7;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const angle = (Math.PI / spikes) * i;
      const rad = i % 2 === 0 ? r : r * 0.6;
      ctx.lineTo(Math.cos(angle) * rad, Math.sin(angle) * rad);
    }
    ctx.closePath();
    const mGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
    mGrad.addColorStop(0, '#ff9a3d');
    mGrad.addColorStop(1, ob.type.color);
    ctx.fillStyle = mGrad;
    ctx.fill();
  } else {
    // Circle (rock / ice)
    ctx.beginPath();
    ctx.arc(0, 0, ob.radius, 0, Math.PI * 2);
    const rGrad = ctx.createRadialGradient(-2, -3, 1, 0, 0, ob.radius);
    rGrad.addColorStop(0, ob.type.name === 'ice' ? '#9aefff' : '#ff9a8a');
    rGrad.addColorStop(1, ob.type.color);
    ctx.fillStyle = rGrad;
    ctx.fill();
  }

  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color.replace(')', `, ${p.alpha})`).replace('rgb', 'rgba');
    // Fallback for hex colors
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (const t of trailParticles) {
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
    ctx.globalAlpha = t.alpha * 0.4;
    ctx.fillStyle = t.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ===== Update Logic =====
function updatePlayer() {
  const p = player;
  if (keys['a'] || keys['arrowleft']) {
    p.speed -= p.accel;
  }
  if (keys['d'] || keys['arrowright']) {
    p.speed += p.accel;
  }

  p.speed *= p.friction;
  if (Math.abs(p.speed) < 0.1) p.speed = 0;
  p.speed = Math.max(-p.maxSpeed, Math.min(p.maxSpeed, p.speed));

  p.x += p.speed;

  // Bounds
  if (p.x - p.radius < 0) { p.x = p.radius; p.speed = 0; }
  if (p.x + p.radius > GAME_W) { p.x = GAME_W - p.radius; p.speed = 0; }

  // Roll animation
  p.rollAngle += p.speed * 0.06;

  // Trail particles when moving
  if (Math.abs(p.speed) > 1.5 && frameCount % 2 === 0) {
    spawnTrail(p.x, p.y);
  }
}

function updateObstacles() {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const ob = obstacles[i];
    ob.y += ob.speed;
    ob.rotation += ob.rotSpeed;

    // Off-screen
    if (ob.y - ob.radius > GAME_H) {
      obstacles.splice(i, 1);
      score++;
      scoreEl.textContent = score;
      continue;
    }

    // Collision with player
    const dx = ob.x - player.x;
    const dy = ob.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < ob.radius + player.radius - 4) {
      // Invulnerable — destroy obstacle, no damage
      if (activeEffects.invulnerable) {
        //spawnExplosion(ob.x, ob.y, ob.type.color, 16);
        //obstacles.splice(i, 1);
        score++;
        scoreEl.textContent = score;
        continue;
      }

      // Shield — absorb one hit
      if (activeEffects.shieldHits && activeEffects.shieldHits > 0) {
        activeEffects.shieldHits--;
        spawnExplosion(ob.x, ob.y, '#5e9eff', 20);
        obstacles.splice(i, 1);
        shakeTimer = 6;
        if (activeEffects.shieldHits <= 0) {
          delete activeEffects.shield;
          delete activeEffects.shieldHits;
        }
        continue;
      }

      // Hit!
      spawnExplosion(player.x, player.y, player.color, 30);
      spawnExplosion(ob.x, ob.y, ob.type.color, 16);
      shakeTimer = 14;
      gameOver();
      return;
    }
  }
}

// ===== Powerup Spawning & Update =====
function spawnPowerup() {
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  const radius = 14;
  powerups.push({
    x: radius + Math.random() * (GAME_W - radius * 2),
    y: -radius * 2,
    radius,
    speed: 1.6 + Math.random() * 0.8,
    type,
    phase: Math.random() * Math.PI * 2,
  });
}

function updatePowerups() {
  // Spawn timer
  powerupSpawnTimer++;
  if (powerupSpawnTimer >= nextPowerupSpawn) {
    powerupSpawnTimer = 0;
    nextPowerupSpawn = POWERUP_SPAWN_MIN + Math.floor(Math.random() * (POWERUP_SPAWN_MAX - POWERUP_SPAWN_MIN));
    spawnPowerup();
  }

  // Move & collect
  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    pu.y += pu.speed;

    // Off-screen
    if (pu.y - pu.radius > GAME_H) {
      powerups.splice(i, 1);
      continue;
    }

    // Collision with player
    const dx = pu.x - player.x;
    const dy = pu.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < pu.radius + player.radius) {
      collectPowerup(pu);
      powerups.splice(i, 1);
    }
  }
}

function collectPowerup(pu) {
  const t = pu.type;
  spawnExplosion(pu.x, pu.y, t.color, 18);

  // Apply
  t.onCollect(activeEffects);

  if (t.duration > 0) {
    // Timed effect — reset timer if re-collected
    activeEffects[t.name] = { type: t, timer: t.duration };
  } else {
    // Permanent / instant (shield)
    activeEffects[t.name] = { type: t, timer: 0 };
  }
}

function updateActiveEffects() {
  for (const key of Object.keys(activeEffects)) {
    if (key === 'shieldHits') continue;  // helper field, not an effect entry
    const fx = activeEffects[key];
    if (!fx || !fx.type) continue;

    fx.type.onTick(activeEffects, player);

    if (fx.type.duration > 0) {
      fx.timer--;
      if (fx.timer <= 0) {
        fx.type.onEnd(player);
        delete activeEffects[key];
      }
    }
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08; // gravity
    p.alpha -= p.decay;
    p.radius *= 0.98;
    if (p.alpha <= 0) particles.splice(i, 1);
  }

  for (let i = trailParticles.length - 1; i >= 0; i--) {
    const t = trailParticles[i];
    t.alpha -= t.decay;
    t.radius *= 0.95;
    if (t.alpha <= 0) trailParticles.splice(i, 1);
  }
}

function updateDifficulty() {
  if (globalDifficulty) {
    difficulty = globalDifficulty + score * 0.04;
    return;
  }
  //difficulty = 1 + score * 0.04;
}

// ===== Spawn Timer =====
let spawnInterval = 45;
let spawnCounter = 0;

function updateSpawning() {
  spawnInterval = Math.max(12, 45 - Math.floor(difficulty));
  spawnCounter++;
  if (spawnCounter >= spawnInterval) {
    spawnCounter = 0;
    // Spawn 1 or sometimes 2
    spawnObstacle();
    if (difficulty > 3 && Math.random() < 0.3) spawnObstacle();
    if (difficulty > 10 && Math.random() < 0.01) spawnObstacle();
  }
}

// ===== Game Loop =====
const TARGET_FPS = 60;
const FRAME_DURATION = 1000 / TARGET_FPS;
let lastFrameTime = 0;

function gameLoop(timestamp) {
  const elapsed = timestamp - lastFrameTime;
  if (elapsed < FRAME_DURATION) {
    requestAnimationFrame(gameLoop);
    return;
  }
  lastFrameTime = timestamp - (elapsed % FRAME_DURATION);

  frameCount++;

  if (state === 'playing') {
    updatePlayer();
    updateSpawning();
    updateObstacles();
    updatePowerups();
    updateActiveEffects();
    updateDifficulty();
  }
  updateParticles();

  // Screen shake
  ctx.save();
  if (shakeTimer > 0) {
    shakeTimer--;
    const sx = (Math.random() - 0.5) * shakeTimer * 1.2;
    const sy = (Math.random() - 0.5) * shakeTimer * 1.2;
    ctx.translate(sx, sy);
  }

  drawBackground();

  if (state === 'playing' || state === 'gameover') {
    drawParticles();
    for (const ob of obstacles) drawObstacle(ob);
    for (const pu of powerups) drawPowerup(pu);
    if (state === 'playing') {
      drawPlayer();
      drawPowerupHUD();
    }
  } else {
    // Menu — still render stars via drawBackground
    drawParticles();
  }

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

// ===== State Management =====
function startGame() {
  state = 'playing';
  score = 0;
  difficulty = 1;
  frameCount = 0;
  spawnCounter = 0;
  obstacles = [];
  particles = [];
  trailParticles = [];
  powerups = [];
  activeEffects = {};
  powerupSpawnTimer = 0;
  nextPowerupSpawn = 200;
  player.x = GAME_W / 2;
  player.speed = 0;
  player.maxSpeed = 5;
  player.accel = 0.25;
  player.rollAngle = 0;
  applyBallColor(selectedColorIndex);

  scoreEl.textContent = '0';
  highScoreEl.textContent = highScore;

  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  uiOverlay.classList.add('visible');
}

function gameOver() {
  state = 'gameover';
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('ballDodgeHigh', highScore);
  }
  finalScoreEl.textContent = score;
  finalHighEl.textContent = highScore;
  uiOverlay.classList.remove('visible');
  buildColorPickers(); // refresh unlocks

  setTimeout(() => {
    gameOverScreen.classList.remove('hidden');
  }, 600);
}

// ===== Ball Color Picker =====
function buildColorPickers() {
  document.querySelectorAll('.color-picker').forEach(container => {
    container.innerHTML = '';
    BALL_COLORS.forEach((c, i) => {
      const swatch = document.createElement('button');
      swatch.className = 'color-swatch';
      swatch.style.setProperty('--swatch-color', c.color);
      swatch.style.setProperty('--swatch-glow', c.glow);

      const isUnlocked = highScore >= c.unlock;
      if (!isUnlocked) {
        swatch.classList.add('locked');
        swatch.setAttribute('data-tooltip', `This design unlocks when you reach ${c.unlock} high score`);
      } else {
        swatch.title = c.name;
      }
      if (i === selectedColorIndex) swatch.classList.add('selected');

      swatch.addEventListener('click', () => {
        if (!isUnlocked) return;
        selectedColorIndex = i;
        localStorage.setItem('ballDodgeColor', i);
        applyBallColor(i);
        buildColorPickers(); // refresh selection state
      });

      container.appendChild(swatch);
    });
  });
}

// ===== Event Listeners =====
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
const difficultySelect = document.getElementById('difficulty-select');
difficultySelect.addEventListener('change', () => {
  globalDifficulty = parseInt(difficultySelect.value, 10);
  startGame();
});

window.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Enter') {
    if (state === 'menu') startGame();
    else if (state === 'gameover') startGame();
  }
});

// ===== Init =====
highScoreEl.textContent = highScore;
applyBallColor(selectedColorIndex);
buildColorPickers();
gameLoop();
