const PERK_COLORS_HEX = {
  jugg: '#cc1111', speed: '#22aa22', quickrevive: '#3344cc', doubletap: '#cccc11',
  staminup: '#dd8800', phd: '#8822bb', mulekick: '#664422', deadshot: '#dd4444'
};
const PERK_LABELS_HUD = {
  jugg: 'JG', speed: 'SC', quickrevive: 'QR', doubletap: 'DT',
  staminup: 'SU', phd: 'PhD', mulekick: 'MK', deadshot: 'DS'
};

export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.pointsEl = document.getElementById('points');
    this.roundEl = document.getElementById('round');
    this.healthEl = document.getElementById('health');
    this.perksEl = document.getElementById('perks');
    this.weaponEl = document.getElementById('weapon-name');
    this.ammoEl = document.getElementById('ammo');
    this.promptEl = document.getElementById('interact-prompt');
    this.powerHintEl = document.getElementById('power-hint');
    this.crosshair = document.getElementById('crosshair');
  }

  show() { this.el.classList.remove('hidden'); this.crosshair.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); this.crosshair.classList.add('hidden'); }

  setPoints(n) { this.pointsEl.textContent = n; }
  setRound(n) { this.roundEl.textContent = n; }
  setHealth(h) { this.healthEl.textContent = 'HP: ' + Math.max(0, Math.floor(h)); }
  setAmmo(mag, res) { this.ammoEl.textContent = mag + ' / ' + res; }
  setWeapon(name) { this.weaponEl.textContent = name; }
  setPrompt(t) { this.promptEl.textContent = t || ''; }
  setPowerHint(t) { this.powerHintEl.textContent = t || ''; }

  setPerks(perks) {
    this.perksEl.innerHTML = '';
    for (const p of perks) {
      const b = document.createElement('div');
      b.className = 'perk-badge';
      b.style.background = PERK_COLORS_HEX[p] || '#555';
      b.textContent = PERK_LABELS_HUD[p] || '?';
      this.perksEl.appendChild(b);
    }
  }
}
