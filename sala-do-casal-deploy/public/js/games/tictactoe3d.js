// ❌ JOGO DA VELHA 3D AAA — Pedestal de pedra polida PBR, peças neon HDR com Bloom,
// física de queda suave com mola e feixe de energia dourado na linha vencedora!

import * as THREE from 'three';
import { createCharacterActor } from '../characters.js';
import { Spring1D, SurfaceTextures, VFXSystem, adaptCameraForAspect } from '../graphics.js';
import { audio } from '../audio.js';

function createPiece3D(isX, colorHex, ghost = false) {
  const g = new THREE.Group();
  const mat = ghost
    ? new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.4, toneMapped: false })
    : new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 1.35,
        roughness: 0.2,
        metalness: 0.2,
        toneMapped: false,
      });

  if (isX) {
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.15, 0.16), mat);
    b1.rotation.y = Math.PI / 4;
    b1.castShadow = !ghost;
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.15, 0.16), mat);
    b2.rotation.y = -Math.PI / 4;
    b2.castShadow = !ghost;
    g.add(b1, b2);
  } else {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.085, 16, 32), mat);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = !ghost;
    g.add(ring);
  }
  return g;
}

export class TicTacToe3DGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.game = ctx.initialGame;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x110d24);
    this.scene.fog = new THREE.FogExp2(0x110d24, 0.032);

    this.camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 60);
    adaptCameraForAspect(this.camera, 44, 1.35, 76);
    const port = window.innerWidth < window.innerHeight;
    this.camera.position.set(0, port ? 4.6 : 4.05, port ? 4.75 : 4.2);
    this.camera.lookAt(0, 0.35, 0);
    this.vfx = new VFXSystem(this.scene);

    this.tiles = [];
    this.pieces = new Map();
    this.winBeam = null;
    this.hoveredIdx = -1;

    this._buildArena3D();
    this._bindRaycast();
    this.ctx.mountUI(`<div class="mg-panel"><span>❌ Clique em um bloco do pedestal 3D para marcar sua jogada!</span></div>`);
    this.onState(this.game);
  }

  _cellPos(idx) {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    return [(col - 1) * 1.12, (row - 1) * 1.12];
  }

  _buildArena3D() {
    this.scene.add(new THREE.HemisphereLight(0xfef3c7, 0x1e1b4b, 0.9));
    const dir = new THREE.DirectionalLight(0xfff7ed, 2.0);
    dir.position.set(4, 8, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    this.scene.add(dir);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.9, 0.28, 56),
      new THREE.MeshStandardMaterial({ map: SurfaceTextures.stonePlaza(4), color: 0x332859, roughness: 0.35, metalness: 0.25 })
    );
    base.position.y = -0.14;
    base.receiveShadow = true;
    this.scene.add(base);

    const barMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.5,
      toneMapped: false,
    });
    for (const o of [-0.56, 0.56]) {
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 3.35), barMat);
      vBar.position.set(o, 0.08, 0);
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.12, 0.1), barMat);
      hBar.position.set(0, 0.08, o);
      this.scene.add(vBar, hBar);
    }

    const tileMat = new THREE.MeshStandardMaterial({ color: 0x26204d, roughness: 0.3, metalness: 0.25 });
    for (let i = 0; i < 9; i++) {
      const [x, z] = this._cellPos(i);
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.1, 0.96), tileMat.clone());
      tile.position.set(x, 0.05, z);
      tile.receiveShadow = true;
      tile.userData.cellIndex = i;
      this.scene.add(tile);
      this.tiles.push(tile);
    }

    this.ghostX = createPiece3D(true, 0xff4d8d, true);
    this.ghostO = createPiece3D(false, 0x4f8cff, true);
    this.ghostX.visible = false;
    this.ghostO.visible = false;
    this.scene.add(this.ghostX, this.ghostO);

    this.actors = [];
    this.game.players.forEach((pid, idx) => {
      const p = this.ctx.playersMap.get(pid) || { character: idx === 0 ? 'mauricio' : 'maria' };
      const actor = createCharacterActor(p.character, { scale: 0.96 });
      actor.root.position.set(idx === 0 ? -2.75 : 2.75, 0, -0.4);
      actor.root.rotation.y = idx === 0 ? 1.1 : -1.1;
      this.scene.add(actor.root);
      this.actors.push({ id: pid, actor });
    });
  }

  _bindRaycast() {
    const ray = new THREE.Raycaster();
    const cellAt = (e) => {
      const rect = this.ctx.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      ray.setFromCamera(ndc, this.camera);
      const hits = ray.intersectObjects(this.tiles, false);
      return hits.length > 0 ? hits[0].object.userData.cellIndex : -1;
    };

    this._pm = (e) => {
      this.hoveredIdx = e.target === this.ctx.canvas ? cellAt(e) : -1;
    };
    this._pd = (e) => {
      if (e.target !== this.ctx.canvas || this.game.turn !== this.ctx.youId) return;
      const idx = cellAt(e);
      if (idx >= 0 && !this.game.board[idx]) {
        this.ctx.sendAction({ kind: 'place', index: idx });
      }
    };

    window.addEventListener('pointermove', this._pm);
    this.ctx.canvas.addEventListener('pointerdown', this._pd);
  }

  onState(game) {
    this.game = game;

    game.board.forEach((pid, idx) => {
      if (pid && !this.pieces.has(idx)) {
        const isX = game.players[0] === pid;
        const ch = this.ctx.playersMap.get(pid)?.character;
        const col = ch === 'maria' ? 0xff4d8d : 0x4f8cff;
        const piece = createPiece3D(isX, col, false);
        const [x, z] = this._cellPos(idx);
        piece.position.set(x, 1.15, z);
        this.scene.add(piece);
        const ySpring = new Spring1D(1.15, 190, 15);
        ySpring.target = 0.2;
        this.pieces.set(idx, { mesh: piece, ySpring });
        this.vfx.spawnShockwave(x, 0.12, z, col, 1.6);
      }
    });

    if (game.winLine && !this.winBeam) {
      const [a, , c] = game.winLine;
      const [ax, az] = this._cellPos(a);
      const [cx, cz] = this._cellPos(c);
      const p1 = new THREE.Vector3(ax, 0.28, az);
      const p2 = new THREE.Vector3(cx, 0.28, cz);
      const len = p1.distanceTo(p2) + 0.55;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, len, 14),
        new THREE.MeshBasicMaterial({ color: 0xfef08a, toneMapped: false })
      );
      beam.position.copy(p1).add(p2).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
      this.scene.add(beam);
      this.winBeam = beam;
      this.vfx.spawnSparks((ax + cx) / 2, 0.35, (az + cz) / 2, 0xfbbf24, 20);
    }

    const turnName = this.ctx.playersMap.get(game.turn)?.name || 'Jogador';
    this.ctx.setScoreHTML(`<span>❌⭕ Vez de: <b>${turnName}</b></span>`);
    if (game.msg) this.ctx.setStatus(game.msg);
  }

  onTick() {}

  onEvent(ev) {
    if (ev.type === 'velha' && ev.ev === 'place') {
      audio.play('drop');
      this.ctx.shake?.(0.06, 0.12);
    }
  }

  update(dt, elapsed) {
    this.vfx.update(dt);

    for (const p of this.pieces.values()) {
      p.mesh.position.y = p.ySpring.step(dt);
    }

    this.ghostX.visible = false;
    this.ghostO.visible = false;
    if (
      this.game.turn === this.ctx.youId &&
      !this.game.winner &&
      !this.game.draw &&
      this.hoveredIdx >= 0 &&
      !this.game.board[this.hoveredIdx]
    ) {
      const isMeX = this.game.players[0] === this.ctx.youId;
      const g = isMeX ? this.ghostX : this.ghostO;
      const [x, z] = this._cellPos(this.hoveredIdx);
      g.visible = true;
      g.position.set(x, 0.26 + Math.sin(elapsed * 6) * 0.04, z);
    }

    for (const a of this.actors) {
      a.actor.update(dt, { anim: this.game.winner === a.id ? 'dance' : 'idle' });
    }
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    adaptCameraForAspect(this.camera, 44, 1.35, 76);
    const port = w < h;
    this.camera.position.set(0, port ? 4.6 : 4.05, port ? 4.75 : 4.2);
    this.camera.lookAt(0, 0.35, 0);
  }

  dispose() {
    window.removeEventListener('pointermove', this._pm);
    this.ctx.canvas.removeEventListener('pointerdown', this._pd);
  }
}
