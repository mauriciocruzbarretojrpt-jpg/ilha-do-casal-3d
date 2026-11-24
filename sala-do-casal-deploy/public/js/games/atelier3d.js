// 🎨 ATELIÊ 3D AAA (Desenhe e Adivinhe) — Jardim ensolarado com céu atmosférico, deck e cavalete
// de madeira texturizada PBR, empunhadura real do pincel 3D e explosão de estrelas ao acertar!

import * as THREE from 'three';
import { createCharacterActor, createNameBadgeSprite, createStylizedMat } from '../characters.js';
import { SurfaceTextures, VFXSystem, createAtmosphericSky, adaptCameraForAspect, isMobileDevice } from '../graphics.js';
import { spawnAnimeProp } from '../propLoader.js';
import { audio } from '../audio.js';

const PALETTE = [
  '#111827', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#ec4899', '#ffffff',
];

function createPaintbrushMesh() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.018, 0.34, 10),
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.45 })
  );
  stick.position.y = 0.16;
  const ferrule = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.013, 0.05, 10),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2 })
  );
  ferrule.position.y = 0.33;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.026, 0.08, 10),
    createStylizedMat(0xff4d8d, { roughness: 0.4 })
  );
  tip.position.y = 0.38;
  g.add(stick, ferrule, tip);
  g.rotation.x = Math.PI / 2;
  return g;
}

export class Atelier3DGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.game = ctx.initialGame;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x3a2554, 0.014);

    this.camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 340);
    adaptCameraForAspect(this.camera, 44, 1.36, 76);
    const isPort = window.innerWidth < window.innerHeight;
    this.camera.position.set(0, isPort ? 1.85 : 1.92, isPort ? 5.15 : 4.35);
    this.camera.lookAt(0, isPort ? 1.38 : 1.58, 0);
    this.vfx = new VFXSystem(this.scene);

    this.brushColor = '#111827';
    this.brushSize = 8;
    this.currentStroke = null;
    this._lastPhaseKey = '';

    this._buildStudio3D();
    this._buildActors();
    this._bindEaselPointer();
    this.onState(this.game);
  }

  _buildStudio3D() {
    const { sky } = createAtmosphericSky({ elevation: 9, azimuth: 142, turbidity: 6, rayleigh: 2.3 });
    this.scene.add(sky);

    this.scene.add(new THREE.HemisphereLight(0xfffbeb, 0x312e81, 0.95));
    const sun = new THREE.DirectionalLight(0xfff5e4, 2.05);
    sun.position.set(6, 11, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(12, 12.5, 0.2, 48),
      new THREE.MeshStandardMaterial({ map: SurfaceTextures.grass(8), roughness: 0.78 })
    );
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(3.85, 3.95, 0.09, 40),
      new THREE.MeshStandardMaterial({ map: SurfaceTextures.stonePlaza(4), roughness: 0.5 })
    );
    deck.position.y = 0.045;
    deck.receiveShadow = true;
    this.scene.add(deck);

    const easel = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: SurfaceTextures.wood(2), roughness: 0.48 });

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.85, 0.1), wood);
    legL.position.set(-0.9, 1.35, -0.16);
    legL.rotation.z = -0.11;
    legL.rotation.x = -0.08;
    legL.castShadow = true;

    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.85, 0.1), wood);
    legR.position.set(0.9, 1.35, -0.16);
    legR.rotation.z = 0.11;
    legR.rotation.x = -0.08;
    legR.castShadow = true;

    const legBack = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.7, 0.1), wood);
    legBack.position.set(0, 1.28, -0.68);
    legBack.rotation.x = 0.28;
    legBack.castShadow = true;

    const tray = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.1, 0.24), wood);
    tray.position.set(0, 0.68, 0.05);
    tray.castShadow = true;

    const backing = new THREE.Mesh(new THREE.BoxGeometry(2.54, 1.92, 0.08), wood);
    backing.position.set(0, 1.66, -0.04);
    backing.castShadow = true;

    this.paintCanvas = document.createElement('canvas');
    this.paintCanvas.width = 768;
    this.paintCanvas.height = 576;
    this.pCtx = this.paintCanvas.getContext('2d');
    this._clearCanvas2D();

    this.canvasTex = new THREE.CanvasTexture(this.paintCanvas);
    this.canvasTex.colorSpace = THREE.SRGBColorSpace;

    this.boardMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.42, 1.8),
      new THREE.MeshBasicMaterial({ map: this.canvasTex, toneMapped: false })
    );
    this.boardMesh.position.set(0, 1.66, 0.015);

    easel.add(legL, legR, legBack, tray, backing, this.boardMesh);
    this.scene.add(easel);

    // Cenário 3D de Jardim de Pintura Anime com modelos CC0 (Cerejeiras Sakura, Flores, Vasos e Mesinha!)
    for (const [tx, tz, tint] of [[-4.8, -3.5, '#ff85b3'], [4.9, -3.4, '#ffd166'], [0, -6.8, '#ffa6c9']]) {
      spawnAnimeProp('tree_1', { targetHeight: 4.5, leafTint: tint, position: [tx, 0, tz] }).then((r) => r && this.scene.add(r.group));
    }
    for (const [fx, fz] of [[-2.6, -1.8], [2.7, -1.7], [-3.4, 0.8], [3.5, 0.8]]) {
      spawnAnimeProp('flowers', { targetWidth: 0.9, position: [fx, 0, fz] }).then((r) => r && this.scene.add(r.group));
    }
    spawnAnimeProp('table_round', { targetHeight: 0.72, position: [-2.35, 0.05, 0.25] }).then((r) => r && this.scene.add(r.group));
    spawnAnimeProp('houseplant', { targetHeight: 0.85, position: [2.25, 0.05, 0.3] }).then((r) => r && this.scene.add(r.group));
  }

  _clearCanvas2D() {
    this.pCtx.fillStyle = '#fffdf7';
    this.pCtx.fillRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
    if (this.canvasTex) this.canvasTex.needsUpdate = true;
  }

  _drawStroke2D(stroke) {
    if (!stroke || !stroke.pts || !stroke.pts.length) return;
    const ctx = this.pCtx;
    const W = this.paintCanvas.width;
    const H = this.paintCanvas.height;
    ctx.strokeStyle = stroke.color || '#111827';
    ctx.lineWidth = stroke.size || 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    stroke.pts.forEach(([u, v], idx) => {
      const x = u * W;
      const y = v * H;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (stroke.pts.length === 1) {
      const [u, v] = stroke.pts[0];
      ctx.lineTo(u * W + 0.5, v * H + 0.5);
    }
    ctx.stroke();
    this.canvasTex.needsUpdate = true;
  }

  _redrawAll(strokes = []) {
    this._clearCanvas2D();
    for (const s of strokes) this._drawStroke2D(s);
  }

  _buildActors() {
    this.actors = {};
    this.brushProp = createPaintbrushMesh();
    this.game.players.forEach((pid, idx) => {
      const pInfo = this.ctx.playersMap.get(pid) || { name: 'Artista', character: idx === 0 ? 'mauricio' : 'maria' };
      const actor = createCharacterActor(pInfo.character, { scale: 0.96 });
      const badge = createNameBadgeSprite(pInfo.name, pInfo.character === 'maria' ? '#ff4d8d' : '#4f8cff');
      badge.position.y = 0.22;
      actor.anchors.headTop.add(badge);
      this.scene.add(actor.root);
      this.actors[pid] = actor;
    });
    this._positionActorsByRole();
  }

  _positionActorsByRole() {
    const drawerActor = this.actors[this.game.drawer];
    const guesserActor = this.actors[this.game.guesser];
    if (drawerActor) {
      drawerActor.root.position.set(-1.68, 0.04, 0.45);
      drawerActor.root.rotation.y = 0.55;
      drawerActor.anchors.rightHand.add(this.brushProp);
    }
    if (guesserActor && guesserActor !== drawerActor) {
      guesserActor.root.position.set(1.75, 0.04, 0.55);
      guesserActor.root.rotation.y = -0.55;
    }
  }

  _bindEaselPointer() {
    const ray = new THREE.Raycaster();

    const uvAtEvent = (e) => {
      const rect = this.ctx.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      ray.setFromCamera(ndc, this.camera);
      const hits = ray.intersectObject(this.boardMesh, false);
      if (!hits.length || !hits[0].uv) return null;
      return [+hits[0].uv.x.toFixed(3), +(1 - hits[0].uv.y).toFixed(3)];
    };

    this._pd = (e) => {
      if (e.target !== this.ctx.canvas) return;
      if (this.game.drawer !== this.ctx.youId || this.game.phase !== 'draw') return;
      const pt = uvAtEvent(e);
      if (!pt) return;
      this.currentStroke = { color: this.brushColor, size: this.brushSize, pts: [pt] };
      this._drawStroke2D(this.currentStroke);
      audio.play('paint');
    };

    this._pm = (e) => {
      if (!this.currentStroke) return;
      const pt = uvAtEvent(e);
      if (!pt) return;
      const last = this.currentStroke.pts[this.currentStroke.pts.length - 1];
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.006) return;
      this.currentStroke.pts.push(pt);
      this._drawStroke2D({
        color: this.currentStroke.color,
        size: this.currentStroke.size,
        pts: [last, pt],
      });
      if (this.currentStroke.pts.length >= 20) {
        this.ctx.sendAction({ kind: 'stroke', stroke: this.currentStroke });
        this.currentStroke = { color: this.brushColor, size: this.brushSize, pts: [pt] };
        audio.play('paint');
      }
    };

    this._pu = () => {
      if (!this.currentStroke) return;
      this.ctx.sendAction({ kind: 'stroke', stroke: this.currentStroke });
      this.currentStroke = null;
    };

    this.ctx.canvas.addEventListener('pointerdown', this._pd);
    window.addEventListener('pointermove', this._pm);
    window.addEventListener('pointerup', this._pu);
  }

  onState(game) {
    const prevRound = this.game?.round;
    this.game = game;
    this._positionActorsByRole();

    if (prevRound !== game.round || (game.strokes && game.strokes.length === 0)) {
      this._redrawAll(game.strokes || []);
    } else if (game.strokes && game.strokes.length > 0) {
      this._redrawAll(game.strokes);
    }

    const [p0, p1] = game.players;
    const n0 = this.ctx.playersMap.get(p0)?.name || 'J1';
    const n1 = this.ctx.playersMap.get(p1)?.name || 'J2';
    this.ctx.setScoreHTML(
      `<span>Rodada ${game.round}/${game.maxRounds}</span> · <span>${n0}: <b>${game.scores?.[p0] || 0}⭐</b></span> × <span><b>${game.scores?.[p1] || 0}⭐</b> :${n1}</span>`
    );
    if (game.msg) this.ctx.setStatus(game.msg);

    const phaseKey = `${game.round}:${game.phase}:${game.drawer}:${game.wordMask}`;
    if (phaseKey !== this._lastPhaseKey) {
      this._lastPhaseKey = phaseKey;
      this._renderPhaseUI();
    }
  }

  _renderPhaseUI() {
    const g = this.game;
    const amDrawer = g.drawer === this.ctx.youId;

    if (g.phase === 'choose') {
      if (amDrawer && g.myOptions) {
        this.ctx.mountUI(`
          <div class="mg-panel">
            <strong>🎨 Escolha o que pintar no cavalete 3D:</strong>
            ${g.myOptions.map((o, idx) => `
              <button type="button" class="mg-btn primary pick-word-btn" data-idx="${idx}">
                ${o.word.toUpperCase()} (${'⭐'.repeat(o.level)})
              </button>
            `).join('')}
          </div>
        `);
        document.querySelectorAll('.pick-word-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            audio.play('click');
            this.ctx.sendAction({ kind: 'pickWord', index: +btn.dataset.idx });
          });
        });
      } else {
        this.ctx.mountUI(`<div class="mg-panel"><span>⏳ O artista está escolhendo uma palavra secreta...</span></div>`);
      }
      return;
    }

    if (g.phase === 'draw') {
      if (amDrawer) {
        this.ctx.mountUI(`
          <div class="mg-panel">
            <span style="font-weight:900;color:#e11d68">Pinte: ${(g.secretWord || '').toUpperCase()}</span>
            <span id="draw-timer" style="font-family:monospace;font-weight:900">75s</span>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              ${PALETTE.map((c) => `
                <button type="button" class="color-swatch ${c === this.brushColor ? 'active' : ''}" data-col="${c}" style="background:${c}"></button>
              `).join('')}
            </div>
            <button type="button" id="sz-sm" class="mg-btn" style="padding:6px 10px">•</button>
            <button type="button" id="sz-md" class="mg-btn" style="padding:6px 10px">●</button>
            <button type="button" id="sz-lg" class="mg-btn" style="padding:6px 10px">⬤</button>
            <button type="button" id="draw-undo" class="mg-btn">Desfazer</button>
            <button type="button" id="draw-clear" class="mg-btn">Limpar</button>
          </div>
        `);
        document.querySelectorAll('.color-swatch').forEach((sw) => {
          sw.addEventListener('click', () => {
            this.brushColor = sw.dataset.col;
            document.querySelectorAll('.color-swatch').forEach((x) => x.classList.remove('active'));
            sw.classList.add('active');
          });
        });
        document.getElementById('sz-sm')?.addEventListener('click', () => { this.brushSize = 4; });
        document.getElementById('sz-md')?.addEventListener('click', () => { this.brushSize = 9; });
        document.getElementById('sz-lg')?.addEventListener('click', () => { this.brushSize = 18; });
        document.getElementById('draw-undo')?.addEventListener('click', () => this.ctx.sendAction({ kind: 'undo' }));
        document.getElementById('draw-clear')?.addEventListener('click', () => this.ctx.sendAction({ kind: 'clear' }));
      } else {
        this.ctx.mountUI(`
          <div class="mg-panel" style="flex-direction:column;gap:7px">
            <div style="display:flex;gap:14px;align-items:center">
              <strong style="letter-spacing:0.14em;font-size:19px;color:#e11d68">${g.wordMask || ''}</strong>
              <span id="draw-timer" style="font-family:monospace;font-weight:900">75s</span>
            </div>
            <form id="guess-form" style="display:flex;gap:6px;width:100%;max-width:420px">
              <input id="guess-inp" type="text" placeholder="Toque nas letras ou digite..." autocomplete="off"
                style="flex:1;padding:8px 12px;border-radius:8px;border:2px solid #1b1936;background:#ffffff;color:#1b1936;font-weight:900;font-size:16px" />
              <button type="button" id="guess-bksp" class="mg-btn" style="padding:8px 11px" title="Apagar">⌫</button>
              <button type="submit" class="mg-btn green">Chutar!</button>
            </form>
            <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center;max-width:460px">
              ${(g.bank || []).map((ch) => `
                <button type="button" class="mg-btn bank-ch" style="padding:6px 10px;font-size:13px">${ch}</button>
              `).join('')}
            </div>
          </div>
        `);
        const inp = document.getElementById('guess-inp');
        document.querySelectorAll('.bank-ch').forEach((b) => {
          b.addEventListener('click', () => {
            if (!inp) return;
            inp.value += b.textContent.toLowerCase();
            // No celular não força abertura do teclado virtual ao tocar nas letras para não cobrir o quadro 3D!
            if (!isMobileDevice()) inp.focus();
          });
        });
        document.getElementById('guess-bksp')?.addEventListener('click', () => {
          if (inp) inp.value = inp.value.slice(0, -1);
        });
        document.getElementById('guess-form')?.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!inp || !inp.value.trim()) return;
          this.ctx.sendAction({ kind: 'guess', text: inp.value.trim() });
          inp.value = '';
        });
      }
      return;
    }

    this.ctx.mountUI('');
  }

  onTick() {}

  onEvent(ev) {
    if (ev.type !== 'desenho') return;
    if (ev.ev === 'stroke') {
      this._drawStroke2D(ev.stroke);
      audio.play('paint');
    } else if (ev.ev === 'syncStrokes') {
      this._redrawAll(ev.strokes || []);
    } else if (ev.ev === 'correct') {
      audio.play('win');
      this.vfx.spawnSparks(0, 1.8, 0.2, 0xfbbf24, 24);
    } else if (ev.ev === 'wrongGuess') {
      audio.play('click');
    }
  }

  update(dt) {
    this.vfx.update(dt);
    if (this.game.phase === 'draw' && this.game.endsAt) {
      const rem = Math.max(0, Math.ceil((this.game.endsAt - Date.now()) / 1000));
      const tEl = document.getElementById('draw-timer');
      if (tEl) tEl.textContent = `⏱️ ${rem}s`;
    }

    for (const [id, actor] of Object.entries(this.actors)) {
      let anim = 'idle';
      if (this.game.winner === id || (this.game.phase === 'roundEnd' && id === this.game.guesser)) anim = 'dance';
      else if (id === this.game.drawer && this.game.phase === 'draw') anim = 'paint';
      actor.update(dt, { anim, holdingProp: id === this.game.drawer });
    }
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    adaptCameraForAspect(this.camera, 44, 1.36, 76);
    const isPort = w < h;
    this.camera.position.set(0, isPort ? 1.85 : 1.92, isPort ? 5.15 : 4.35);
    this.camera.lookAt(0, isPort ? 1.38 : 1.58, 0);
  }

  dispose() {
    this.ctx.canvas.removeEventListener('pointerdown', this._pd);
    window.removeEventListener('pointermove', this._pm);
    window.removeEventListener('pointerup', this._pu);
  }
}
