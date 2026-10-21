import * as THREE from 'three';
import { getMap } from './maps.js';
import { tryLoadMap, extractMapAnchors } from './assets.js';
import { WallBuy, PerkMachine, MysteryBox, PackAPunch } from './interactables.js';

export class MapBuilder {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.interactables = [];
    this.spawnPoints = [];
  }

  async build(mapId, player, manager) {
    const mapData = getMap(mapId);
    const real = await tryLoadMap(mapId);
    let anchors;
    if (real) {
      this.group.add(real);
      this._collectColliders(real);
      anchors = extractMapAnchors(real);
      if (anchors.spawns.length === 0) anchors.spawns = this._fallbackSpawns();
    } else {
      anchors = this._buildPlaceholder();
    }

    this.spawnPoints = anchors.spawns;
    this._placeInteractables(mapData, anchors, manager);
    return anchors;
  }

  _collectColliders(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const box = o.geometry.boundingBox.clone();
      box.applyMatrix4(o.matrixWorld);
      this.colliders.push(box);
    });
  }

  _buildPlaceholder() {
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1.0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x332e28, roughness: 1.0 });
    const perimeter = [
      { pos: [0, 2, 40],  size: [80, 4, 1] },
      { pos: [0, 2, -40], size: [80, 4, 1] },
      { pos: [40, 2, 0],  size: [1, 4, 80] },
      { pos: [-40, 2, 0], size: [1, 4, 80] }
    ];
    for (const p of perimeter) this._wall(p.pos, p.size, wallMat);

    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3 + 0.3;
      const pos = [Math.cos(ang) * 25, 2, Math.sin(ang) * 25];
      this._wall(pos, [15, 4, 1], wallMat);
    }

    const spawns = [];
    for (let i = 0; i < 12; i++) {
      const ang = (i * Math.PI) / 6 + 0.3;
      spawns.push(new THREE.Vector3(Math.cos(ang) * 35, 0, Math.sin(ang) * 35));
    }

    const wallBuys = [];
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4 + 0.7;
      wallBuys.push(new THREE.Vector3(Math.cos(ang) * 20, 0, Math.sin(ang) * 20));
    }
    const perks = [];
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2;
      perks.push(new THREE.Vector3(Math.cos(ang) * 15, 0, Math.sin(ang) * 15));
    }
    const boxes = [];
    for (let i = 0; i < 3; i++) {
      const ang = (i * 2 * Math.PI) / 3;
      boxes.push(new THREE.Vector3(Math.cos(ang) * 10, 0, Math.sin(ang) * 10));
    }

    return { spawns, wallBuys, perks, boxes, pap: new THREE.Vector3(0, 0, -25), power: new THREE.Vector3(25, 0, 0) };
  }

  _wall(pos, size, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...pos);
    this.group.add(mesh);
    const box = new THREE.Box3(
      new THREE.Vector3(pos[0] - size[0] / 2, pos[1] - size[1] / 2, pos[2] - size[2] / 2),
      new THREE.Vector3(pos[0] + size[0] / 2, pos[1] + size[1] / 2, pos[2] + size[2] / 2)
    );
    this.colliders.push(box);
  }

  _fallbackSpawns() {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4 + 0.4;
      out.push(new THREE.Vector3(Math.cos(ang) * 30, 0, Math.sin(ang) * 30));
    }
    return out;
  }

  _placeInteractables(mapData, anchors, manager) {
    const wallBuys = mapData.wallBuys || [];
    for (let i = 0; i < Math.min(anchors.wallBuys.length, wallBuys.length); i++) {
      const wb = new WallBuy(this.scene, anchors.wallBuys[i], wallBuys[i], 500);
      this.interactables.push(wb);
    }
    const perks = mapData.perks || [];
    for (let i = 0; i < Math.min(anchors.perks.length, perks.length); i++) {
      const pm = new PerkMachine(this.scene, anchors.perks[i], perks[i]);
      this.interactables.push(pm);
    }
    for (const p of anchors.boxes) {
      const mb = new MysteryBox(this.scene, p);
      this.interactables.push(mb);
    }
    if (mapData.pap && anchors.pap) {
      const pap = new PackAPunch(this.scene, anchors.pap);
      this.interactables.push(pap);
    }
  }

  destroy() {
    for (const i of this.interactables) i.destroy();
    this.scene.remove(this.group);
  }
}
