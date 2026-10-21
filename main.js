import * as THREE from 'three';
import { Player } from './player.js';
import { Zombie } from './zombie.js';
import { HUD } from './hud.js';
import { MapBuilder } from './mapbuilder.js';
import { PowerUp } from './interactables.js';
import { getMap, allMapIds, MAPS } from './maps.js';
import { getWeapon } from './weapons.js';
import { loadManifest } from './assets.js';

const input = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, crouch: false, fire: false, reload: false, interact: false, swapWeapon: false };
const keysJustPressed = new Set();

class GameManager {
  constructor(scene, hud) {
    this.scene = scene;
    this.hud = hud;
    this.player = null;
    this.mapId = null;
    this.mapData = null;
    this.round = 0;
    this.points = 500;
    this.zombies = [];
    this.powerUps = [];
    this.powerOn = false;
    this.papReady = false;
    this.roundActive = false;
    this.zombiesToSpawn = 0;
    this.killedThisRound = 0;
    this.totalThisRound = 0;
    this.specialRound = false;
    this.spawnPoints = [];
    this.mapBuilder = null;
    this.spawnTimer = 0;
    this.ended = false;
  }

  async start(mapId) {
    this.mapId = mapId;
    this.mapData = getMap(mapId);
    this.round = 0;
    this.points = 500;
    this.powerOn = !this.mapData.power;
    this.papReady = !this.mapData.pap;
    this.mapBuilder = new MapBuilder(this.scene);
    const anchors = await this.mapBuilder.build(mapId, null, this);
    this.spawnPoints = anchors.spawns;

    this.player = new Player(this.scene, window.__camera, this);
    this.player.group.position.set(0, 1.2, 0);

    this.hud.show();
    this.onPointsChanged();
    this.onWeaponChanged(getWeapon(this.player.weapons[this.player.currentIndex]));
    this.onAmmoChanged(this.player.magAmmo, this.player.reserveAmmo);
    this.onHealthChanged(this.player.health);
    this.onPerksChanged(this.player.perks);

    this.nextRound();
  }

  nextRound() {
    if (this.ended) return;
    this.round += 1;
    this.roundActive = true;
    this.killedThisRound = 0;
    this.totalThisRound = this._totalForRound(this.round);
    this.zombiesToSpawn = this.totalThisRound;
    this.specialRound = this._isSpecialRound(this.round);
    this.spawnTimer = 0;
    this.hud.setRound(this.round);
    this._spawnWave();
  }

  _isSpecialRound(r) {
    if (this.mapData.hellhounds && r % 5 === 0) return true;
    if (this.mapData.special.includes('space_monkeys') && r % 6 === 0) return true;
    return false;
  }

  _totalForRound(r) {
    if (r <= 9) return Math.min(24, 6 + (r - 1) * 2);
    return 24 + (r - 9) * 4;
  }

  _maxAlive() {
    return Math.min(24, this.totalThisRound);
  }

  _zombieHealth() {
    if (this.round <= 9) return 150 + (this.round - 1) * 100;
    return 950 + (this.round - 9) * 150;
  }

  _zombieSpeed() {
    if (this.round < 3) return 1.4;
    if (this.round < 6) return 2.0;
    if (this.round < 10) return 3.0;
    return 3.8;
  }

  _spawnWave() {
    const alive = this.zombies.filter(z => z.alive).length;
    const toSpawn = Math.min(6, this._maxAlive() - alive, this.zombiesToSpawn);
    for (let i = 0; i < toSpawn; i++) this._spawnOne();
  }

  _spawnOne() {
    if (this.spawnPoints.length === 0) return;
    const sp = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
    const type = this.specialRound
      ? (this.mapData.hellhounds ? 'hellhound' : 'monkey')
      : 'normal';
    const z = new Zombie(this.scene, sp, this._zombieHealth(), this._zombieSpeed(), type, this.player, this);
    if (this.specialRound) { z.health *= 2; z.speed *= 1.5; }
    this.zombies.push(z);
    this.zombiesToSpawn -= 1;
  }

  update(dt) {
    if (!this.player || this.ended) return;
    const shootTargets = [];
    for (const z of this.zombies) if (z.alive) shootTargets.push(z.group);
    this.player.update(dt, input, this.mapBuilder.colliders, shootTargets);
    for (const z of this.zombies) z.update(dt, this.zombies, this.mapBuilder.colliders);
    for (const p of [...this.powerUps]) p.update(dt, this.player);

    this.spawnTimer += dt;
    if (this.spawnTimer > 1.5 && this.zombiesToSpawn > 0) {
      this.spawnTimer = 0;
      this._spawnWave();
    }

    // interact prompt
    let prompt = '';
    for (const i of this.mapBuilder.interactables) {
      if (i.isLookingAt(this.player)) { prompt = i.promptText; if (keysJustPressed.has('f')) i.interact(this.player); break; }
    }
    this.hud.setPrompt(prompt);

    if (this.mapData.special.includes('low_gravity') && this.mapId === 'moon') {
      // handled via env override — placeholder
    }
  }

  onZombieDied(z, headshot) {
    this.killedThisRound += 1;
    this.addPoints(headshot ? 100 : 50);
    if (Math.random() < 0.04) {
      this.powerUps.push(new PowerUp(this.scene, z.group.position.clone(), this));
    }
    if (this.killedThisRound >= this.totalThisRound) this._endRound();
    else if (this.zombiesToSpawn > 0) this._spawnWave();
  }

  _endRound() {
    this.roundActive = false;
    setTimeout(() => {
      if (!this.ended && this.player && !this.player.downed) this.nextRound();
    }, 5000);
  }

  addPoints(n) {
    this.points += n;
    this.onPointsChanged();
  }

  trySpend(n) {
    if (this.points >= n) { this.points -= n; this.onPointsChanged(); return true; }
    return false;
  }

  onPointsChanged() { this.hud.setPoints(this.points); }
  onHealthChanged(h) { this.hud.setHealth(h); }
  onAmmoChanged(m, r) { this.hud.setAmmo(m, r); }
  onWeaponChanged(w) { this.hud.setWeapon(w.name); }
  onPerksChanged(perks) { this.hud.setPerks(perks); }
  onDowned() { this.hud.setPrompt('DOWNED — reviving...'); }
  onRevived() { this.hud.setPrompt(''); }
  gameOver() {
    this.ended = true;
    this.hud.setPrompt('GAME OVER — press R to restart');
  }
}

// ---- bootstrap ----

const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08080c);
scene.fog = new THREE.Fog(0x08080c, 20, 70);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 400);
window.__camera = camera;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0x556677, 0.5);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xaabbcc, 0.5);
dir.position.set(-30, 60, -20);
scene.add(dir);
const moonLight = new THREE.PointLight(0x8899bb, 0.4, 100);
moonLight.position.set(20, 15, 20);
scene.add(moonLight);

const hud = new HUD();
let manager = null;

loadManifest().then(() => {
  const grid = document.getElementById('map-grid');
  for (const id of allMapIds()) {
    const m = MAPS[id];
    const btn = document.createElement('button');
    btn.innerHTML = `${m.name}<span class="year">${m.year}</span>`;
    btn.addEventListener('click', () => startGame(id));
    grid.appendChild(btn);
  }
});

async function startGame(mapId) {
  document.getElementById('menu').style.display = 'none';
  manager = new GameManager(scene, hud);
  await manager.start(mapId);

  renderer.domElement.requestPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  document.getElementById('lock-hint').classList.toggle('hidden', document.pointerLockElement === renderer.domElement);
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement && manager?.player) {
    manager.player.addYawPitch(e.movementX, e.movementY);
  }
});

const keyMap = {
  KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint',
  ControlLeft: 'crouch', KeyR: 'reload', KeyF: 'interact', KeyQ: 'swapWeapon'
};

window.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = true;
  if (e.code === 'KeyR' && manager?.ended) { location.reload(); }
  if (e.code === 'KeyF') keysJustPressed.add('f');
});

window.addEventListener('keyup', (e) => {
  if (keyMap[e.code]) input[keyMap[e.code]] = false;
});

window.addEventListener('mousedown', (e) => { if (e.button === 0) input.fire = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (manager) manager.update(dt);
  keysJustPressed.clear();
  renderer.render(scene, camera);
}
animate();
