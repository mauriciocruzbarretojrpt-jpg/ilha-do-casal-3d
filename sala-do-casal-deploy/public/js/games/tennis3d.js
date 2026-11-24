// 🎾 TÊNIS 3D AAA — Estádio ao pôr do sol com céu físico, refletores HDR, empunhadura real nos dedos,
// inércia suave de movimento, olhar seguindo a bola, faíscas HDR e screen-shake no Smash!

import * as THREE from 'three';
import { createCharacterActor, createNameBadgeSprite, createStylizedMat } from '../characters.js';
import { SpringVec3, SurfaceTextures, VFXSystem, createAtmosphericSky, adaptCameraForAspect, isMobileDevice } from '../graphics.js';
import { spawnAnimeProp } from '../propLoader.js';
import { audio } from '../audio.js';

function createRacketMesh(accentHex) {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.025, 0.28, 12),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 })
  );
  handle.position.y = 0.14;

  const throat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.02, 0.12, 10),
    new THREE.MeshStandardMaterial({ color: accentHex, metalness: 0.4, roughness: 0.25 })
  );
  throat.position.y = 0.29;

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.165, 0.02, 10, 28),
    new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: 0.25,
      metalness: 0.45,
      roughness: 0.22,
    })
  );
  rim.scale.set(0.85, 1.15, 1);
  rim.position.y = 0.48;

  const strings = new THREE.Mesh(
    new THREE.CircleGeometry(0.155, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      wireframe: true,
    })
  );
  strings.scale.set(0.82, 1.12, 1);
  strings.position.y = 0.48;

  g.add(handle, throat, rim, strings);
  g.rotation.x = Math.PI / 2;
  return g;
}

export class Tennis3DGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x283558, 0.0085);

    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.15, 240);
    adaptCameraForAspect(this.camera, 48, 1.28, 76);
    this.vfx = new VFXSystem(this.scene);

    this.game = ctx.initialGame;
    this.mySide = this.game.players[0] === ctx.youId ? 1 : -1;
    this.myPos = { x: 0, z: this.mySide * 10.2, vx: 0, vz: 0 };
    this.remotePos = {};
    this.ballState = { x: 0, y: 1.5, z: 10, vx: 0, vy: 0, vz: 0 };
    this.isSmashBall = false;

    this.camSpring = new SpringVec3(0, 7.5, this.mySide * 17.8, 90, 18);
    this.keys = new Set();
    this.touchDir = { x: 0, z: 0 };
    this.trailMeshes = [];
    this._moveSendTimer = 0;

    this._buildCourt();
    this._buildActors();
    this._buildUI();
    this._bindEvents();
    this.onState(this.game);
  }

  _buildCourt() {
    const { sky } = createAtmosphericSky({ elevation: 12, azimuth: 135, turbidity: 5.5, rayleigh: 2.1 });
    this.scene.add(sky);

    this.scene.add(new THREE.HemisphereLight(0xffe8d6, 0x1e293b, 0.9));

    const sun = new THREE.DirectionalLight(0xfff1dc, 2.15);
    sun.position.set(16, 26, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    const d = 18;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.scene.add(sun);

    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(58, 68),
      new THREE.MeshStandardMaterial({ map: SurfaceTextures.grass(18), roughness: 0.78 })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.receiveShadow = true;
    this.scene.add(outer);

    const surround = new THREE.Mesh(
      new THREE.PlaneGeometry(14.6, 29.0),
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.65 })
    );
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = 0.008;
    surround.receiveShadow = true;
    this.scene.add(surround);

    const court = new THREE.Mesh(
      new THREE.PlaneGeometry(9.0, 23.0),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.52, metalness: 0.05 })
    );
    court.rotation.x = -Math.PI / 2;
    court.position.y = 0.015;
    court.receiveShadow = true;
    this.scene.add(court);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const addLine = (w, l, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.022, z);
      this.scene.add(m);
    };
    addLine(9.0, 0.12, 0, 11.5);
    addLine(9.0, 0.12, 0, -11.5);
    addLine(0.12, 23.0, -4.5, 0);
    addLine(0.12, 23.0, 4.5, 0);
    addLine(9.0, 0.08, 0, 6.4);
    addLine(9.0, 0.08, 0, -6.4);
    addLine(0.08, 12.8, 0, 0);

    // Rede 3D
    const netMesh = new THREE.Mesh(
      new THREE.BoxGeometry(10.2, 0.9, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.45, roughness: 0.7 })
    );
    netMesh.position.set(0, 0.45, 0);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(10.3, 0.08, 0.065), lineMat);
    tape.position.set(0, 0.93, 0);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.65, roughness: 0.3 });
    for (const px of [-5.15, 5.15]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.06, 14), postMat);
      post.position.set(px, 0.53, 0);
      post.castShadow = true;
      this.scene.add(post);
    }
    this.scene.add(netMesh, tape);

    // Arquibancadas 3D reais CC0 (Kenney Racing) + Cerejeiras Sakura + Torres de Refletores
    for (const sx of [-1, 1]) {
      for (const gz of [-7.5, 0, 7.5]) {
        spawnAnimeProp('grandstand', {
          targetWidth: 7.4,
          position: [sx * 10.2, 0, gz],
          rotY: sx < 0 ? Math.PI / 2 : -Math.PI / 2,
        }).then((res) => { if (res) this.scene.add(res.group); });
      }

      spawnAnimeProp('bench', {
        targetWidth: 1.9,
        position: [sx * 6.4, 0, 0],
        rotY: sx < 0 ? Math.PI / 2 : -Math.PI / 2,
      }).then((res) => { if (res) this.scene.add(res.group); });

      for (const tz of [-16.5, 16.5]) {
        spawnAnimeProp('tree_1', {
          targetHeight: 5.0,
          leafTint: '#ff8fb8',
          position: [sx * 9.5, 0, tz],
        }).then((res) => { if (res) this.scene.add(res.group); });
      }

      for (const sz of [-12, 12]) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 9.5, 10), postMat);
        tower.position.set(sx * 12.2, 4.75, sz);
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 0.65, 0.2),
          new THREE.MeshBasicMaterial({ color: 0xfffbeb, toneMapped: false })
        );
        panel.position.set(sx * 11.9, 9.5, sz);
        panel.lookAt(0, 0, 0);
        this.scene.add(tower, panel);
      }
    }

    // Bola 3D HDR + Sombra Gaussiana de profundidade + Rastro
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 20, 16),
      new THREE.MeshStandardMaterial({
        color: 0xd9f99d,
        emissive: 0xa3e635,
        emissiveIntensity: 0.85,
        roughness: 0.35,
        toneMapped: false,
      })
    );
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);

    const shGeo = new THREE.PlaneGeometry(0.65, 0.65);
    shGeo.rotateX(-Math.PI / 2);
    this.ballShadow = new THREE.Mesh(
      shGeo,
      new THREE.MeshBasicMaterial({ map: SurfaceTextures.blobShadow(), transparent: true, opacity: 0.85, depthWrite: false })
    );
    this.ballShadow.position.y = 0.025;
    this.scene.add(this.ballShadow);

    for (let i = 0; i < 12; i++) {
      const tm = new THREE.Mesh(
        new THREE.SphereGeometry(0.12 * (1 - i * 0.065), 10, 8),
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.45 * (1 - i / 12),
          toneMapped: false,
        })
      );
      tm.visible = false;
      this.scene.add(tm);
      this.trailMeshes.push(tm);
    }
    this.trailHistory = [];
  }

  _buildActors() {
    this.actors = {};
    this.game.players.forEach((pid, idx) => {
      const pInfo = this.ctx.playersMap.get(pid) || { name: 'Jogador', character: idx === 0 ? 'mauricio' : 'maria' };
      const side = idx === 0 ? 1 : -1;
      const actor = createCharacterActor(pInfo.character);
      actor.onFootstep = (fx, fz) => this.vfx.spawnDust(fx, 0.02, fz, 2, 0.75);
      actor.root.position.set(0, 0, side * 10.2);
      actor.root.rotation.y = side > 0 ? Math.PI : 0;

      const racket = createRacketMesh(pInfo.character === 'maria' ? 0xff4d8d : 0x4f8cff);
      actor.anchors.rightHand.add(racket);

      const badge = createNameBadgeSprite(pInfo.name, pInfo.character === 'maria' ? '#ff4d8d' : '#4f8cff');
      badge.position.y = 0.22;
      actor.anchors.headTop.add(badge);

      this.scene.add(actor.root);
      this.actors[pid] = { actor, side };
      this.remotePos[pid] = { x: 0, z: side * 10.2 };
    });
  }

  _buildUI() {
    const mob = isMobileDevice();
    this.ctx.mountUI(`
      <div class="mg-panel">
        ${mob ? `
          <div style="display:flex;gap:6px;align-items:center">
            <button type="button" id="tn-left" class="mg-btn">◀</button>
            <button type="button" id="tn-up" class="mg-btn">▲ Rede</button>
            <button type="button" id="tn-down" class="mg-btn">▼ Fundo</button>
            <button type="button" id="tn-right" class="mg-btn">▶</button>
          </div>
        ` : `
          <span style="font-size:12.5px">
            <b>WASD / Setas</b> Mover · <b>Espaço / Clique</b> Rebater (perto da bola = Smash!)
          </span>
        `}
        <button type="button" id="btn-tennis-swing" class="mg-btn green">Rebater / Smash!</button>
      </div>
    `);
    document.getElementById('btn-tennis-swing')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._swing(null);
    });

    const bindDir = (id, axis, val) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        this.touchDir[axis] = val;
      });
      const clear = () => { if (this.touchDir[axis] === val) this.touchDir[axis] = 0; };
      btn.addEventListener('pointerup', clear);
      btn.addEventListener('pointercancel', clear);
    };
    bindDir('tn-left', 'x', -1);
    bindDir('tn-right', 'x', 1);
    bindDir('tn-up', 'z', -1);
    bindDir('tn-down', 'z', 1);
  }

  _bindEvents() {
    this._onKeyDown = (e) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ') {
        e.preventDefault();
        this._swing();
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());

    let swipeStart = null;
    this._onPointerDown = (e) => {
      if (e.target !== this.ctx.canvas) return;
      swipeStart = { x: e.clientX, y: e.clientY };
    };
    this._onPointerUp = (e) => {
      if (!swipeStart) return;
      const dx = e.clientX - swipeStart.x;
      const aimOffset = Math.max(-3.6, Math.min(3.6, (dx / window.innerWidth) * 10 * this.mySide));
      swipeStart = null;
      this._swing(aimOffset);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.ctx.canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);
  }

  _swing(customAim = null) {
    let aimX = customAim;
    if (aimX === null) {
      let dir = 0;
      if (this.keys.has('a') || this.keys.has('arrowleft')) dir -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) dir += 1;
      aimX = dir * 3.2 * this.mySide + (Math.random() - 0.5) * 0.8;
    }

    this.actors[this.ctx.youId]?.actor.triggerSwing();
    audio.play('click');

    const dist = Math.hypot(this.ballState.x - this.myPos.x, this.ballState.z - this.myPos.z);
    const power = dist < 1.45 ? 1.0 : 0.72;
    this.ctx.sendAction({ kind: 'swing', aimX, power });
  }

  onState(game) {
    this.game = game;
    const [p0, p1] = game.players;
    const n0 = this.ctx.playersMap.get(p0)?.name || 'J1';
    const n1 = this.ctx.playersMap.get(p1)?.name || 'J2';
    const s0 = game.points?.[p0] || 0;
    const s1 = game.points?.[p1] || 0;
    const rallyBadge = game.rally > 2 ? ` · 🔥 ${game.rally} trocas` : '';
    this.ctx.setScoreHTML(`<span>${n0}: <b>${s0}</b></span> <span>×</span> <span><b>${s1}</b> :${n1}</span>`);
    if (game.msg) this.ctx.setStatus(game.msg + rallyBadge);
  }

  onTick(data) {
    if (data.type !== 'tenis') return;
    const [x, y, z, vx, vy, vz] = data.ball;
    Object.assign(this.ballState, { x, y, z, vx, vy, vz });
    if (data.pos) {
      for (const [id, pos] of Object.entries(data.pos)) {
        if (id !== this.ctx.youId) this.remotePos[id] = pos;
      }
    }
  }

  onEvent(ev) {
    if (ev.type !== 'tenis') return;
    if (ev.ev === 'swing') {
      this.actors[ev.id]?.actor.triggerSwing();
    } else if (ev.ev === 'hit') {
      this.actors[ev.id]?.actor.triggerSwing();
      this.isSmashBall = !!ev.smash;
      audio.play(ev.smash ? 'smash' : 'racket');
      if (ev.smash) {
        this.ctx.shake?.(0.18, 0.24);
        this.vfx.spawnSparks(this.ballState.x, this.ballState.y, this.ballState.z, 0xf97316, 18);
        this.ctx.setStatus(`💥 SMASH DOURADO!! (${ev.rally || 1} trocas 🔥)`);
      } else {
        this.vfx.spawnSparks(this.ballState.x, this.ballState.y, this.ballState.z, 0xd9f99d, 6);
      }
    } else if (ev.ev === 'bounce') {
      audio.play('bounce');
      this.vfx.spawnShockwave(ev.x, 0.02, ev.z, this.isSmashBall ? 0xf97316 : 0xfef08a, 2.2);
    } else if (ev.ev === 'point') {
      this.isSmashBall = false;
      this.ctx.shake?.(0.08, 0.16);
    }
  }

  update(dt) {
    this.vfx.update(dt);

    let ix = this.touchDir.x;
    let iz = this.touchDir.z;
    if (this.keys.has('a') || this.keys.has('arrowleft')) ix -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) ix += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) iz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) iz += 1;

    const topSpd = 7.6;
    let desVx = 0;
    let desVz = 0;
    if (ix !== 0 || iz !== 0) {
      const len = Math.hypot(ix, iz);
      desVx = (ix / len) * topSpd * this.mySide;
      desVz = (iz / len) * topSpd * this.mySide;
    } else if (isMobileDevice() && this.game.phase === 'play') {
      // Auxílio inteligente sutil no celular quando o jogador solta o direcional
      if (Math.sign(this.ballState.vz) === this.mySide) {
        const dx = this.ballState.x - this.myPos.x;
        if (Math.abs(dx) > 0.25) desVx = Math.sign(dx) * Math.min(Math.abs(dx) * 4.6, 6.2);
      }
    }

    const grip = 1 - Math.exp(-16 * dt);
    this.myPos.vx += (desVx - this.myPos.vx) * grip;
    this.myPos.vz += (desVz - this.myPos.vz) * grip;
    this.myPos.x = Math.max(-4.5, Math.min(4.5, this.myPos.x + this.myPos.vx * dt));
    const nextZ = this.myPos.z + this.myPos.vz * dt;
    this.myPos.z = this.mySide > 0
      ? Math.max(2.0, Math.min(12.2, nextZ))
      : Math.max(-12.2, Math.min(-2.0, nextZ));

    this._moveSendTimer += dt;
    if (this._moveSendTimer >= 0.045) {
      this._moveSendTimer = 0;
      this.ctx.sendAction({ kind: 'move', x: +this.myPos.x.toFixed(2), z: +this.myPos.z.toFixed(2) });
    }

    if (this.game.phase === 'play') {
      this.ballState.vy -= 9.8 * dt;
      this.ballState.x += this.ballState.vx * dt;
      this.ballState.y = Math.max(0.12, this.ballState.y + this.ballState.vy * dt);
      this.ballState.z += this.ballState.vz * dt;
    }
    this.ballMesh.position.set(this.ballState.x, this.ballState.y, this.ballState.z);
    this.ballShadow.position.set(this.ballState.x, 0.025, this.ballState.z);
    this.ballShadow.scale.setScalar(Math.max(0.4, 1.15 - this.ballState.y * 0.2));

    this.trailHistory.unshift(this.ballMesh.position.clone());
    if (this.trailHistory.length > this.trailMeshes.length) this.trailHistory.pop();
    for (let i = 0; i < this.trailMeshes.length; i++) {
      const tm = this.trailMeshes[i];
      if (this.trailHistory[i] && this.game.phase === 'play') {
        tm.visible = true;
        tm.position.copy(this.trailHistory[i]);
        tm.material.color.setHex(this.isSmashBall ? 0xff7b00 : 0xfef08a);
      } else {
        tm.visible = false;
      }
    }

    for (const [id, entry] of Object.entries(this.actors)) {
      const target = id === this.ctx.youId ? this.myPos : (this.remotePos[id] || { x: 0, z: entry.side * 10.2 });
      const prevX = entry.actor.root.position.x;
      const prevZ = entry.actor.root.position.z;
      entry.actor.root.position.x += (target.x - prevX) * (1 - Math.exp(-16 * dt));
      entry.actor.root.position.z += (target.z - prevZ) * (1 - Math.exp(-16 * dt));
      const vx = (entry.actor.root.position.x - prevX) / Math.max(0.001, dt);
      const vz = (entry.actor.root.position.z - prevZ) / Math.max(0.001, dt);
      const moveSpd = Math.hypot(vx, vz);

      // Leve rotação natural do tronco na direção da corrida lateral mantendo foco na quadra!
      const baseFacing = entry.side > 0 ? Math.PI : 0;
      const lateralTilt = Math.max(-0.45, Math.min(0.45, -vx * entry.side * 0.06));
      entry.actor.root.rotation.y = baseFacing + lateralTilt;

      // Cabeça olha para a bola!
      const dxBall = this.ballState.x - entry.actor.root.position.x;
      const dzBall = this.ballState.z - entry.actor.root.position.z;
      let lookYaw = Math.atan2(dxBall, dzBall) - entry.actor.root.rotation.y;
      while (lookYaw > Math.PI) lookYaw -= Math.PI * 2;
      while (lookYaw < -Math.PI) lookYaw += Math.PI * 2;
      lookYaw = Math.max(-0.65, Math.min(0.65, lookYaw));

      // Detecta se o tenista está avançando para a rede ou recuando de costas (WalkBack real!)
      const forwardDot = vz * (-entry.side);
      const retreating = moveSpd > 0.35 && forwardDot < -0.35;

      entry.actor.update(dt, {
        speed: moveSpd,
        holdingProp: true,
        lookYaw,
        animBackwards: retreating,
        anim: this.game.winner === id ? 'dance' : moveSpd > 0.35 ? (retreating ? 'walkback' : 'run') : 'idle',
      });
    }

    this.camSpring.target.set(this.myPos.x * 0.34, 8.2, this.mySide * 19.6);
    this.camera.position.copy(this.camSpring.step(dt));
    this.camera.lookAt(this.ballState.x * 0.16, 0.65, this.mySide * 2.2);
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    adaptCameraForAspect(this.camera, 48, 1.28, 76);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.ctx.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointerup', this._onPointerUp);
  }
}
