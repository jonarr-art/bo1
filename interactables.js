import * as THREE from 'three';
import { getWeapon } from './weapons.js';

const PERK_COSTS = {
  jugg: 2500, speed: 3000, quickrevive: 500, doubletap: 2000,
  staminup: 2000, phd: 2000, mulekick: 4000, deadshot: 1500
};
const PERK_COLORS = {
  jugg: 0xcc1111, speed: 0x22aa22, quickrevive: 0x3344cc, doubletap: 0xcccc11,
  staminup: 0xdd8800, phd: 0x8822bb, mulekick: 0x664422, deadshot: 0xdd4444
};
const PERK_LABELS = {
  jugg: 'JG', speed: 'SC', quickrevive: 'QR', doubletap: 'DT',
  staminup: 'SU', phd: 'PhD', mulekick: 'MK', deadshot: 'DS'
};

export const BOX_WEAPONS = [
  'galil','aug','commando','famas','fnfal','g11','rpk','hk21','m72','chinalake',
  'raygun','crossbow','ballisticknife','hs10','python','cz75','spectre','wunderwaffe','scavenger'
];

export class Interactable {
  constructor(scene, position, kind) {
    this.scene = scene;
    this.kind = kind;
    this.position = position.clone();
    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);
    scene.add(this.mesh);
    this.group = this.mesh;
    this.group.userData.interactable = this;
    this.promptText = '';
  }

  isLookingAt(player) {
    const camPos = new THREE.Vector3();
    player.camera.getWorldPosition(camPos);
    const dir = new THREE.Vector3();
    player.camera.getWorldDirection(dir);
    const to = new THREE.Vector3().subVectors(this.position, camPos);
    const dist = to.length();
    if (dist > 3.2) return false;
    to.normalize();
    return dir.dot(to) > 0.6;
  }

  interact(_player) {}
  destroy() { this.scene.remove(this.mesh); }
}

export class WallBuy extends Interactable {
  constructor(scene, position, weaponId, cost = 500) {
    super(scene, position, 'wallbuy');
    this.weaponId = weaponId;
    this.cost = cost;
    this._build();
  }

  _build() {
    const w = getWeapon(this.weaponId);
    const mat = new THREE.MeshStandardMaterial({ color: 0x223344, transparent: true, opacity: 0.7 });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.8), mat);
    plane.position.y = 1.5;
    this.group.add(plane);

    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000a'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 42px monospace';
    ctx.fillText(w.name, 20, 60);
    ctx.fillStyle = '#ffd'; ctx.font = 'bold 30px monospace';
    ctx.fillText(this.cost + '', 20, 108);
    const tex = new THREE.CanvasTexture(canvas);
    plane.material.map = tex;
    plane.material.needsUpdate = true;

    this.promptText = `[F] ${w.name} — ${this.cost}`;
  }

  interact(player) {
    if (player.manager.trySpend(this.cost)) {
      player.giveWeapon(this.weaponId);
    }
  }
}

export class PerkMachine extends Interactable {
  constructor(scene, position, perkId) {
    super(scene, position, 'perk');
    this.perkId = perkId;
    this.cost = PERK_COSTS[perkId] || 2000;
    this._build();
  }

  _build() {
    const color = PERK_COLORS[this.perkId] || 0x555555;
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 1.0), mat);
    body.position.y = 1.0;
    this.group.add(body);

    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 100px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(PERK_LABELS[this.perkId] || '?', 128, 160);
    const tex = new THREE.CanvasTexture(canvas);
    const labelMat = new THREE.MeshBasicMaterial({ map: tex });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), labelMat);
    label.position.set(0, 1.3, 0.51);
    this.group.add(label);

    this.promptText = `[F] ${this.perkId} — ${this.cost}`;
  }

  interact(player) {
    if (player.perks.has(this.perkId)) return;
    if (player.manager.trySpend(this.cost)) {
      player.addPerk(this.perkId);
    }
  }
}

export class MysteryBox extends Interactable {
  constructor(scene, position) {
    super(scene, position, 'box');
    this.cost = 950;
    this.rolling = false;
    this._build();
  }

  _build() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x553311, emissive: 0x221100, emissiveIntensity: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.0), mat);
    body.position.y = 0.5;
    this.group.add(body);
    this.promptText = `[F] Mystery Box — ${this.cost}`;
  }

  async interact(player) {
    if (this.rolling) return;
    if (!player.manager.trySpend(this.cost)) return;
    this.rolling = true;
    const id = BOX_WEAPONS[Math.floor(Math.random() * BOX_WEAPONS.length)];
    const isPap = player.manager.papReady && Math.random() < 0.15;
    player.giveWeapon(id, isPap);
    await new Promise(r => setTimeout(r, 1000));
    this.rolling = false;
  }
}

export class PackAPunch extends Interactable {
  constructor(scene, position) {
    super(scene, position, 'pap');
    this.cost = 5000;
    this._build();
  }

  _build() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xaa7733, emissiveIntensity: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 1.5), mat);
    body.position.y = 1.25;
    this.group.add(body);
    this.promptText = `[F] Pack-a-Punch — ${this.cost}`;
  }

  interact(player) {
    if (!player.manager.papReady) return;
    if (player.manager.trySpend(this.cost)) {
      player.upgradeCurrentToPaP();
    }
  }
}

export class PowerUp {
  constructor(scene, pos, manager) {
    this.scene = scene;
    this.manager = manager;
    this.types = ['max_ammo', 'insta_kill', 'double_points', 'nuke', 'carpenter', 'fire_sale'];
    this.type = this.types[Math.floor(Math.random() * this.types.length)];
    this.lifetime = 20;
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.group.position.y = 0.5;
    scene.add(this.group);

    const color = this._color();
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.0 });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), mat);
    this.group.add(sphere);

    const light = new THREE.PointLight(color, 1.5, 4);
    this.group.add(light);

    this.collected = false;
  }

  _color() {
    switch (this.type) {
      case 'max_ammo':      return 0x1188ff;
      case 'insta_kill':    return 0xff2222;
      case 'double_points': return 0xffee33;
      case 'nuke':          return 0xff8800;
      case 'carpenter':     return 0x88ff88;
      case 'fire_sale':     return 0xff44aa;
    }
    return 0xffffff;
  }

  update(dt, player) {
    if (this.collected) return;
    this.lifetime -= dt;
    this.group.rotation.y += dt * 3;
    if (this.lifetime <= 0) { this.destroy(); return; }
    if (player.group.position.distanceTo(this.group.position) < 1.0) {
      this._apply(player);
      this.destroy();
    }
  }

  _apply(player) {
    switch (this.type) {
      case 'max_ammo': {
        const w = getWeapon(player.weapons[player.currentIndex]);
        const isPap = player.papWeapons.has(player.weapons[player.currentIndex]);
        player.reserveAmmo = isPap && w.papReserve ? w.papReserve : w.reserve;
        player.manager.onAmmoChanged(player.magAmmo, player.reserveAmmo);
        break;
      }
      case 'double_points': this.manager.points *= 2; this.manager.onPointsChanged(); break;
      case 'nuke':
      case 'insta_kill':
        for (const z of [...this.manager.zombies]) if (z.alive) z.takeDamage(999999, false);
        break;
    }
  }

  destroy() {
    this.collected = true;
    this.scene.remove(this.group);
    const i = this.manager.powerUps.indexOf(this);
    if (i >= 0) this.manager.powerUps.splice(i, 1);
  }
}
