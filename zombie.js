import * as THREE from 'three';
import { tryLoadCharacter } from './assets.js';

const GRAVITY = 18.0;
const ATTACK_RANGE = 1.8;
const ATTACK_DAMAGE = 30.0;
const ATTACK_COOLDOWN = 1.2;
const RADIUS = 0.4;

export class Zombie {
  constructor(scene, pos, health, speed, type, target, manager) {
    this.scene = scene;
    this.target = target;
    this.manager = manager;
    this.health = health;
    this.maxHealth = health;
    this.speed = speed;
    this.type = type;
    this.alive = true;
    this.attackTimer = 0;
    this.deathTimer = 0;
    this.velocity = new THREE.Vector3();
    this.onGround = false;

    this.group = new THREE.Group();
    this.group.position.copy(pos);
    scene.add(this.group);

    this._buildBody();
    this._tryLoadCharacter();

    this.group.userData.zombie = this;
  }

  _buildBody() {
    const color = this.type === 'hellhound' ? 0x992211
                : this.type === 'monkey' ? 0x664488
                : this.type === 'astronaut' ? 0xc0c0d0
                : 0x4c2c1a;
    const skinMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.5, 8), skinMat);
    body.position.y = 0.75;
    body.userData.zombie = this;
    this.group.add(body);
    this.bodyMesh = body;

    const headMat = new THREE.MeshStandardMaterial({ color: 0x3a1f10, roughness: 0.9 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), headMat);
    head.position.y = 1.75;
    head.userData.zombie = this;
    head.userData.head = true;
    this.group.add(head);
    this.headMesh = head;

    const armMat = new THREE.MeshStandardMaterial({ color: 0x3a1f10, roughness: 0.9 });
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 4, 6), armMat);
    armL.position.set(-0.35, 1.1, -0.15);
    armL.rotation.x = 0.6;
    this.group.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.35;
    this.group.add(armR);
  }

  async _tryLoadCharacter() {
    const real = await tryLoadCharacter('zombie');
    if (!real) return;
    real.scale.setScalar(1.0);
    real.traverse(o => { if (o.isMesh) o.userData.zombie = this; });
    // keep head/body hitboxes invisible for gameplay
    this.bodyMesh.visible = false;
    this.headMesh.visible = false;
    this.group.add(real);
  }

  update(dt, zombies, colliders) {
    if (!this.alive) {
      this.deathTimer += dt;
      if (this.deathTimer > 1.5) { this.destroy(); }
      return;
    }
    if (!this.target || this.target.downed) return;

    if (!this.onGround) this.velocity.y -= GRAVITY * dt;

    const toPlayer = new THREE.Vector3().subVectors(this.target.group.position, this.group.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    toPlayer.normalize();

    if (dist < ATTACK_RANGE) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      this._tryAttack(dt);
    } else {
      // separation from nearby zombies
      const sep = new THREE.Vector3();
      for (const z of zombies) {
        if (z === this || !z.alive) continue;
        const d = this.group.position.distanceTo(z.group.position);
        if (d < 1.2 && d > 0.01) {
          sep.add(new THREE.Vector3().subVectors(this.group.position, z.group.position).divideScalar(d));
        }
      }
      const steer = toPlayer.clone().add(sep.multiplyScalar(0.6)).normalize();
      this.velocity.x = steer.x * this.speed;
      this.velocity.z = steer.z * this.speed;

      // face the player
      this.group.rotation.y = Math.atan2(steer.x, steer.z);
    }

    this._moveWithCollision(dt, colliders);
  }

  _moveWithCollision(dt, colliders) {
    const pos = this.group.position.clone();

    const tryAxis = (axis, amount) => {
      const test = pos.clone();
      test[axis] += amount;
      const box = new THREE.Box3(
        new THREE.Vector3(test.x - RADIUS, test.y - 0.9, test.z - RADIUS),
        new THREE.Vector3(test.x + RADIUS, test.y + 0.9, test.z + RADIUS)
      );
      for (const c of colliders) if (box.intersectsBox(c)) return false;
      pos[axis] = test[axis];
      return true;
    };

    if (this.velocity.x !== 0) tryAxis('x', this.velocity.x * dt);
    if (this.velocity.z !== 0) tryAxis('z', this.velocity.z * dt);
    if (this.velocity.y !== 0) {
      if (tryAxis('y', this.velocity.y * dt)) this.onGround = false;
      else { if (this.velocity.y < 0) this.onGround = true; this.velocity.y = 0; }
    }
    this.group.position.copy(pos);
  }

  _tryAttack(dt) {
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      this.attackTimer = ATTACK_COOLDOWN;
      this.target.takeDamage(ATTACK_DAMAGE);
    }
  }

  takeDamage(amount, headshot) {
    if (!this.alive) return;
    this.health -= amount;
    this.manager.addPoints(10);
    // flash red on hit
    this.bodyMesh.material.emissive.setHex(0x550000);
    setTimeout(() => { if (this.bodyMesh) this.bodyMesh.material.emissive.setHex(0x000000); }, 60);
    if (this.health <= 0) this.die(headshot);
  }

  die(headshot) {
    this.alive = false;
    this.deathTimer = 0;
    this.group.rotation.x = -Math.PI / 2.2;
    this.bodyMesh.material.color.multiplyScalar(0.5);
    this.manager.onZombieDied(this, headshot);
  }

  destroy() {
    this.scene.remove(this.group);
    const i = this.manager.zombies.indexOf(this);
    if (i >= 0) this.manager.zombies.splice(i, 1);
  }
}
