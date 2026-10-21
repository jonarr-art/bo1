import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = 'assets/bo1/';
const loader = new GLTFLoader();
let manifest = { maps: [], weapons: [], characters: [], hands: [] };
const cache = new Map();

export async function loadManifest() {
  try {
    const res = await fetch(ROOT + 'manifest.json');
    if (!res.ok) return;
    const data = await res.json();
    manifest = Object.assign(manifest, data);
  } catch (e) {
    // no manifest — full procedural fallback
  }
}

export function hasMap(id)        { return manifest.maps.includes(id); }
export function hasWeapon(id)     { return manifest.weapons.includes(id); }
export function hasCharacter(id)  { return manifest.characters.includes(id); }
export function hasHands(id)      { return manifest.hands.includes(id); }

async function loadGLB(url) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
  cache.set(url, p);
  return p;
}

export async function tryLoadMap(mapId) {
  if (!hasMap(mapId)) return null;
  try { return await loadGLB(`${ROOT}maps/${mapId}/map.glb`); }
  catch (e) { console.warn('map load failed', mapId, e); return null; }
}

export async function tryLoadWeaponModel(weaponId) {
  if (!hasWeapon(weaponId)) return null;
  try { return await loadGLB(`${ROOT}weapons/${weaponId}.glb`); }
  catch (e) { return null; }
}

export async function tryLoadHands(weaponId) {
  if (!hasHands(weaponId)) return null;
  try { return await loadGLB(`${ROOT}hands/${weaponId}_hands.glb`); }
  catch (e) { return null; }
}

export async function tryLoadCharacter(name) {
  if (!hasCharacter(name)) return null;
  try { return await loadGLB(`${ROOT}characters/${name}.glb`); }
  catch (e) { return null; }
}

// Extract spawn markers + interactable anchors from a loaded GLB map.
// Nodes named spawn_* / wall_*buy* / perk_* / box_* / pap / power.
export function extractMapAnchors(root) {
  const anchors = { spawns: [], wallBuys: [], perks: [], boxes: [], pap: null, power: null };
  const worldPos = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const n = obj.name || '';
    obj.getWorldPosition(worldPos);
    if (n.startsWith('spawn_')) anchors.spawns.push(worldPos.clone());
    else if (n.startsWith('wall_') && n.includes('buy')) anchors.wallBuys.push(worldPos.clone());
    else if (n.startsWith('perk_')) anchors.perks.push(worldPos.clone());
    else if (n.startsWith('box_')) anchors.boxes.push(worldPos.clone());
    else if (n === 'pap') anchors.pap = worldPos.clone();
    else if (n === 'power') anchors.power = worldPos.clone();
  });
  return anchors;
}
