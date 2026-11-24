// 🎱 SINUCA 3D AAA (Bola 8 Completa) — Salão de bilhar sofisticado com luminária pendente de latão,
// mogno texturizado, esferas laqueadas com reflexo IBL real, impacto rápido do taco e faíscas na caçapa!

import * as THREE from 'three';
import { createCharacterActor } from '../characters.js';
import { SpringVec3, SurfaceTextures, VFXSystem, adaptCameraForAspect, isMobileDevice } from '../graphics.js';
import { spawnAnimeProp } from '../propLoader.js';
import { audio } from '../audio.js';

const BALL_COLORS = {
  1: '#eab308', 2: '#2563eb', 3: '#dc2626', 4: '#7c3aed',
  5: '#ea580c', 6: '#16a34a', 7: '#991b1b', 8: '#0f172a',
  9: '#eab308', 10: '#2563eb', 11: '#dc2626', 12: '#7c3aed',
  13: '#ea580c', 14: '#16a34a', 15: '#991b1b',
};

function makeBallTexture(num) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');

  if (num === 0) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(128, 64, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const col = BALL_COLORS[num] || '#ef4444';
    const isStripe = num >= 9;
    ctx.fillStyle = isStripe ? '#f8fafc' : col;
    ctx.fillRect(0, 0, 256, 128);

    if (isStripe) {
      ctx.fillStyle = col;
      ctx.fillRect(0, 30, 256, 68);
    }

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(128, 64, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 24px "Plus Jakarta Sans", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), 128, 65);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Pool3DGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.game = ctx.initialGame;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x110d1f);
    this.scene.fog = new THREE.FogExp2(0x110d1f, 0.045);

    this.camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 60);
    adaptCameraForAspect(this.camera, 44, 1.42, 78);
    this.camSpring = new SpringVec3(0, 2.55, 2.35, 95, 18);
    this.vfx = new VFXSystem(this.scene);

    this.topView = window.innerWidth < 680;
    this._fineTurn = 0;
    this.aimAngle = 0;
    this.aimPower = 0.65;
    this.remoteAim = { angle: 0, power: 0.65 };

    this.shotPlayback = null;
    this.ballMeshes = {};
    this._aimSendTimer = 0;

    this._buildRoomAndTable();
    this._buildBalls();
    this._buildCueAndGuide();
    this._buildSpectators();
    this._buildUI();
    this._bindInteractions();
    this.onState(this.game);
  }

  _buildRoomAndTable() {
    this.scene.add(new THREE.HemisphereLight(0xffedd5, 0x1e1b4b, 0.72));

    // Luminária pendente clássica de salão de sinuca!
    const lampShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.68, 0.3, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.3, metalness: 0.3, side: THREE.DoubleSide })
    );
    lampShade.position.set(0, 2.75, 0);
    const lampBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xfffbeb, toneMapped: false })
    );
    lampBulb.position.set(0, 2.66, 0);
    this.scene.add(lampShade, lampBulb);

    const lampLight = new THREE.SpotLight(0xfff5e0, 5.2, 14, Math.PI * 0.44, 0.5, 1.1);
    lampLight.position.set(0, 2.85, 0);
    lampLight.castShadow = true;
    lampLight.shadow.mapSize.set(2048, 2048);
    lampLight.shadow.bias = -0.0003;
    this.scene.add(lampLight);
    this.scene.add(lampLight.target);

    // Luzes suaves nos personagens ao fundo
    const charFillL = new THREE.PointLight(0xffb4a2, 2.2, 8, 1.5);
    charFillL.position.set(-2.0, 2.2, -0.5);
    const charFillR = new THREE.PointLight(0x93c5fd, 2.2, 8, 1.5);
    charFillR.position.set(2.0, 2.2, -0.5);
    this.scene.add(charFillL, charFillR);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ map: SurfaceTextures.wood(6), color: 0x5c3d2e, roughness: 0.65 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.tableY = 0.82;
    const tableGroup = new THREE.Group();

    const feltMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.78, metalness: 0.02 });
    this.feltMesh = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.08, 1.36), feltMat);
    this.feltMesh.position.y = this.tableY - 0.04;
    this.feltMesh.receiveShadow = true;
    tableGroup.add(this.feltMesh);

    const woodMat = new THREE.MeshStandardMaterial({
      map: SurfaceTextures.wood(2),
      color: 0x7c341d,
      roughness: 0.28,
      metalness: 0.12,
    });
    const railH = 0.115;
    const rTop = new THREE.Mesh(new THREE.BoxGeometry(2.94, railH, 0.155), woodMat);
    rTop.position.set(0, this.tableY + 0.02, -0.74);
    rTop.castShadow = true;
    const rBot = rTop.clone();
    rBot.position.z = 0.74;
    const rLeft = new THREE.Mesh(new THREE.BoxGeometry(0.155, railH, 1.63), woodMat);
    rLeft.position.set(-1.39, this.tableY + 0.02, 0);
    rLeft.castShadow = true;
    const rRight = rLeft.clone();
    rRight.position.x = 1.39;
    tableGroup.add(rTop, rBot, rLeft, rRight);

    const pocketCoords = [
      [-1.28, -0.64], [0, -0.66], [1.28, -0.64],
      [-1.28, 0.64], [0, 0.66], [1.28, 0.64],
    ];
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x040408 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.22, metalness: 0.82 });
    for (const [px, pz] of pocketCoords) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.095, 24), holeMat);
      hole.position.set(px, this.tableY - 0.03, pz);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.016, 10, 24), brassMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, this.tableY + 0.032, pz);
      tableGroup.add(hole, ring);
    }

    for (const [lx, lz] of [[-1.15, -0.55], [1.15, -0.55], [-1.15, 0.55], [1.15, 0.55]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.068, 0.78, 16), woodMat);
      leg.position.set(lx, 0.39, lz);
      leg.castShadow = true;
      tableGroup.add(leg);
    }

    this.scene.add(tableGroup);

    // Mobiliário 3D real CC0 (Quaternius Interior & Kenney Arcade) decorando o salão de sinuca!
    for (const [hx, hz] of [[-3.1, -2.3], [3.1, -2.3]]) {
      spawnAnimeProp('houseplant', { targetHeight: 1.15, position: [hx, 0, hz] }).then((r) => r && this.scene.add(r.group));
    }
    spawnAnimeProp('arcade', { targetHeight: 1.95, position: [-3.4, 0, 0.2], rotY: Math.PI / 2 }).then((r) => r && this.scene.add(r.group));
    spawnAnimeProp('table_round', { targetHeight: 0.78, position: [3.2, 0, 0.4] }).then((r) => r && this.scene.add(r.group));
    spawnAnimeProp('barrel', { targetHeight: 0.85, position: [3.3, 0, -1.1] }).then((r) => r && this.scene.add(r.group));
  }

  _buildBalls() {
    this.R = 0.038;
    const geo = new THREE.SphereGeometry(this.R, 28, 22);
    for (let n = 0; n <= 15; n++) {
      const mat = new THREE.MeshStandardMaterial({
        map: makeBallTexture(n),
        roughness: 0.08, // Brilho laqueado de resina fenólica real!
        metalness: 0.05,
        envMapIntensity: 1.35,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.position.set(0, this.tableY + this.R, 0);
      this.scene.add(mesh);
      this.ballMeshes[n] = mesh;
    }
    this._syncBallsFromGame(this.game.balls);
  }

  _syncBallsFromGame(balls = []) {
    for (const b of balls) {
      const m = this.ballMeshes[b.n];
      if (!m) continue;
      m.visible = !b.pocketed;
      m.position.set(b.x, this.tableY + this.R, b.z);
    }
  }

  _buildCueAndGuide() {
    this.cuePivot = new THREE.Group();
    const stickGeo = new THREE.CylinderGeometry(0.0075, 0.018, 1.46, 14);
    stickGeo.rotateZ(Math.PI / 2);
    stickGeo.translate(-0.78, 0, 0);
    const stickMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.28, metalness: 0.08 });
    this.cueStick = new THREE.Mesh(stickGeo, stickMat);
    this.cueStick.rotation.z = -0.08;
    this.cueStick.position.y = 0.05;
    this.cueStick.castShadow = true;
    this.cuePivot.add(this.cueStick);
    this.scene.add(this.cuePivot);

    this.aimLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
      new THREE.LineBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.9, toneMapped: false })
    );
    this.scene.add(this.aimLine);

    this.ghostBall = new THREE.Mesh(
      new THREE.SphereGeometry(this.R, 18, 14),
      new THREE.MeshBasicMaterial({ color: 0xfffbeb, transparent: true, opacity: 0.42, wireframe: true, toneMapped: false })
    );
    this.scene.add(this.ghostBall);
  }

  _buildSpectators() {
    this.actors = [];
    this.game.players.forEach((pid, idx) => {
      const p = this.ctx.playersMap.get(pid) || { character: idx === 0 ? 'mauricio' : 'maria' };
      const actor = createCharacterActor(p.character, { scale: 0.96 });
      actor.root.position.set(idx === 0 ? -1.95 : 1.95, 0, -1.32);
      actor.root.rotation.y = idx === 0 ? 0.65 : -0.65;
      this.scene.add(actor.root);
      this.actors.push({ id: pid, actor });
    });
  }

  _buildUI() {
    this.ctx.mountUI(`
      <div class="mg-panel">
        <button type="button" id="pool-fine-l" class="mg-btn">◀ Fino</button>
        <button type="button" id="pool-fine-r" class="mg-btn">Fino ▶</button>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700">
          Força
          <input id="pool-power" type="range" min="12" max="100" value="65" style="width:110px;accent-color:#ff4d8d" />
        </label>
        <button type="button" id="pool-shoot" class="mg-btn primary">🎱 Tacar!</button>
        <button type="button" id="pool-cam" class="mg-btn">🎥 Visão Topo/3D</button>
      </div>
    `);

    const bindFineHold = (id, dir) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        this._nudgeAim(dir * 0.02);
        this._fineTurn = dir;
      });
      const stop = () => { if (this._fineTurn === dir) this._fineTurn = 0; };
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
    };
    bindFineHold('pool-fine-l', -1);
    bindFineHold('pool-fine-r', 1);
    document.getElementById('pool-power')?.addEventListener('input', (e) => {
      this.aimPower = (+e.target.value) / 100;
      this._emitAim();
    });
    document.getElementById('pool-shoot')?.addEventListener('click', () => this._shoot());
    document.getElementById('pool-cam')?.addEventListener('click', () => {
      this.topView = !this.topView;
      audio.play('click');
    });
  }

  _bindInteractions() {
    this._aiming = false;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.tableY + this.R));
    const ray = new THREE.Raycaster();
    const hit = new THREE.Vector3();

    const aimAtPointer = (e) => {
      if (this.game.turn !== this.ctx.youId || this.shotPlayback) return;
      const cue = this.ballMeshes[0];
      if (!cue || !cue.visible) return;
      const rect = this.ctx.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      ray.setFromCamera(ndc, this.camera);
      if (ray.ray.intersectPlane(plane, hit)) {
        this.aimAngle = Math.atan2(hit.z - cue.position.z, hit.x - cue.position.x);
      }
    };

    this._pd = (e) => {
      if (e.target !== this.ctx.canvas) return;
      this._aiming = true;
      aimAtPointer(e);
    };
    this._pm = (e) => {
      if (!this._aiming) return;
      aimAtPointer(e);
    };
    this._pu = () => { this._aiming = false; };

    this.ctx.canvas.addEventListener('pointerdown', this._pd);
    window.addEventListener('pointermove', this._pm);
    window.addEventListener('pointerup', this._pu);
  }

  _nudgeAim(delta) {
    if (this.game.turn !== this.ctx.youId || this.shotPlayback) return;
    this.aimAngle += delta;
    this._emitAim();
  }

  _emitAim() {
    if (this.game.turn === this.ctx.youId) {
      this.ctx.sendAction({ kind: 'aim', angle: +this.aimAngle.toFixed(4), power: +this.aimPower.toFixed(2) });
    }
  }

  _shoot() {
    if (this.game.turn !== this.ctx.youId || this.shotPlayback) return;
    audio.play('clack', 1);
    this.ctx.sendAction({ kind: 'shoot', angle: this.aimAngle, power: this.aimPower });
  }

  onState(game) {
    this.game = game;
    if (!this.shotPlayback) {
      this._syncBallsFromGame(game.balls);
    }

    const [p0, p1] = game.players;
    const n0 = this.ctx.playersMap.get(p0)?.name || 'J1';
    const n1 = this.ctx.playersMap.get(p1)?.name || 'J2';
    const gLabel = (g) => (g === 'solid' ? 'Lisas (1-7)' : g === 'stripe' ? 'Listradas (9-15)' : 'Mesa Aberta');
    this.ctx.setScoreHTML(
      `<span>${n0}: <b>${gLabel(game.groups?.[p0])}</b></span> <span>·</span> <span><b>${gLabel(game.groups?.[p1])}</b> :${n1}</span>`
    );
    if (game.msg) this.ctx.setStatus(game.msg);

    const shootBtn = document.getElementById('pool-shoot');
    if (shootBtn) shootBtn.disabled = game.turn !== this.ctx.youId || !!this.shotPlayback;
  }

  onTick(data) {
    if (data.type === 'bilhar' && data.turn !== this.ctx.youId && data.aim) {
      this.remoteAim = data.aim;
    }
  }

  onEvent(ev) {
    if (ev.type !== 'bilhar' || ev.ev !== 'shot') return;
    this.shotPlayback = {
      frames: ev.frames || [],
      clacks: [...(ev.clacks || [])],
      pocketed: [...(ev.pocketed || [])],
      cursor: 0,
      strikeAnim: 0.14, // Taco avança rapidamente batendo na branca!
    };
    audio.play('clack', ev.power || 0.8);
  }

  _updateAimVisuals(dt) {
    const cue = this.ballMeshes[0];
    if (this.shotPlayback && this.shotPlayback.strikeAnim > 0) {
      this.shotPlayback.strikeAnim = Math.max(0, this.shotPlayback.strikeAnim - dt);
      this.cuePivot.visible = true;
      this.cueStick.position.x = -0.02;
      this.aimLine.visible = false;
      this.ghostBall.visible = false;
      return;
    }

    if (!cue || !cue.visible || this.shotPlayback || this.game.winner) {
      this.cuePivot.visible = false;
      this.aimLine.visible = false;
      this.ghostBall.visible = false;
      return;
    }

    const activeAngle = this.game.turn === this.ctx.youId ? this.aimAngle : this.remoteAim.angle;
    const activePower = this.game.turn === this.ctx.youId ? this.aimPower : this.remoteAim.power;

    this.cuePivot.visible = true;
    this.cuePivot.position.copy(cue.position);
    this.cuePivot.rotation.y = -activeAngle;
    this.cueStick.position.x = -0.06 - activePower * 0.26;

    const dx = Math.cos(activeAngle);
    const dz = Math.sin(activeAngle);
    let bestT = 2.6;
    for (let n = 1; n <= 15; n++) {
      const m = this.ballMeshes[n];
      if (!m || !m.visible) continue;
      const ox = m.position.x - cue.position.x;
      const oz = m.position.z - cue.position.z;
      const proj = ox * dx + oz * dz;
      if (proj <= 0) continue;
      const perp2 = ox * ox + oz * oz - proj * proj;
      const rSum = this.R * 2;
      if (perp2 < rSum * rSum) {
        const hitT = proj - Math.sqrt(rSum * rSum - perp2);
        if (hitT > 0 && hitT < bestT) bestT = hitT;
      }
    }

    if (dx > 0.001) bestT = Math.min(bestT, (1.28 - this.R - cue.position.x) / dx);
    if (dx < -0.001) bestT = Math.min(bestT, (-1.28 + this.R - cue.position.x) / dx);
    if (dz > 0.001) bestT = Math.min(bestT, (0.64 - this.R - cue.position.z) / dz);
    if (dz < -0.001) bestT = Math.min(bestT, (-0.64 + this.R - cue.position.z) / dz);

    const endX = cue.position.x + dx * bestT;
    const endZ = cue.position.z + dz * bestT;
    this.aimLine.visible = true;
    this.aimLine.geometry.setFromPoints([
      new THREE.Vector3(cue.position.x, this.tableY + this.R, cue.position.z),
      new THREE.Vector3(endX, this.tableY + this.R, endZ),
    ]);

    this.ghostBall.visible = true;
    this.ghostBall.position.set(endX, this.tableY + this.R, endZ);
  }

  update(dt) {
    this.vfx.update(dt);
    if (this._fineTurn !== 0 && this.game.turn === this.ctx.youId && !this.shotPlayback) {
      this.aimAngle += this._fineTurn * 0.55 * dt;
      this._aimSendTimer += dt;
      if (this._aimSendTimer >= 0.07) {
        this._aimSendTimer = 0;
        this._emitAim();
      }
    }

    if (this._aiming && this.game.turn === this.ctx.youId) {
      this._aimSendTimer += dt;
      if (this._aimSendTimer >= 0.06) {
        this._aimSendTimer = 0;
        this._emitAim();
      }
    }

    if (this.shotPlayback) {
      const pb = this.shotPlayback;
      pb.cursor += dt * 30;
      const idx = Math.floor(pb.cursor);
      const frac = pb.cursor - idx;

      while (pb.clacks.length && pb.clacks[0].frame <= idx) {
        const c = pb.clacks.shift();
        audio.play('clack', c.power);
      }
      while (pb.pocketed.length && pb.pocketed[0].frame <= idx) {
        const pk = pb.pocketed.shift();
        audio.play('pocket');
        if (pk.n !== 0) {
          this.vfx.spawnSparks(pk.x, this.tableY + 0.08, pk.z, 0xfbbf24, 12);
          this.vfx.spawnShockwave(pk.x, this.tableY + 0.02, pk.z, 0xfbbf24, 1.5);
        }
      }

      if (idx >= pb.frames.length - 1) {
        const last = pb.frames[pb.frames.length - 1];
        if (last) {
          for (const [n, x, z, pock] of last) {
            const m = this.ballMeshes[n];
            if (m) {
              m.visible = !pock;
              m.position.set(x, this.tableY + this.R, z);
            }
          }
        }
        this.shotPlayback = null;
        this._syncBallsFromGame(this.game.balls);
      } else {
        const f0 = pb.frames[idx];
        const f1 = pb.frames[idx + 1];
        for (let i = 0; i < f0.length; i++) {
          const [n, x0, z0, p0] = f0[i];
          const [, x1, z1, p1] = f1[i];
          const m = this.ballMeshes[n];
          if (!m) continue;
          if (p0 || p1) {
            m.visible = false;
            continue;
          }
          m.visible = true;
          const nx = x0 + (x1 - x0) * frac;
          const nz = z0 + (z1 - z0) * frac;
          const moveX = nx - m.position.x;
          const moveZ = nz - m.position.z;
          const dist = Math.hypot(moveX, moveZ);
          if (dist > 0.0002) {
            const axis = new THREE.Vector3(moveZ, 0, -moveX).normalize();
            m.rotateOnWorldAxis(axis, dist / this.R);
          }
          m.position.set(nx, this.tableY + this.R, nz);
        }
      }
    }

    this._updateAimVisuals(dt);

    const cuePos = this.ballMeshes[0]?.position;
    for (const a of this.actors) {
      let lookYaw = 0;
      if (cuePos) {
        lookYaw = Math.max(-0.5, Math.min(0.5, (cuePos.x - a.actor.root.position.x) * 0.15));
      }
      a.actor.update(dt, { lookYaw, anim: this.game.winner === a.id ? 'dance' : 'idle' });
    }

    const portraitPull = window.innerWidth < window.innerHeight ? 0.65 : 0;
    if (this.topView) this.camSpring.target.set(0, 3.95 + portraitPull, 0.01);
    else this.camSpring.target.set(0, 2.55 + portraitPull * 0.4, 2.35 + portraitPull);

    this.camera.position.copy(this.camSpring.step(dt));
    this.camera.lookAt(0, this.tableY, 0);
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    adaptCameraForAspect(this.camera, 44, 1.42, 78);
  }

  dispose() {
    this.ctx.canvas.removeEventListener('pointerdown', this._pd);
    window.removeEventListener('pointermove', this._pm);
    window.addEventListener('pointerup', this._pu);
  }
}
