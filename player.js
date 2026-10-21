import * as THREE from 'three';
import { getWeapon } from './weapons.js';
import { tryLoadWeaponModel, tryLoadHands } from './assets.js';

const WALK_SPEED = 5.0;
const SPRINT_SPEED = 8.0;
const CROUCH_SPEED = 2.5;
const JUMP_VEL = 5.5;
const GRAVITY = 18.0;
const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.8;
const BASE_HEALTH = 100;
const JUGG_HEALTH = 250;
const REGEN_DELAY = 3.0;
const REGEN_RATE = 20.0;
const MOUSE_SENS = 0.002;

export class Player {
  constructor(scene, camera, manager) {
    this.scene = scene;
    this.camera = camera;
    this.manager = manager;

    this.group = new THREE.Group();
    this.group.position.set(0, 1.2, 0);
    scene.add(this.group);
    this.group.add(camera);
    camera.position.set(0, 0.6, 0);

    this.yaw = 0;
    this.pitch = 0;
    this.velocity = new THREE.Vector3();
    this.onGround = true;

    this.health = BASE_HEALTH;
    this.maxHealth = BASE_HEALTH;
    this.perks = new Set();
    this.weapons = ['m1911'];
    this.currentIndex = 0;
    this.papWeapons = new Set();
    this.magAmmo = 8;
    this.reserveAmmo = 80;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.lastDamage = 0;
    this.downed = false;
    this.quickRevivesLeft = 1;
    this.downedTimer = 0;

    this.weaponHolder = new THREE.Group();
    this.camera.add(this.weaponHolder);
    this.weaponHolder.position.set(0.35, -0.28, -0.55);

    this._equip(this.weapons[this.currentIndex]);
    this._buildPlaceholderWeaponModel();
    this._tryLoadRealModel();
  }

  _buildPlaceholderWeaponModel() {
    this.weaponHolder.clear();
    const g = new THREE.Group();
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.7 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x3a2820, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.10, 0.45), barrelMat);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.30, 8), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.30;
    g.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.10), gripMat);
    grip.position.set(0, -0.10, 0.14);
    grip.rotation.x = 0.35;
    g.add(grip);
    this.weaponHolder.add(g);
    this.weaponHolder.visible = true;
  }

  async _tryLoadRealModel() {
    const id = this.weapons[this.currentIndex];
    const [real, hands] = await Promise.all([tryLoadWeaponModel(id), tryLoadHands(id)]);
    if (!real && !hands) return;
    this.weaponHolder.clear();
    if (real) real.scale.setScalar(0.5);
    if (hands) hands.scale.setScalar(0.5);
    if (real) this.weaponHolder.add(real);
    if (hands) this.weaponHolder.add(hands);
  }

  _equip(id) {
    const w = getWeapon(id);
    const isPap = this.papWeapons.has(id);
    this.magAmmo = isPap && w.papMag ? w.papMag : w.mag;
    this.reserveAmmo = isPap && w.papReserve ? w.papReserve : w.reserve;
    this.weaponHolder.clear();
    this._buildPlaceholderWeaponModel();
    this._tryLoadRealModel();
  }

  addYawPitch(dx, dy) {
    this.yaw -= dx * MOUSE_SENS;
    this.pitch -= dy * MOUSE_SENS;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
    this.group.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  update(dt, input, colliders, raycasterTargets) {
    if (this.downed) {
      this.downedTimer -= dt;
      if (this.downedTimer <= 0 && this.quickRevivesLeft > 0 && this.perks.has('quickrevive')) {
        this._revive();
      }
      return;
    }

    const crouch = input.crouch;
    const sprint = input.sprint && !crouch;
    let speed = crouch ? CROUCH_SPEED : (sprint ? SPRINT_SPEED : WALK_SPEED);
    if (this.perks.has('staminup')) speed *= 1.25;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (input.forward) move.add(forward);
    if (input.back) move.sub(forward);
    if (input.right) move.add(right);
    if (input.left) move.sub(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);

    this.velocity.x = move.x;
    this.velocity.z = move.z;
    if (!this.onGround) this.velocity.y -= GRAVITY * dt;
    else if (input.jump) { this.velocity.y = JUMP_VEL; this.onGround = false; }

    this._moveWithCollision(dt, colliders);

    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this._finishReload();
    } else {
      if (input.reload) this._startReload();
      if (input.fire) this._tryFire(raycasterTargets);
    }
    if (input.swapWeapon && this.weapons.length > 1) {
      this.currentIndex = (this.currentIndex + 1) % this.weapons.length;
      this._equip(this.weapons[this.currentIndex]);
      this.manager?.onWeaponChanged?.(getWeapon(this.weapons[this.currentIndex]));
    }

    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    const now = performance.now() / 1000;
    if (now - this.lastDamage > REGEN_DELAY && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + REGEN_RATE * dt);
      this.manager?.onHealthChanged?.(this.health);
    }

    const targetY = crouch ? 0.3 : 0.6;
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetY, dt * 10);
  }

  _moveWithCollision(dt, colliders) {
    const pos = this.group.position.clone();
    const pRadius = PLAYER_RADIUS;
    const pHeight = PLAYER_HEIGHT;

    const applyAxis = (axis, amount) => {
      const test = pos.clone();
      test[axis] += amount;
      const playerBox = new THREE.Box3(
        new THREE.Vector3(test.x - pRadius, test.y - pHeight / 2, test.z - pRadius),
        new THREE.Vector3(test.x + pRadius, test.y + pHeight / 2, test.z + pRadius)
      );
      for (const c of colliders) {
        if (playerBox.intersectsBox(c)) return false;
      }
      pos[axis] = test[axis];
      return true;
    };

    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    const dy = this.velocity.y * dt;

    if (dx !== 0) applyAxis('x', dx);
    if (dz !== 0) applyAxis('z', dz);
    if (dy !== 0) {
      if (applyAxis('y', dy)) {
        this.onGround = false;
      } else {
        if (dy < 0) this.onGround = true;
        this.velocity.y = 0;
      }
    }
    this.group.position.copy(pos);
  }

  _tryFire(targets) {
    if (this.fireCooldown > 0) return;
    const w = getWeapon(this.weapons[this.currentIndex]);
    if (this.magAmmo <= 0) { this._startReload(); return; }

    let rate = w.fireRate;
    if (this.perks.has('doubletap')) rate *= 0.66;
    this.fireCooldown = rate;
    this.magAmmo -= 1;
    this.manager?.onAmmoChanged?.(this.magAmmo, this.reserveAmmo);

    const isPap = this.papWeapons.has(this.weapons[this.currentIndex]);
    const dmg = isPap && w.papDamage ? w.papDamage : w.damage;

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    const ray = new THREE.Raycaster(origin, dir, 0, 200);
    for (let i = 0; i < w.pellets; i++) {
      const spread = i === 0 ? 0 : 0.015;
      const jitter = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread
      );
      ray.set(origin, dir.clone().add(jitter).normalize());
      const hits = ray.intersectObjects(targets, true);
      if (hits.length > 0) {
        const hit = hits[0];
        let obj = hit.object;
        while (obj && !obj.userData.zombie && !obj.userData.solid) obj = obj.parent;
        if (obj?.userData.zombie) {
          const head = hit.object.userData.head === true;
          obj.userData.zombie.takeDamage(dmg * (head ? 2 : 1), head);
        }
      }
    }

    if (w.explosive) {
      const impact = origin.clone().add(dir.clone().multiplyScalar(2));
      this._explodeAoE(impact, dmg, targets);
    }
    if (w.chain) {
      const hits = ray.intersectObjects(targets, true);
      if (hits[0]) {
        const impactPos = hits[0].point;
        const chained = targets.filter(t => t.userData.zombie && t.userData.zombie.alive
          && t.position.distanceTo(impactPos) < 6);
        for (const t of chained) {
          if (t.userData.zombie !== hits[0].object?.userData?.zombie)
            t.userData.zombie.takeDamage(dmg * 0.5, false);
        }
      }
    }

    if (this.magAmmo <= 0) this._startReload();
  }

  _explodeAoE(pos, dmg) {
    const list = this.manager?.zombies || [];
    for (const z of list) {
      if (!z.alive) continue;
      const d = z.group.position.distanceTo(pos);
      if (d < 4) z.takeDamage(dmg * (1 - d / 4), false);
    }
  }

  _startReload() {
    if (this.reloadTimer > 0) return;
    const w = getWeapon(this.weapons[this.currentIndex]);
    const isPap = this.papWeapons.has(this.weapons[this.currentIndex]);
    const maxMag = isPap && w.papMag ? w.papMag : w.mag;
    const maxRes = isPap && w.papReserve ? w.papReserve : w.reserve;
    if (this.magAmmo >= maxMag || this.reserveAmmo <= 0) return;
    let rt = w.reload;
    if (this.perks.has('speed')) rt *= 0.5;
    this.reloadTimer = rt;
  }

  _finishReload() {
    const w = getWeapon(this.weapons[this.currentIndex]);
    const isPap = this.papWeapons.has(this.weapons[this.currentIndex]);
    const maxMag = isPap && w.papMag ? w.papMag : w.mag;
    const maxRes = isPap && w.papReserve ? w.papReserve : w.reserve;
    const need = maxMag - this.magAmmo;
    const take = Math.min(need, this.reserveAmmo);
    this.magAmmo += take;
    this.reserveAmmo = Math.min(maxRes, this.reserveAmmo - take);
    this.manager?.onAmmoChanged?.(this.magAmmo, this.reserveAmmo);
  }

  takeDamage(amount) {
    if (this.downed) return;
    this.health -= amount;
    this.lastDamage = performance.now() / 1000;
    this.manager?.onHealthChanged?.(this.health);
    if (this.health <= 0) this._goDown();
  }

  _goDown() {
    this.health = 0;
    if (this.perks.has('quickrevive') && this.quickRevivesLeft > 0) {
      this.downed = true;
      this.downedTimer = 3.0;
      this.manager?.onDowned?.();
    } else {
      this.downed = true;
      this.manager?.gameOver?.();
    }
  }

  _revive() {
    this.quickRevivesLeft -= 1;
    this.downed = false;
    this.health = this.maxHealth * 0.5;
    this.manager?.onHealthChanged?.(this.health);
    this.manager?.onRevived?.();
  }

  addPerk(perk) {
    if (this.perks.has(perk)) return;
    this.perks.add(perk);
    if (perk === 'jugg') {
      this.maxHealth = JUGG_HEALTH;
      this.health = JUGG_HEALTH;
      this.manager?.onHealthChanged?.(this.health);
    }
    this.manager?.onPerksChanged?.(this.perks);
  }

  giveWeapon(id, pap = false) {
    const maxSlots = this.perks.has('mulekick') ? 3 : 2;
    if (this.weapons.length >= maxSlots) {
      this.weapons[this.currentIndex] = id;
    } else {
      this.weapons.push(id);
      this.currentIndex = this.weapons.length - 1;
    }
    if (pap) this.papWeapons.add(id);
    this._equip(id);
    this.manager?.onWeaponChanged?.(getWeapon(id));
    this.manager?.onAmmoChanged?.(this.magAmmo, this.reserveAmmo);
  }

  upgradeCurrentToPaP() {
    const id = this.weapons[this.currentIndex];
    this.papWeapons.add(id);
    this._equip(id);
    this.manager?.onWeaponChanged?.(getWeapon(id));
    this.manager?.onAmmoChanged?.(this.magAmmo, this.reserveAmmo);
  }
}
