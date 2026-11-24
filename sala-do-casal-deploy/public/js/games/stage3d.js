// 💑 PALCO DA SINTONIA 3D AAA — Piso espelhado de auditório de TV, pódios HDR luminosos,
// holofotes volumétricos duplos, telão LED nítido e fogos de artifício HDR na sintonia!

import * as THREE from 'three';
import { createCharacterActor, createNameBadgeSprite, createStylizedMat } from '../characters.js';
import { VFXSystem, adaptCameraForAspect } from '../graphics.js';
import { audio } from '../audio.js';

export class Stage3DGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.game = ctx.initialGame;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0820);
    this.scene.fog = new THREE.FogExp2(0x0d0820, 0.028);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 80);
    adaptCameraForAspect(this.camera, 45, 1.38, 78);
    this.camera.position.set(0, 2.25, window.innerWidth < window.innerHeight ? 7.6 : 6.35);
    this.camera.lookAt(0, 1.45, 0);
    this.vfx = new VFXSystem(this.scene);

    this.podiumTargets = [];
    this._lastKey = '';

    this._buildTVStage();
    this._bindStageClick();
    this.onState(this.game);
  }

  _buildTVStage() {
    this.scene.add(new THREE.HemisphereLight(0xfbcfe8, 0x1e1b4b, 0.72));

    this.spotMaria = new THREE.SpotLight(0xff6b9d, 6.5, 18, 0.45, 0.45, 1.1);
    this.spotMaria.position.set(-2.6, 6.4, 3.4);
    this.spotMaria.castShadow = true;
    this.scene.add(this.spotMaria);

    this.spotMauricio = new THREE.SpotLight(0x60a5fa, 6.5, 18, 0.45, 0.45, 1.1);
    this.spotMauricio.position.set(2.6, 6.4, 3.4);
    this.spotMauricio.castShadow = true;
    this.scene.add(this.spotMauricio);

    const rim = new THREE.PointLight(0xfbbf24, 3.2, 14, 1.5);
    rim.position.set(0, 3.4, -1.2);
    this.scene.add(rim);

    // Piso espelhado estilo auditório de TV!
    const stageBase = new THREE.Mesh(
      new THREE.CylinderGeometry(5.0, 5.3, 0.36, 64),
      new THREE.MeshStandardMaterial({ color: 0x171130, roughness: 0.14, metalness: 0.55, envMapIntensity: 1.4 })
    );
    stageBase.position.y = -0.18;
    stageBase.receiveShadow = true;
    this.scene.add(stageBase);

    const neonRim = new THREE.Mesh(
      new THREE.TorusGeometry(5.05, 0.065, 12, 64),
      new THREE.MeshBasicMaterial({ color: 0xff4d8d, toneMapped: false })
    );
    neonRim.rotation.x = Math.PI / 2;
    neonRim.position.y = 0.02;
    this.scene.add(neonRim);

    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 1024;
    this.screenCanvas.height = 384;
    this.sCtx = this.screenCanvas.getContext('2d');
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;

    const screenFrame = new THREE.Mesh(
      new THREE.BoxGeometry(5.9, 2.35, 0.18),
      createStylizedMat(0x0f172a, { roughness: 0.25, metalness: 0.6 })
    );
    screenFrame.position.set(0, 2.48, -2.1);
    const screenFace = new THREE.Mesh(
      new THREE.PlaneGeometry(5.55, 2.08),
      new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false })
    );
    screenFace.position.set(0, 2.48, -2.0);
    this.scene.add(screenFrame, screenFace);

    this.stageChars = {};
    const configs = [
      { key: 'maria', label: 'Maria', x: -1.55, color: 0xff4d8d },
      { key: 'mauricio', label: 'Mauricio', x: 1.55, color: 0x4f8cff },
    ];

    for (const c of configs) {
      const pod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.76, 0.86, 0.36, 32),
        new THREE.MeshStandardMaterial({
          color: c.color,
          roughness: 0.22,
          metalness: 0.3,
          emissive: c.color,
          emissiveIntensity: 0.45,
        })
      );
      pod.position.set(c.x, 0.18, 0.25);
      pod.castShadow = true;
      pod.receiveShadow = true;
      pod.userData.voteTarget = c.key;
      this.scene.add(pod);
      this.podiumTargets.push(pod);

      const podRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.78, 0.028, 10, 32),
        new THREE.MeshBasicMaterial({ color: c.color, toneMapped: false })
      );
      podRing.rotation.x = Math.PI / 2;
      podRing.position.set(c.x, 0.365, 0.25);
      this.scene.add(podRing);

      const actor = createCharacterActor(c.key);
      actor.root.position.set(c.x, 0.36, 0.25);
      actor.root.rotation.y = c.x < 0 ? 0.18 : -0.18;
      const badge = createNameBadgeSprite(c.label, c.key === 'maria' ? '#ff4d8d' : '#4f8cff');
      badge.position.y = 0.22;
      actor.anchors.headTop.add(badge);
      this.scene.add(actor.root);

      this.stageChars[c.key] = { actor, pod };
    }

    this.spotMaria.target = this.stageChars.maria.actor.root;
    this.spotMauricio.target = this.stageChars.mauricio.actor.root;
  }

  _drawBigScreen() {
    const ctx = this.sCtx;
    const g = this.game;
    ctx.fillStyle = '#140d2b';
    ctx.fillRect(0, 0, 1024, 384);

    ctx.strokeStyle = '#ff4d8d';
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, 992, 352);

    ctx.fillStyle = '#fbcfe8';
    ctx.font = '700 28px "Plus Jakarta Sans", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`💑 SHOW DA SINTONIA · PERGUNTA ${g.round} DE ${g.total} · ACERTOS: ${g.matches}`, 512, 68);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 41px "Plus Jakarta Sans", "Segoe UI", sans-serif';
    const words = (g.question || '').split(' ');
    let line = '';
    const lines = [];
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > 880) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    lines.forEach((ln, idx) => {
      ctx.fillText(ln, 512, 165 + idx * 54);
    });

    if (g.phase === 'reveal' && g.reveal) {
      ctx.fillStyle = g.reveal.matched ? '#4ade80' : '#fbbf24';
      ctx.font = '800 35px "Plus Jakarta Sans", "Segoe UI", sans-serif';
      const summary = Object.entries(g.reveal.choices || {})
        .map(([pid, ch]) => `${this.ctx.playersMap.get(pid)?.name || 'J'}: ${ch === 'maria' ? 'MARIA 💖' : 'MAURICIO 💙'}`)
        .join('   ·   ');
      ctx.fillText(summary, 512, 326);
    }

    this.screenTex.needsUpdate = true;
  }

  _bindStageClick() {
    const ray = new THREE.Raycaster();
    this._pd = (e) => {
      if (e.target !== this.ctx.canvas || this.game.phase !== 'vote') return;
      if (this.game.voted?.includes(this.ctx.youId)) return;
      const rect = this.ctx.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      ray.setFromCamera(ndc, this.camera);
      const hits = ray.intersectObjects(this.podiumTargets, false);
      if (hits.length > 0 && hits[0].object.userData.voteTarget) {
        this._vote(hits[0].object.userData.voteTarget);
      }
    };
    this.ctx.canvas.addEventListener('pointerdown', this._pd);
  }

  _vote(target) {
    if (this.game.phase !== 'vote' || this.game.voted?.includes(this.ctx.youId)) return;
    audio.play('selectChar');
    this.ctx.sendAction({ kind: 'vote', target });
  }

  onState(game) {
    this.game = game;
    this._drawBigScreen();

    const pct = Math.round((game.matches / Math.max(1, game.round - (game.phase === 'vote' ? 1 : 0))) * 100);
    this.ctx.setScoreHTML(
      `<span>Pergunta <b>${game.round}/${game.total}</b></span> · <span>Sintonia: <b>${game.matches} 💖</b> (${isFinite(pct) ? pct : 100}%)</span>`
    );
    if (game.msg) this.ctx.setStatus(game.msg);

    const alreadyVoted = game.voted?.includes(this.ctx.youId);
    const key = `${game.round}:${game.phase}:${alreadyVoted}`;
    if (key !== this._lastKey) {
      this._lastKey = key;
      if (game.phase === 'vote' && !alreadyVoted) {
        this.ctx.mountUI(`
          <div class="mg-panel">
            <span>Clique no pódio 3D ou escolha em segredo:</span>
            <button type="button" id="vote-maria" class="mg-btn primary">💖 Maria</button>
            <button type="button" id="vote-mauricio" class="mg-btn blue">💙 Mauricio</button>
          </div>
        `);
        document.getElementById('vote-maria')?.addEventListener('click', () => this._vote('maria'));
        document.getElementById('vote-mauricio')?.addEventListener('click', () => this._vote('mauricio'));
      } else if (game.phase === 'vote' && alreadyVoted) {
        this.ctx.mountUI(`<div class="mg-panel"><span>🔒 Resposta secreta registrada! Aguardando seu amor...</span></div>`);
      } else {
        this.ctx.mountUI('');
      }
    }
  }

  onTick() {}

  onEvent(ev) {
    if (ev.type === 'sintonia' && ev.ev === 'reveal') {
      audio.play(ev.matched ? 'win' : 'emote');
      if (ev.matched) {
        this.vfx.spawnSparks(-1.5, 1.8, 0.3, 0xff4d8d, 18);
        this.vfx.spawnSparks(1.5, 1.8, 0.3, 0x4f8cff, 18);
        this.vfx.spawnShockwave(0, 0.05, 0.25, 0xfbbf24, 3.8);
      }
    }
  }

  update(dt, elapsed) {
    this.vfx.update(dt);
    const matchedReveal = this.game.phase === 'reveal' && this.game.reveal?.matched;
    this.stageChars.maria.actor.update(dt, { anim: matchedReveal ? 'dance' : 'idle' });
    this.stageChars.mauricio.actor.update(dt, { anim: matchedReveal ? 'dance' : 'idle' });

    this.camera.position.x = Math.sin(elapsed * 0.45) * 0.58;
    this.camera.lookAt(0, 1.55, -0.4);
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    adaptCameraForAspect(this.camera, 45, 1.38, 78);
    this.camera.position.z = w < h ? 7.6 : 6.35;
  }

  dispose() {
    this.ctx.canvas.removeEventListener('pointerdown', this._pd);
  }
}
