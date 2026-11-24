// 🏎️ CORRIDA DE KART 3D AAA — Céu atmosférico físico, asfalto PBR texturizado, suspensão e body-roll
// nos karts, rodas dianteiras que esterçam, fumaça de drift, FOV dinâmico de velocidade e Bloom nos Turbos!

import * as THREE from 'three';
import { createCharacterActor, createNameBadgeSprite, createStylizedMat } from '../characters.js';
import { SpringVec3, SurfaceTextures, VFXSystem, createAtmosphericSky, adaptCameraForAspect, isMobileDevice } from '../graphics.js';
import { spawnAnimeProp } from '../propLoader.js';
import { audio } from '../audio.js';

const CONTROL_PTS = [
  [0, -28], [22, -28], [38, -18], [42, 0],
  [36, 18], [20, 26], [4, 20], [-8, 26],
  [-26, 28], [-40, 18], [-42, 0], [-36, -18],
  [-22, -28],
];

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

function buildLocalTrack(samples = 160) {
  const n = CONTROL_PTS.length;
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const u = (i / samples) * n;
    const seg = Math.floor(u) % n;
    const t = u - Math.floor(u);
    pts.push(catmullRom(
      CONTROL_PTS[(seg - 1 + n) % n],
      CONTROL_PTS[seg],
      CONTROL_PTS[(seg + 1) % n],
      CONTROL_PTS[(seg + 2) % n],
      t
    ));
  }
  const spine = pts.map((p, i) => {
    const prev = pts[(i - 1 + samples) % samples];
    const next = pts[(i + 1) % samples];
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    return { x: p[0], z: p[1], tx, tz, nx: -tz, nz: tx };
  });
  const boosts = [24, 66, 108, 142].map((idx, k) => {
    const s = spine[idx];
    const side = k % 2 === 0 ? 2.1 : -2.1;
    return { x: s.x + s.nx * side, z: s.z + s.nz * side, angle: Math.atan2(s.tx, s.tz) };
  });
  return { spine, boosts, halfWidth: 4.8 };
}

function createKart3DMesh(charKey) {
  const isMaria = charKey === 'maria';
  const primary = isMaria ? 0xff4d8d : 0x3b82f6;
  const root = new THREE.Group();
  const chassisTilt = new THREE.Group();
  root.add(chassisTilt);

  // Pintura automotiva metálica brilhante PBR!
  const paintMat = new THREE.MeshStandardMaterial({
    color: primary,
    roughness: 0.2,
    metalness: 0.42,
    envMapIntensity: 1.25,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.34, 2.08), paintMat);
  body.position.y = 0.34;
  body.castShadow = true;

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.96, 0.24, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.22, metalness: 0.2 })
  );
  nose.position.set(0, 0.28, 1.16);
  nose.castShadow = true;

  // Faróis dianteiros HDR
  for (const sx of [-0.34, 0.34]) {
    const hl = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfffbeb, toneMapped: false })
    );
    hl.position.set(sx, 0.34, 1.44);
    chassisTilt.add(hl);
  }

  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(1.36, 0.08, 0.36),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.28, metalness: 0.35 })
  );
  wing.position.set(0, 0.8, -0.92);
  wing.castShadow = true;

  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 });
  for (const sx of [-0.4, 0.4]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.12), darkMetal);
    strut.position.set(sx, 0.6, -0.9);
    chassisTilt.add(strut);
  }

  const wheelCol = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 10), darkMetal);
  wheelCol.position.set(0, 0.62, 0.38);
  wheelCol.rotation.x = -0.6;
  const steerWheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 10, 18), darkMetal);
  steerWheel.position.set(0, 0.78, 0.24);
  steerWheel.rotation.x = -0.6;

  // 4 Rodas 3D (dianteiras esterçam!)
  const wheels = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.82 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.8 });
  const coords = [
    [-0.72, 0.72, true], [0.72, 0.72, true],
    [-0.74, -0.72, false], [0.74, -0.72, false],
  ];
  for (const [wx, wz, isFront] of coords) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wx, 0.26, wz);
    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.25, 18), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.27, 14), rimMat);
    rim.rotation.z = Math.PI / 2;
    spinGroup.add(tire, rim);
    steerPivot.add(spinGroup);
    root.add(steerPivot);
    wheels.push({ steerPivot, spinGroup, isFront });
  }

  // Escapamentos cromados + Chamas HDR de Turbo!
  const flames = new THREE.Group();
  for (const sx of [-0.32, 0.32]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.32, 12), rimMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(sx, 0.36, -1.08);
    chassisTilt.add(pipe);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.72, 12),
      new THREE.MeshBasicMaterial({ color: 0xff8800, toneMapped: false })
    );
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(sx, 0.36, -1.52);
    flames.add(flame);
  }
  flames.visible = false;

  chassisTilt.add(body, nose, wing, wheelCol, steerWheel, flames);

  // Carrega também a carenagem 3D real da Kenney (kart-oobi / kart-oopi CC0) sobre o chassi!
  spawnAnimeProp(isMaria ? 'kart_pink' : 'kart_blue', {
    targetWidth: 2.05,
    stripDriver: true,
  }).then((res) => {
    if (res) {
      body.visible = false;
      nose.visible = false;
      res.group.position.set(0, 0.04, 0.05);
      chassisTilt.add(res.group);
    }
  });

  return { root, chassisTilt, wheels, flames, steerWheel };
}

export class Kart3DGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.game = ctx.initialGame;
    this.track = buildLocalTrack(160);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9bd4f5, 0.0052);

    this.camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.15, 320);
    adaptCameraForAspect(this.camera, 56, 1.25, 78);
    this.camSpring = new SpringVec3(0, 4, -36, 95, 18);
    this.vfx = new VFXSystem(this.scene);

    this.keys = new Set();
    this.touchInput = { left: false, right: false, brake: false };
    this.kartNodes = {};
    this._inputSendTimer = 0;
    this._smokeTimer = 0;
    this._lastCountdownSec = null;

    this._buildCircuit3D();
    this._buildKarts();
    this._buildUI();
    this._bindInputs();
    this.onState(this.game);
  }

  _buildCircuit3D() {
    const { sky } = createAtmosphericSky({ elevation: 24, azimuth: 135, turbidity: 4.2, rayleigh: 1.6 });
    this.scene.add(sky);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3f6212, 0.95));
    const sun = new THREE.DirectionalLight(0xfffbeb, 2.25);
    sun.position.set(35, 52, 28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    const d = 58;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.scene.add(sun);

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshStandardMaterial({ map: SurfaceTextures.grass(28), roughness: 0.8 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);

    // Malha contínua de asfalto PBR com UVs!
    const spine = this.track.spine;
    const n = spine.length;
    const hw = this.track.halfWidth;
    const roadVerts = [];
    const roadUVs = [];
    const roadIndices = [];

    const redCurb = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.55 });
    const whiteCurb = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55 });

    for (let i = 0; i <= n; i++) {
      const s = spine[i % n];
      roadVerts.push(s.x - s.nx * hw, 0.03, s.z - s.nz * hw);
      roadVerts.push(s.x + s.nx * hw, 0.03, s.z + s.nz * hw);
      roadUVs.push(0, i * 0.35, 1, i * 0.35);

      if (i < n) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const dIdx = a + 3;
        roadIndices.push(a, c, b, b, c, dIdx);

        const curbMat = i % 2 === 0 ? redCurb : whiteCurb;
        for (const side of [-1, 1]) {
          const curb = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 1.82), curbMat);
          curb.position.set(s.x + s.nx * side * (hw + 0.32), 0.05, s.z + s.nz * side * (hw + 0.32));
          curb.rotation.y = Math.atan2(s.tx, s.tz);
          curb.receiveShadow = true;
          this.scene.add(curb);
        }
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUVs, 2));
    roadGeo.setIndex(roadIndices);
    roadGeo.computeVertexNormals();
    const roadMesh = new THREE.Mesh(
      roadGeo,
      new THREE.MeshStandardMaterial({ map: SurfaceTextures.asphalt(12), roughness: 0.72, metalness: 0.06 })
    );
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);

    // Pórtico de Largada / Chegada
    const s0 = spine[0];
    const arch = new THREE.Group();
    arch.position.set(s0.x, 0, s0.z);
    arch.rotation.y = Math.atan2(s0.tx, s0.tz);

    const finishStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2, 1.5),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    finishStrip.rotation.x = -Math.PI / 2;
    finishStrip.position.y = 0.05;
    arch.add(finishStrip);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.25 });
    for (const sx of [-hw - 0.6, hw + 0.6]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 5.4, 16), pillarMat);
      pillar.position.set(sx, 2.7, 0);
      pillar.castShadow = true;
      arch.add(pillar);
    }
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(hw * 2 + 2.1, 1.15, 0.48),
      new THREE.MeshStandardMaterial({ color: 0xe11d48, emissive: 0xe11d48, emissiveIntensity: 0.35, roughness: 0.3 })
    );
    banner.position.y = 5.1;
    banner.castShadow = true;
    arch.add(banner);
    this.scene.add(arch);

    // 4 Rampas HDR de Turbo ⚡
    this.boostPads = [];
    for (const bp of this.track.boosts) {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.09, 3.3),
        new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xff9500,
          emissiveIntensity: 2.2,
          toneMapped: false,
        })
      );
      pad.position.set(bp.x, 0.075, bp.z);
      pad.rotation.y = bp.angle;
      this.scene.add(pad);
      this.boostPads.push(pad);
    }

    // Modelos 3D reais gratuitos CC0 ao redor do autódromo (Arquibancadas, Bandeiras, Barreiras, Cerejeiras e Palmeiras!)
    for (const [gx, gz, gy] of [[0, -37.5, 0], [14, -37.5, 0], [-14, -37.5, 0], [0, 36.5, Math.PI]]) {
      spawnAnimeProp('grandstand', { targetWidth: 9.2, position: [gx, 0, gz], rotY: gy }).then((r) => r && this.scene.add(r.group));
    }
    for (const [fx, fz] of [[-6.2, -28], [6.2, -28], [-6.2, -24], [6.2, -24]]) {
      spawnAnimeProp('flag_checkers', { targetHeight: 3.4, position: [fx, 0, fz] }).then((r) => r && this.scene.add(r.group));
    }
    for (let i = 8; i < n; i += 10) {
      const s = spine[i];
      const bKey = (i / 10) % 2 === 0 ? 'barrier_red' : 'barrier_white';
      spawnAnimeProp(bKey, {
        targetWidth: 2.1,
        position: [s.x + s.nx * (hw + 1.35), 0, s.z + s.nz * (hw + 1.35)],
        rotY: Math.atan2(s.tx, s.tz),
      }).then((r) => r && this.scene.add(r.group));
    }

    const treeCoords = [
      [0, 0], [16, -8], [-18, -8], [15, 10], [-16, 10],
      [54, 0], [-54, 0], [0, -44], [0, 44], [44, 30], [-44, 30],
    ];
    treeCoords.forEach(([tx, tz], idx) => {
      const key = idx % 3 === 0 ? 'palm_1' : (idx % 2 === 0 ? 'tree_1' : 'tree_2');
      const tint = key === 'palm_1' ? undefined : (idx % 2 === 0 ? '#ff8fb8' : '#ffd166');
      spawnAnimeProp(key, {
        targetHeight: 6.4,
        leafTint: tint,
        position: [tx, 0, tz],
        rotY: idx * 1.3,
      }).then((r) => r && this.scene.add(r.group));
    });
  }

  _buildKarts() {
    for (const pid of this.game.players) {
      const pInfo = this.ctx.playersMap.get(pid) || { name: 'Piloto', character: 'mauricio' };
      const initK = this.game.karts[pid] || { x: 0, z: -28, angle: 0 };

      const kart = createKart3DMesh(pInfo.character);
      const driver = createCharacterActor(pInfo.character, { scale: 0.92, showShadowRing: false });
      driver.root.position.set(0, 0.35, -0.1);
      kart.chassisTilt.add(driver.root);

      const badge = createNameBadgeSprite(pInfo.name, pInfo.character === 'maria' ? '#ff4d8d' : '#4f8cff');
      badge.position.set(0, 2.18, 0);
      kart.root.add(badge);

      kart.root.position.set(initK.x, 0, initK.z);
      kart.root.rotation.y = initK.angle;
      this.scene.add(kart.root);

      if (pid === this.ctx.youId) {
        this.camSpring.snap(
          initK.x - Math.sin(initK.angle) * 6.5,
          3.3,
          initK.z - Math.cos(initK.angle) * 6.5
        );
      }

      this.kartNodes[pid] = {
        kart,
        driver,
        targetX: initK.x,
        targetZ: initK.z,
        targetAngle: initK.angle,
        speed: 0,
        lap: 1,
        prog: 0,
        boost: false,
        roll: 0,
      };
    }
  }

  _buildUI() {
    const isTouch = isMobileDevice();
    this.ctx.mountUI(`
      <div class="mg-panel" id="kart-hud-bar">
        <span id="kart-pos-badge" style="font-weight:900;font-size:16px">1º Lugar</span>
        <span>·</span>
        <span id="kart-lap-badge" style="font-weight:800">Volta 1 / 3</span>
        <span>·</span>
        <span id="kart-spd-badge" style="font-family:monospace;font-size:14px">0 km/h</span>
      </div>
      ${isTouch ? `
        <div style="display:flex;gap:12px;margin-top:4px;width:min(94vw,420px);justify-content:space-between">
          <button type="button" id="k-left" class="mg-btn primary" style="flex:1;padding:13px 10px">◀ ESQ</button>
          <button type="button" id="k-brake" class="mg-btn" style="padding:13px 14px">FREIO</button>
          <button type="button" id="k-right" class="mg-btn blue" style="flex:1;padding:13px 10px">DIR ▶</button>
        </div>
      ` : ''}
    `);

    const bindHold = (id, field) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        this.touchInput[field] = true;
      });
      const release = () => { this.touchInput[field] = false; };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    };
    bindHold('k-left', 'left');
    bindHold('k-right', 'right');
    bindHold('k-brake', 'brake');
  }

  _bindInputs() {
    this._kd = (e) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      this.keys.add(e.key.toLowerCase());
    };
    this._ku = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
  }

  onState(game) {
    this.game = game;
    if (game.msg) this.ctx.setStatus(game.msg);
    this.ctx.setScoreHTML(`<span>🏁 Circuito 3 Voltas</span>`);
  }

  onTick(data) {
    if (data.type !== 'corrida') return;
    this.game.phase = data.phase;

    if (data.phase === 'countdown' && data.startIn > 0) {
      const sec = Math.ceil(data.startIn / 1000);
      if (sec !== this._lastCountdownSec) {
        this._lastCountdownSec = sec;
        audio.play('countdown');
        this.ctx.setStatus(`Largada em ${sec}... 🏎️`);
      }
    }

    for (const [id, snap] of Object.entries(data.karts || {})) {
      const node = this.kartNodes[id];
      if (!node) continue;
      node.targetX = snap.x;
      node.targetZ = snap.z;
      node.targetAngle = snap.a;
      node.speed = snap.s;
      node.lap = snap.lap;
      node.prog = snap.prog;
      node.boost = !!snap.boost;
    }

    const me = this.kartNodes[this.ctx.youId];
    const otherId = this.game.players.find((p) => p !== this.ctx.youId);
    const other = this.kartNodes[otherId];
    if (me) {
      const first = !other || me.prog >= other.prog;
      const posEl = document.getElementById('kart-pos-badge');
      const lapEl = document.getElementById('kart-lap-badge');
      const spdEl = document.getElementById('kart-spd-badge');
      if (posEl) posEl.textContent = first ? '🥇 1º Lugar' : '🥈 2º Lugar';
      if (lapEl) lapEl.textContent = `Volta ${me.lap} / 3`;
      if (spdEl) spdEl.textContent = `${Math.round(Math.abs(me.speed) * 4.2)} km/h${me.boost ? ' ⚡' : ''}`;
    }
  }

  onEvent(ev) {
    if (ev.type !== 'corrida') return;
    if (ev.ev === 'go') {
      audio.play('go');
      this.ctx.setStatus('VALENDO!! Acelere até os Turbos ⚡!');
    } else if (ev.ev === 'boost') {
      audio.play('boost');
      const k = this.kartNodes[ev.id]?.kart.root.position;
      if (k) this.vfx.spawnSparks(k.x, 0.5, k.z, 0xfbbf24, 14);
      if (ev.id === this.ctx.youId) {
        this.ctx.shake?.(0.14, 0.25);
        this.ctx.setStatus('⚡ TURBO ATIVADO!! 🔥');
      }
    } else if (ev.ev === 'lap' && ev.id === this.ctx.youId) {
      audio.play('match');
      this.ctx.setStatus(`🏁 Volta ${ev.lap} de 3!`);
    } else if (ev.ev === 'bump') {
      audio.play('bump');
      this.ctx.shake?.(0.1, 0.16);
      this.vfx.spawnSparks(ev.x, 0.5, ev.z, 0xffffff, 8);
    }
  }

  update(dt, elapsed) {
    this.vfx.update(dt);
    this.boostPads.forEach((p, idx) => {
      p.material.emissiveIntensity = 1.8 + Math.sin(elapsed * 8 + idx) * 0.55;
    });

    const isTouch = isMobileDevice();
    let throttle = isTouch ? 1 : 0;
    let steer = 0;
    let brake = this.touchInput.brake;

    if (this.keys.has('w') || this.keys.has('arrowup')) throttle = 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) throttle = -1;
    if (this.keys.has(' ')) brake = true;
    if (this.keys.has('a') || this.keys.has('arrowleft') || this.touchInput.left) steer -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright') || this.touchInput.right) steer += 1;

    this._inputSendTimer += dt;
    if (this._inputSendTimer >= 0.04) {
      this._inputSendTimer = 0;
      this.ctx.sendAction({ kind: 'input', throttle, steer, brake });
    }

    this._smokeTimer += dt;
    const emitSmoke = this._smokeTimer > 0.07;
    if (emitSmoke) this._smokeTimer = 0;

    for (const [id, node] of Object.entries(this.kartNodes)) {
      node.targetX += Math.sin(node.targetAngle) * node.speed * dt * 0.45;
      node.targetZ += Math.cos(node.targetAngle) * node.speed * dt * 0.45;

      const lerpAlpha = 1 - Math.exp(-15 * dt);
      node.kart.root.position.x += (node.targetX - node.kart.root.position.x) * lerpAlpha;
      node.kart.root.position.z += (node.targetZ - node.kart.root.position.z) * lerpAlpha;

      let da = node.targetAngle - node.kart.root.rotation.y;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      node.kart.root.rotation.y += da * lerpAlpha;

      const st = id === this.ctx.youId ? steer : Math.max(-1, Math.min(1, -da * 3.5));

      // Body roll e vibração sutil de motor na suspensão!
      const desiredRoll = st * Math.min(1, Math.abs(node.speed) / 14) * 0.14;
      node.roll += (desiredRoll - node.roll) * (1 - Math.exp(-10 * dt));
      node.kart.chassisTilt.rotation.z = node.roll;
      node.kart.chassisTilt.rotation.x = node.boost ? -0.05 : 0;
      node.kart.chassisTilt.position.y = Math.sin(elapsed * 32) * 0.008 * Math.min(1, Math.abs(node.speed) / 8);

      for (const w of node.kart.wheels) {
        w.spinGroup.rotation.x += node.speed * dt * 2.9;
        if (w.isFront) w.steerPivot.rotation.y = -st * 0.36;
      }

      // Fumaça nos pneus traseiros durante curvas rápidas!
      if (emitSmoke && Math.abs(st) > 0.5 && node.speed > 12) {
        this.vfx.spawnDust(
          node.kart.root.position.x - Math.sin(node.kart.root.rotation.y) * 0.9,
          0.08,
          node.kart.root.position.z - Math.cos(node.kart.root.rotation.y) * 0.9,
          1,
          0.95
        );
      }

      node.kart.flames.visible = node.boost;
      if (node.boost) {
        node.kart.flames.scale.z = 0.85 + Math.sin(elapsed * 32) * 0.3;
      }

      node.driver.update(dt, { anim: 'sit', inKart: true, steer: st });
    }

    // Chase Camera 3D com mola crítica e FOV dinâmico de velocidade!
    const myNode = this.kartNodes[this.ctx.youId] || Object.values(this.kartNodes)[0];
    if (myNode) {
      const kx = myNode.kart.root.position.x;
      const kz = myNode.kart.root.position.z;
      const ka = myNode.kart.root.rotation.y;
      const distBack = myNode.boost ? 7.1 : 6.2;

      this.camSpring.target.set(
        kx - Math.sin(ka) * distBack,
        3.15,
        kz - Math.cos(ka) * distBack
      );
      this.camera.position.copy(this.camSpring.step(dt));
      this.camera.lookAt(kx + Math.sin(ka) * 4.2, 0.95, kz + Math.cos(ka) * 4.2);

      const baseRaceFov = window.innerWidth < window.innerHeight ? 66 : 55;
      const targetFov = myNode.boost ? baseRaceFov + 11 : baseRaceFov + Math.min(8, Math.abs(myNode.speed) * 0.36);
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-7 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    adaptCameraForAspect(this.camera, 56, 1.25, 78);
  }

  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
  }
}
