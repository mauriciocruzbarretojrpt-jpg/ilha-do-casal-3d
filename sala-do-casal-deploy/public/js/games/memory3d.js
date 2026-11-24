// 🃏 MESA DA MEMÓRIA 3D AAA — Mesa imperial de veludo e ouro, 16 cartas laqueadas PBR
// com física de mola (Spring1D) no giro 3D, levitação de hover e faíscas douradas nos pares!

import * as THREE from 'three';
import { createCharacterActor } from '../characters.js';
import { Spring1D, SurfaceTextures, VFXSystem, adaptCameraForAspect } from '../graphics.js';
import { MEMORY_SYMS } from '../catalog.js';
import { audio } from '../audio.js';

function createBackTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const ctx = c.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 256, 320);
  grad.addColorStop(0, '#db2777');
  grad.addColorStop(1, '#4f46e5');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 320);

  ctx.strokeStyle = 'rgba(253, 224, 71, 0.85)';
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, 220, 284);

  ctx.font = '72px "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💖', 128, 160);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFrontTexture(symId) {
  const info = MEMORY_SYMS[symId] || { icon: '✨', color: '#f59e0b', label: '' };
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#fffdf9';
  ctx.fillRect(0, 0, 256, 320);

  ctx.strokeStyle = info.color;
  ctx.lineWidth = 14;
  ctx.strokeRect(14, 14, 228, 292);

  ctx.font = '104px "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(info.icon, 128, 142);

  ctx.fillStyle = '#1e293b';
  ctx.font = '800 28px "Plus Jakarta Sans", "Segoe UI", sans-serif';
  ctx.fillText(info.label, 128, 254);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Memory3DGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.game = ctx.initialGame;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x130d26);
    this.scene.fog = new THREE.FogExp2(0x130d26, 0.035);

    this.camera = new THREE.PerspectiveCamera(43, window.innerWidth / window.innerHeight, 0.1, 60);
    adaptCameraForAspect(this.camera, 43, 1.35, 76);
    const port = window.innerWidth < window.innerHeight;
    this.camera.position.set(0, port ? 5.1 : 4.4, port ? 4.1 : 3.6);
    this.camera.lookAt(0, 0.78, -0.12);
    this.vfx = new VFXSystem(this.scene);

    this.cards = [];
    this.frontTexCache = {};
    this.hoveredIdx = -1;

    this._buildTableAndCards();
    this._bindRaycast();
    this.ctx.mountUI(`<div class="mg-panel"><span>✨ Clique nas cartas 3D na mesa para virar e formar pares!</span></div>`);
    this.onState(this.game);
  }

  _getFrontTex(symId) {
    if (!this.frontTexCache[symId]) {
      this.frontTexCache[symId] = createFrontTexture(symId);
    }
    return this.frontTexCache[symId];
  }

  _buildTableAndCards() {
    this.scene.add(new THREE.HemisphereLight(0xfef3c7, 0x312e81, 0.9));
    const dir = new THREE.DirectionalLight(0xfff7ed, 2.0);
    dir.position.set(3, 8, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    this.scene.add(dir);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ map: SurfaceTextures.wood(6), color: 0x3b254a, roughness: 0.7 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const tableTop = new THREE.Mesh(
      new THREE.CylinderGeometry(2.78, 2.88, 0.16, 56),
      new THREE.MeshStandardMaterial({ color: 0x3b0764, roughness: 0.65, metalness: 0.05 })
    );
    tableTop.position.y = 0.72;
    tableTop.receiveShadow = true;
    tableTop.castShadow = true;

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(2.82, 0.085, 14, 56),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.22, metalness: 0.78 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.79;
    this.scene.add(tableTop, rim);

    const backTex = createBackTexture();
    const goldEdgeMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.25, metalness: 0.55 });
    const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.22, metalness: 0.06 });

    for (let i = 0; i < 16; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = (col - 1.5) * 0.88;
      const z = (row - 1.5) * 1.04;

      const frontMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.04 });
      const mats = [goldEdgeMat, goldEdgeMat, backMat, frontMat, goldEdgeMat, goldEdgeMat];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.055, 0.9), mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.cardIndex = i;

      const holder = new THREE.Group();
      holder.position.set(x, 0.83, z);
      holder.add(mesh);
      this.scene.add(holder);

      this.cards.push({
        index: i,
        holder,
        mesh,
        frontMat,
        baseX: x,
        baseZ: z,
        flipSpring: new Spring1D(0, 155, 16),
        liftSpring: new Spring1D(0, 180, 18),
        matched: false,
      });
    }

    this.actors = [];
    this.game.players.forEach((pid, idx) => {
      const p = this.ctx.playersMap.get(pid) || { character: idx === 0 ? 'mauricio' : 'maria' };
      const actor = createCharacterActor(p.character, { scale: 0.95 });
      actor.root.position.set(idx === 0 ? -2.95 : 2.95, 0, -0.6);
      actor.root.rotation.y = idx === 0 ? 1.25 : -1.25;
      this.scene.add(actor.root);
      this.actors.push({ id: pid, actor });
    });
  }

  _bindRaycast() {
    const ray = new THREE.Raycaster();
    const getCardAt = (e) => {
      const rect = this.ctx.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      ray.setFromCamera(ndc, this.camera);
      const meshes = this.cards.map((c) => c.mesh);
      const hits = ray.intersectObjects(meshes, false);
      return hits.length > 0 ? hits[0].object.userData.cardIndex : -1;
    };

    this._pm = (e) => {
      this.hoveredIdx = e.target === this.ctx.canvas ? getCardAt(e) : -1;
    };

    this._pd = (e) => {
      if (e.target !== this.ctx.canvas) return;
      if (this.game.turn !== this.ctx.youId || this.game.lock) return;
      const idx = getCardAt(e);
      if (idx >= 0 && !this.game.matched.includes(idx) && !this.game.open.includes(idx)) {
        this.ctx.sendAction({ kind: 'flip', index: idx });
      }
    };

    window.addEventListener('pointermove', this._pm);
    this.ctx.canvas.addEventListener('pointerdown', this._pd);
  }

  onState(game) {
    this.game = game;
    for (const c of this.cards) {
      const sym = game.visible?.[c.index];
      if (sym) {
        c.frontMat.map = this._getFrontTex(sym);
        c.frontMat.needsUpdate = true;
      }
      c.matched = game.matched.includes(c.index);
    }

    const [p0, p1] = game.players;
    const n0 = this.ctx.playersMap.get(p0)?.name || 'J1';
    const n1 = this.ctx.playersMap.get(p1)?.name || 'J2';
    this.ctx.setScoreHTML(
      `<span>${n0}: <b>${game.pairs?.[p0] || 0} pares</b></span> × <span><b>${game.pairs?.[p1] || 0} pares</b> :${n1}</span>`
    );
    if (game.msg) this.ctx.setStatus(game.msg);
  }

  onTick() {}

  onEvent(ev) {
    if (ev.type !== 'memoria') return;
    if (ev.ev === 'flip') {
      const c = this.cards[ev.index];
      if (c && ev.sym) {
        c.frontMat.map = this._getFrontTex(ev.sym);
        c.frontMat.needsUpdate = true;
      }
      audio.play('flip');
    } else if (ev.ev === 'match') {
      audio.play('match');
      for (const idx of ev.indices || []) {
        const c = this.cards[idx];
        if (c) {
          this.vfx.spawnSparks(c.baseX, 1.0, c.baseZ, 0xfbbf24, 12);
          this.vfx.spawnShockwave(c.baseX, 0.82, c.baseZ, 0xfbbf24, 1.8);
        }
      }
    }
  }

  update(dt) {
    this.vfx.update(dt);
    for (const c of this.cards) {
      const wantOpen = this.game.open.includes(c.index) || this.game.matched.includes(c.index);
      c.flipSpring.target = wantOpen ? 1 : 0;
      const prog = c.flipSpring.step(dt);

      const isHovered = !wantOpen && this.hoveredIdx === c.index && this.game.turn === this.ctx.youId;
      c.liftSpring.target = isHovered ? 0.1 : 0;
      const lift = c.liftSpring.step(dt);

      c.mesh.rotation.z = prog * Math.PI;
      const hop = Math.sin(Math.max(0, Math.min(1, prog)) * Math.PI) * 0.38;
      c.holder.position.y = 0.83 + hop + lift;
    }

    for (const a of this.actors) {
      a.actor.update(dt, { anim: this.game.winner === a.id ? 'dance' : 'idle' });
    }
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    adaptCameraForAspect(this.camera, 43, 1.35, 76);
    const port = w < h;
    this.camera.position.set(0, port ? 5.1 : 4.4, port ? 4.1 : 3.6);
    this.camera.lookAt(0, 0.78, -0.12);
  }

  dispose() {
    window.removeEventListener('pointermove', this._pm);
    this.ctx.canvas.removeEventListener('pointerdown', this._pd);
  }
}
