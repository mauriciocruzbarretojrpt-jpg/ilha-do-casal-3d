// 🔴 LIGUE 4 GIGANTE 3D AAA — Estrutura acrílica safira PBR com reflexo IBL,
// fichas metálicas laqueadas com impacto e screen-shake sutil, e anéis HDR na vitória!

import * as THREE from 'three';
import { createCharacterActor, createStylizedMat } from '../characters.js';
import { SurfaceTextures, VFXSystem, createAtmosphericSky, adaptCameraForAspect, isMobileDevice } from '../graphics.js';
import { audio } from '../audio.js';

export class Connect4_3DGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.game = ctx.initialGame;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1b1538, 0.018);

    this.camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 300);
    adaptCameraForAspect(this.camera, 44, 1.36, 78);
    this.camera.position.set(0, 2.35, window.innerWidth < window.innerHeight ? 7.3 : 6.3);
    this.camera.lookAt(0, 1.9, 0);
    this.vfx = new VFXSystem(this.scene);

    this.spacing = 0.56;
    this.baseY = 0.55;
    this.myHoverCol = 3;
    this.discs = new Map();
    this.winRings = [];
    this._hoverTimer = 0;

    this._buildFrame3D();
    this._bindPointer();
    this.ctx.mountUI(`
      <div class="mg-panel">
        ${isMobileDevice() ? `
          <button type="button" id="c4-left" class="mg-btn">◀ Coluna</button>
          <button type="button" id="c4-drop" class="mg-btn primary">Soltar Ficha ●</button>
          <button type="button" id="c4-right" class="mg-btn">Coluna ▶</button>
        ` : `<span>Toque ou clique diretamente em uma coluna 3D para soltar sua ficha!</span>`}
      </div>
    `);
    document.getElementById('c4-left')?.addEventListener('click', () => {
      this.myHoverCol = Math.max(0, this.myHoverCol - 1);
    });
    document.getElementById('c4-right')?.addEventListener('click', () => {
      this.myHoverCol = Math.min(6, this.myHoverCol + 1);
    });
    document.getElementById('c4-drop')?.addEventListener('click', () => {
      if (this.game.turn === this.ctx.youId) {
        this.ctx.sendAction({ kind: 'drop', col: this.myHoverCol });
      }
    });
    this.onState(this.game);
  }

  _colX(c) { return (c - 3) * this.spacing; }
  _rowY(r) { return this.baseY + r * this.spacing; }

  _playerColor(pid) {
    const ch = this.ctx.playersMap.get(pid)?.character;
    if (ch === 'maria') return 0xff4d8d;
    if (ch === 'mauricio') return 0xfacc15;
    return this.game.players[0] === pid ? 0xff4d8d : 0xfacc15;
  }

  _buildFrame3D() {
    const { sky } = createAtmosphericSky({ elevation: 5, azimuth: 150, turbidity: 6.5, rayleigh: 2.5 });
    this.scene.add(sky);

    this.scene.add(new THREE.HemisphereLight(0xfffbeb, 0x1e1b4b, 0.9));
    const dir = new THREE.DirectionalLight(0xfff3e0, 2.1);
    dir.position.set(5, 10, 7);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    this.scene.add(dir);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(8.5, 9.0, 0.18, 48),
      new THREE.MeshStandardMaterial({ map: SurfaceTextures.stonePlaza(5), roughness: 0.48, metalness: 0.1 })
    );
    floor.position.y = -0.09;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.18,
      metalness: 0.35,
      transparent: true,
      opacity: 0.9,
      envMapIntensity: 1.3,
    });

    const totalW = 7 * this.spacing + 0.28;
    const totalH = 6 * this.spacing + 0.28;

    for (let c = 0; c <= 7; c++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.11, totalH, 0.26), frameMat);
      bar.position.set((c - 3.5) * this.spacing, this.baseY + 2.5 * this.spacing, 0);
      bar.castShadow = true;
      this.scene.add(bar);
    }
    for (let r = 0; r <= 6; r++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(totalW, 0.11, 0.26), frameMat);
      bar.position.set(0, this.baseY + (r - 0.5) * this.spacing, 0);
      bar.castShadow = true;
      this.scene.add(bar);
    }

    for (const sx of [-totalW / 2 - 0.1, totalW / 2 + 0.1]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 1.3), createStylizedMat(0x1e3a8a, { metalness: 0.4 }));
      foot.position.set(sx, 0.11, 0);
      foot.castShadow = true;
      this.scene.add(foot);
    }

    this.hitPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(totalW + 0.6, totalH + 1.2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitPlane.position.set(0, 2.1, 0);
    this.scene.add(this.hitPlane);

    const prevGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 28);
    prevGeo.rotateX(Math.PI / 2);
    this.previewDisc = new THREE.Mesh(
      prevGeo,
      new THREE.MeshStandardMaterial({ color: 0xff4d8d, emissive: 0xff4d8d, emissiveIntensity: 0.5, transparent: true, opacity: 0.82 })
    );
    this.previewDisc.position.set(0, this._rowY(6) + 0.2, 0);
    this.scene.add(this.previewDisc);

    this.actors = [];
    this.game.players.forEach((pid, idx) => {
      const p = this.ctx.playersMap.get(pid) || { character: idx === 0 ? 'mauricio' : 'maria' };
      const actor = createCharacterActor(p.character);
      actor.root.position.set(idx === 0 ? -2.95 : 2.95, 0, 0.45);
      actor.root.rotation.y = idx === 0 ? 0.55 : -0.55;
      this.scene.add(actor.root);
      this.actors.push({ id: pid, actor });
    });
  }

  _bindPointer() {
    const ray = new THREE.Raycaster();
    const colAtEvent = (e) => {
      const rect = this.ctx.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      ray.setFromCamera(ndc, this.camera);
      const hits = ray.intersectObject(this.hitPlane, false);
      if (!hits.length) return null;
      const c = Math.round(hits[0].point.x / this.spacing + 3);
      return Math.max(0, Math.min(6, c));
    };

    this._pm = (e) => {
      const c = colAtEvent(e);
      if (c !== null) this.myHoverCol = c;
    };

    this._pd = (e) => {
      if (e.target !== this.ctx.canvas || this.game.turn !== this.ctx.youId) return;
      const c = colAtEvent(e);
      if (c !== null) {
        this.myHoverCol = c;
        this.ctx.sendAction({ kind: 'drop', col: c });
      }
    };

    window.addEventListener('pointermove', this._pm);
    this.ctx.canvas.addEventListener('pointerdown', this._pd);
  }

  _spawnDiscIfNeeded(r, c, pid, animateDrop = false) {
    const key = `${r},${c}`;
    if (this.discs.has(key)) return;
    const geo = new THREE.CylinderGeometry(0.225, 0.225, 0.15, 28);
    geo.rotateX(Math.PI / 2);
    const col = this._playerColor(pid);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.2, metalness: 0.25, envMapIntensity: 1.2 })
    );
    mesh.castShadow = true;
    const startY = animateDrop ? this._rowY(6.4) : this._rowY(r);
    mesh.position.set(this._colX(c), startY, 0);
    this.scene.add(mesh);
    this.discs.set(key, {
      mesh,
      x: this._colX(c),
      col,
      y: startY,
      vy: 0,
      targetY: this._rowY(r),
      bounced: false,
      settled: !animateDrop,
    });
  }

  onState(game) {
    this.game = game;

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) {
        const pid = game.board[r * 7 + c];
        if (pid) {
          const isLast = game.lastMove && game.lastMove.r === r && game.lastMove.c === c;
          this._spawnDiscIfNeeded(r, c, pid, isLast);
        }
      }
    }

    if (game.winCells && this.winRings.length === 0) {
      for (const [r, c] of game.winCells) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.26, 0.036, 12, 28),
          new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
        );
        ring.position.set(this._colX(c), this._rowY(r), 0.1);
        this.scene.add(ring);
        this.winRings.push(ring);
        this.vfx.spawnSparks(this._colX(c), this._rowY(r), 0.12, 0xfbbf24, 8);
      }
    }

    const turnName = this.ctx.playersMap.get(game.turn)?.name || 'Jogador';
    this.ctx.setScoreHTML(`<span>🔴 Vez atual: <b>${turnName}</b></span>`);
    if (game.msg) this.ctx.setStatus(game.msg);
  }

  onTick(data) {
    if (data.type === 'lig4' && data.hoverCol) {
      this.game.hoverCol = data.hoverCol;
    }
  }

  onEvent(ev) {
    if (ev.type === 'lig4' && ev.ev === 'drop') {
      this._spawnDiscIfNeeded(ev.r, ev.c, ev.id, true);
      audio.play('drop');
    }
  }

  update(dt, elapsed) {
    this.vfx.update(dt);

    if (this.game.turn === this.ctx.youId && !this.game.winner && !this.game.draw) {
      this._hoverTimer += dt;
      if (this._hoverTimer > 0.08) {
        this._hoverTimer = 0;
        this.ctx.sendAction({ kind: 'hover', col: this.myHoverCol });
      }
    }

    if (this.game.winner || this.game.draw) {
      this.previewDisc.visible = false;
    } else {
      this.previewDisc.visible = true;
      const activeCol = this.game.turn === this.ctx.youId
        ? this.myHoverCol
        : (this.game.hoverCol?.[this.game.turn] ?? 3);
      const colHex = this._playerColor(this.game.turn);
      this.previewDisc.material.color.setHex(colHex);
      this.previewDisc.material.emissive.setHex(colHex);
      this.previewDisc.position.x += (this._colX(activeCol) - this.previewDisc.position.x) * (1 - Math.exp(-16 * dt));
      this.previewDisc.position.y = this._rowY(6.15) + Math.sin(elapsed * 5) * 0.05;
    }

    for (const d of this.discs.values()) {
      if (d.settled) continue;
      d.vy -= 24.0 * dt;
      d.y += d.vy * dt;
      if (d.y <= d.targetY) {
        d.y = d.targetY;
        if (!d.bounced) {
          d.bounced = true;
          this.ctx.shake?.(0.05, 0.1);
          this.vfx.spawnSparks(d.x, d.y, 0.1, d.col, 5);
        }
        if (Math.abs(d.vy) > 1.4) {
          d.vy = -d.vy * 0.34;
        } else {
          d.vy = 0;
          d.settled = true;
        }
      }
      d.mesh.position.y = d.y;
    }

    for (const r of this.winRings) {
      r.scale.setScalar(1 + Math.sin(elapsed * 8) * 0.12);
    }

    for (const a of this.actors) {
      a.actor.update(dt, { anim: this.game.winner === a.id ? 'dance' : 'idle' });
    }
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    adaptCameraForAspect(this.camera, 44, 1.36, 78);
    this.camera.position.z = w < h ? 7.3 : 6.3;
  }

  dispose() {
    window.removeEventListener('pointermove', this._pm);
    this.ctx.canvas.removeEventListener('pointerdown', this._pd);
  }
}
