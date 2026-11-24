// ✊ ARENA JOKENPÔ 3D AAA — Duelo crepuscular com céu atmosférico, anéis rúnicos HDR,
// pose real dos 30 ossos dos dedos (punho ✊, palma ✋, tesoura ✌️), faíscas e screen-shake no impacto!

import * as THREE from 'three';
import { createCharacterActor, createNameBadgeSprite, createStylizedMat } from '../characters.js';
import { SurfaceTextures, VFXSystem, createAtmosphericSky, adaptCameraForAspect } from '../graphics.js';
import { audio } from '../audio.js';

function createChoiceSculpture3D(choice) {
  const g = new THREE.Group();
  if (choice === 'pedra') {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.54, 1),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.65, metalness: 0.18 })
    );
    rock.scale.set(1.12, 0.9, 1.0);
    rock.castShadow = true;
    g.add(rock);
  } else if (choice === 'papel') {
    const sheet = new THREE.Mesh(
      new THREE.BoxGeometry(0.74, 0.94, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.05 })
    );
    sheet.rotation.z = 0.12;
    sheet.castShadow = true;
    for (let i = -2; i <= 2; i++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.032, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, toneMapped: false })
      );
      line.position.y = i * 0.14;
      sheet.add(line);
    }
    g.add(sheet);
  } else {
    const metal = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.85, roughness: 0.16 });
    const handleMat = createStylizedMat(0xef4444, { roughness: 0.3, metalness: 0.2 });
    for (const s of [-1, 1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.8, 0.045), metal);
      blade.position.y = 0.22;
      blade.rotation.z = s * 0.32;
      blade.castShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.036, 12, 20), handleMat);
      ring.position.set(s * 0.16, -0.26, 0);
      g.add(blade, ring);
    }
  }
  return g;
}

export class RPS3DGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.game = ctx.initialGame;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1b1536, 0.02);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
    adaptCameraForAspect(this.camera, 45, 1.35, 76);
    this.camera.position.set(0, 2.32, window.innerWidth < window.innerHeight ? 6.6 : 5.75);
    this.camera.lookAt(0, 1.22, 0);
    this.vfx = new VFXSystem(this.scene);

    this.clashState = null;
    this._lastPhaseKey = '';

    this._buildDuelArena();
    this.onState(this.game);
  }

  _buildDuelArena() {
    const { sky } = createAtmosphericSky({ elevation: 2.5, azimuth: 160, turbidity: 6.5, rayleigh: 2.8 });
    this.scene.add(sky);

    this.scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x1e1b4b, 0.85));
    const sun = new THREE.DirectionalLight(0xffb4a2, 2.1);
    sun.position.set(4, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);

    const rim = new THREE.PointLight(0x06b6d4, 3.0, 12, 1.5);
    rim.position.set(0, 2.4, -2.5);
    this.scene.add(rim);

    const ringPlatform = new THREE.Mesh(
      new THREE.CylinderGeometry(4.3, 4.6, 0.32, 56),
      new THREE.MeshStandardMaterial({ map: SurfaceTextures.stonePlaza(4), color: 0x334155, roughness: 0.42, metalness: 0.2 })
    );
    ringPlatform.position.y = -0.16;
    ringPlatform.receiveShadow = true;
    this.scene.add(ringPlatform);

    const glowCircle = new THREE.Mesh(
      new THREE.RingGeometry(3.9, 4.08, 56),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4, side: THREE.DoubleSide, toneMapped: false })
    );
    glowCircle.rotation.x = -Math.PI / 2;
    glowCircle.position.y = 0.02;
    this.scene.add(glowCircle);

    this.fighters = {};
    this.game.players.forEach((pid, idx) => {
      const p = this.ctx.playersMap.get(pid) || { name: 'Duelista', character: idx === 0 ? 'mauricio' : 'maria' };
      const x = idx === 0 ? -2.05 : 2.05;
      const actor = createCharacterActor(p.character);
      actor.root.position.set(x, 0, 0);
      actor.root.rotation.y = idx === 0 ? Math.PI / 2 : -Math.PI / 2;

      const badge = createNameBadgeSprite(p.name, p.character === 'maria' ? '#ff4d8d' : '#4f8cff');
      badge.position.y = 0.22;
      actor.anchors.headTop.add(badge);

      this.scene.add(actor.root);
      this.fighters[pid] = { actor, side: idx === 0 ? -1 : 1 };
    });

    this.clashGroup = new THREE.Group();
    this.scene.add(this.clashGroup);
  }

  _pick(choice) {
    if (this.game.phase !== 'pick' || this.game.locked?.includes(this.ctx.youId)) return;
    audio.play('selectChar');
    this.ctx.sendAction({ kind: 'choose', choice });
  }

  onState(game) {
    this.game = game;
    const [p0, p1] = game.players;
    const n0 = this.ctx.playersMap.get(p0)?.name || 'J1';
    const n1 = this.ctx.playersMap.get(p1)?.name || 'J2';
    this.ctx.setScoreHTML(
      `<span>Primeiro a 3 · <b>${n0} ${game.wins?.[p0] || 0}</b> × <b>${game.wins?.[p1] || 0} ${n1}</b></span>`
    );
    if (game.msg) this.ctx.setStatus(game.msg);

    const locked = game.locked?.includes(this.ctx.youId);
    const key = `${game.round}:${game.phase}:${locked}`;
    if (key !== this._lastPhaseKey) {
      this._lastPhaseKey = key;
      if (game.phase === 'pick' && !locked) {
        this.ctx.mountUI(`
          <div class="mg-panel">
            <button type="button" class="mg-btn primary rps-choice" data-c="pedra">🪨 Pedra</button>
            <button type="button" class="mg-btn blue rps-choice" data-c="papel">📄 Papel</button>
            <button type="button" class="mg-btn green rps-choice" data-c="tesoura">✂️ Tesoura</button>
          </div>
        `);
        document.querySelectorAll('.rps-choice').forEach((b) => {
          b.addEventListener('click', () => this._pick(b.dataset.c));
        });
      } else if (game.phase === 'pick' && locked) {
        this.ctx.mountUI(`<div class="mg-panel"><span>✊ Jogada secreta pronta! Esperando seu amor...</span></div>`);
      } else {
        this.ctx.mountUI('');
      }
    }
  }

  onTick() {}

  onEvent(ev) {
    if (ev.type !== 'ppt' || ev.ev !== 'clash') return;
    while (this.clashGroup.children.length) {
      this.clashGroup.remove(this.clashGroup.children[0]);
    }

    const [p0, p1] = this.game.players;
    const s0 = createChoiceSculpture3D(ev.choices[p0]);
    const s1 = createChoiceSculpture3D(ev.choices[p1]);
    s0.position.set(-1.1, 1.35, 0);
    s1.position.set(1.1, 1.35, 0);
    s0.visible = false;
    s1.visible = false;
    this.clashGroup.add(s0, s1);

    this.clashState = {
      age: 0,
      revealed: false,
      impacted: false,
      s0,
      s1,
      p0,
      p1,
      choices: ev.choices,
      roundWinner: ev.roundWinner,
      stepSpoken: 0,
    };
  }

  update(dt, elapsed) {
    this.vfx.update(dt);

    if (this.clashState) {
      const cs = this.clashState;
      cs.age += dt;

      if (cs.age < 0.45 && cs.stepSpoken < 1) {
        cs.stepSpoken = 1;
        audio.play('countdown');
        this.ctx.setStatus('JO... ✊');
      } else if (cs.age >= 0.48 && cs.age < 0.95 && cs.stepSpoken < 2) {
        cs.stepSpoken = 2;
        audio.play('countdown');
        this.ctx.setStatus('KEN... ✊');
      } else if (cs.age >= 1.0 && !cs.revealed) {
        cs.revealed = true;
        cs.s0.visible = true;
        cs.s1.visible = true;
        this.vfx.spawnShockwave(0, 0.04, 0, 0x06b6d4, 3.6);
        audio.play(cs.roundWinner ? 'smash' : 'bump');
        const labelMap = { pedra: '🪨 Pedra', papel: '📄 Papel', tesoura: '✂️ Tesoura' };
        const c0 = cs.choices?.[cs.p0];
        const c1 = cs.choices?.[cs.p1];
        const resTxt = cs.roundWinner
          ? `Ponto de ${this.ctx.playersMap.get(cs.roundWinner)?.name || ''}! 🔥`
          : 'Empate na rodada! ⚡';
        this.ctx.setStatus(`PÔ!! ${labelMap[c0] || ''} × ${labelMap[c1] || ''} — ${resTxt}`);
      }

      if (cs.revealed) {
        const t = cs.age - 1.0;
        cs.s0.rotation.y += 2.4 * dt;
        cs.s1.rotation.y -= 2.4 * dt;
        if (cs.roundWinner === cs.p0) {
          cs.s0.position.x = Math.min(0.25, -1.1 + t * 2.5);
          if (t > 0.42) {
            if (!cs.impacted) {
              cs.impacted = true;
              this.ctx.shake?.(0.2, 0.26);
              this.vfx.spawnSparks(0.3, 1.35, 0, 0xfbbf24, 22);
            }
            cs.s1.position.x += 4.8 * dt;
            cs.s1.position.y += 2.4 * dt;
            cs.s1.rotation.z -= 6.5 * dt;
          }
        } else if (cs.roundWinner === cs.p1) {
          cs.s1.position.x = Math.max(-0.25, 1.1 - t * 2.5);
          if (t > 0.42) {
            if (!cs.impacted) {
              cs.impacted = true;
              this.ctx.shake?.(0.2, 0.26);
              this.vfx.spawnSparks(-0.3, 1.35, 0, 0xfbbf24, 22);
            }
            cs.s0.position.x -= 4.8 * dt;
            cs.s0.position.y += 2.4 * dt;
            cs.s0.rotation.z += 6.5 * dt;
          }
        }
      }

      if (cs.age > 3.5) {
        while (this.clashGroup.children.length) {
          this.clashGroup.remove(this.clashGroup.children[0]);
        }
        this.clashState = null;
      }
    }

    for (const [pid, f] of Object.entries(this.fighters)) {
      let anim = 'idle';
      let rpsHand = 'fist';
      if (this.clashState && !this.clashState.revealed) {
        anim = 'rps';
        rpsHand = 'fist';
      } else if (this.clashState?.revealed) {
        rpsHand = this.clashState.choices?.[pid] || 'fist';
        anim = this.clashState.roundWinner === pid ? 'dance' : 'rps';
      } else if (this.game.winner === pid) {
        anim = 'dance';
      }
      f.actor.update(dt, { anim, rpsHand });
    }

    this.camera.position.x = Math.sin(elapsed * 0.55) * 0.6;
    this.camera.lookAt(0, 1.25, 0);
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    adaptCameraForAspect(this.camera, 45, 1.35, 76);
    this.camera.position.z = w < h ? 6.6 : 5.75;
  }

  dispose() {}
}
