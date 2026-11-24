// Motor de Personagens 3D com CAPTURA DE MOVIMENTO REAL (Motion Capture + THREE.AnimationMixer)
// Carrega maria.glb e mauricio.glb com animações ópticas reais de estúdio retargetadas no Blender 5.2:
// - Idle, Walk, Run, Dance (MoCap óptico feminino na Maria e masculino no Mauricio!)
// - Wave, Jump, Sit (Actions suaves construídas sobre a postura viva do MoCap!)
// - THREE.AnimationMixer com CrossFade e Time-Warping entre Walk <-> Run (zero foot-skating!)
// - Camada aditiva pós-Mixer para empunhadura nos minigames (Raquete, Volante de Kart, Pincel e Jokenpô!)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Spring1D, SurfaceTextures } from './graphics.js';

const CHAR_CONFIG = {
  maria: {
    url: './models/maria.glb?v=mocap2',
    label: 'Maria',
    height: 1.68,
    accent: '#ff477e',
  },
  mauricio: {
    url: './models/mauricio.glb?v=mocap2',
    label: 'Mauricio',
    height: 1.76,
    accent: '#2eb5ff',
  },
};

let ps2GradientTex = null;
export function getPS2GradientMap() {
  if (ps2GradientTex) return ps2GradientTex;
  const data = new Uint8Array([
    102, 86, 126, 255,
    168, 152, 182, 255,
    232, 224, 234, 255,
    255, 252, 244, 255,
  ]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  ps2GradientTex = tex;
  return tex;
}

export function createStylizedMat(color, opts = {}) {
  const { roughness, metalness, envMapIntensity, ...toonSafeOpts } = opts;
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getPS2GradientMap(),
    ...toonSafeOpts,
  });
}

function createSkinnedInkOutlineMat(thickness = 0.0022) {
  const mat = new THREE.MeshToonMaterial({
    color: 0x000000,
    emissive: 0x160c26,
    emissiveIntensity: 1.0,
    side: THREE.BackSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = vec3( position + normalize( normal ) * ${thickness.toFixed(5)} );`
    );
  };
  return mat;
}

const gltfCache = {};
const loader = new GLTFLoader();

export function preloadCharacters(onProgress) {
  const keys = Object.keys(CHAR_CONFIG);
  let loaded = 0;
  return Promise.all(
    keys.map((key) => {
      if (gltfCache[key]) return Promise.resolve(gltfCache[key]);
      return new Promise((resolve, reject) => {
        loader.load(
          CHAR_CONFIG[key].url,
          (gltf) => {
            gltfCache[key] = gltf;
            loaded++;
            onProgress?.(loaded / keys.length);
            resolve(gltf);
          },
          undefined,
          (err) => {
            console.error(`Erro ao carregar ${key}:`, err);
            reject(err);
          }
        );
      });
    })
  );
}

function createLoadingSilhouette(colorHex) {
  const g = new THREE.Group();
  const mat = createStylizedMat(colorHex, { transparent: true, opacity: 0.65 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.85, 6, 12), mat);
  body.position.y = 0.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat);
  head.position.y = 1.45;
  g.add(body, head);
  return g;
}

const FINGER_GROUPS = ['Index', 'Middle', 'Ring', 'Pinky'];
const _euler = new THREE.Euler();
const _deltaQ = new THREE.Quaternion();
const _desiredQ = new THREE.Quaternion();

export function createCharacterActor(charKey = 'mauricio', { scale = 1, showShadowRing = true } = {}) {
  const key = charKey === 'maria' ? 'maria' : 'mauricio';
  const cfg = CHAR_CONFIG[key];

  const root = new THREE.Group();
  root.scale.setScalar(scale);

  let contactShadow = null;
  if (showShadowRing) {
    const shGeo = new THREE.PlaneGeometry(1.08, 1.08);
    shGeo.rotateX(-Math.PI / 2);
    const shMat = new THREE.MeshBasicMaterial({
      map: SurfaceTextures.blobShadow(),
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    contactShadow = new THREE.Mesh(shGeo, shMat);
    contactShadow.position.y = 0.015;
    root.add(contactShadow);
  }

  const motionRoot = new THREE.Group();
  root.add(motionRoot);

  const bodyHolder = new THREE.Group();
  motionRoot.add(bodyHolder);

  const placeholder = createLoadingSilhouette(cfg.accent);
  bodyHolder.add(placeholder);

  const anchors = {
    rightHand: new THREE.Group(),
    leftHand: new THREE.Group(),
    headTop: new THREE.Group(),
  };
  anchors.headTop.position.set(0, cfg.height + 0.26, 0);
  root.add(anchors.headTop);

  let rig = null;
  let mixer = null;
  let actions = {};
  let activeClipKey = null;
  let readyCallbacks = [];

  const bankSpring = new Spring1D(0, 120, 18);
  const landSquash = new Spring1D(0, 220, 18);
  const lookSpring = new Spring1D(0, 90, 16);

  let animTime = Math.random() * 5;
  let swingTimer = 0;
  let prevRotY = null;
  let wasJumping = false;
  let stepDustAccum = 0;

  const resolveAction = (dict, targetName) => {
    const low = targetName.toLowerCase();
    if (dict[low]) return dict[low];
    const found = Object.keys(dict).find((k) => k.includes(low));
    return found ? dict[found] : null;
  };

  const transitionToClip = (clipKey, fadeSeconds = 0.24) => {
    if (!mixer || activeClipKey === clipKey) return;
    const nextAct = resolveAction(actions, clipKey) || resolveAction(actions, 'idle');
    if (!nextAct) return;

    const prevAct = activeClipKey ? resolveAction(actions, activeClipKey) : null;
    // Time-warp sincroniza a fase das pernas perfeitamente entre Walk <-> Run!
    const shouldWarp =
      (activeClipKey === 'walk' && clipKey === 'run') ||
      (activeClipKey === 'run' && clipKey === 'walk');

    nextAct.enabled = true;
    nextAct.setEffectiveTimeScale(1);
    nextAct.setEffectiveWeight(1);

    if (!shouldWarp) {
      nextAct.reset();
    }
    nextAct.play();

    if (prevAct && prevAct !== nextAct) {
      prevAct.crossFadeTo(nextAct, fadeSeconds, shouldWarp);
    }
    activeClipKey = clipKey;
  };

  const mountGLTF = (gltf) => {
    const model = SkeletonUtils.clone(gltf.scene);
    const skinnedMeshes = [];

    model.traverse((obj) => {
      if (!obj.isMesh && !obj.isSkinnedMesh) return;
      obj.frustumCulled = false;
      obj.castShadow = true;
      obj.receiveShadow = false;
      const oldMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      const diffuseTex = oldMat?.map || oldMat?.emissiveMap || null;
      if (diffuseTex) {
        diffuseTex.colorSpace = THREE.SRGBColorSpace;
      }
      obj.material = new THREE.MeshToonMaterial({
        color: 0xffffff,
        map: diffuseTex,
        emissive: 0xffe8de,
        emissiveMap: diffuseTex,
        emissiveIntensity: 0.16,
        gradientMap: getPS2GradientMap(),
        side: THREE.DoubleSide,
      });
      if (obj.isSkinnedMesh) skinnedMeshes.push(obj);
    });

    const outlineMat = createSkinnedInkOutlineMat(0.0022);
    for (const sm of skinnedMeshes) {
      const outline = new THREE.SkinnedMesh(sm.geometry, outlineMat);
      outline.frustumCulled = false;
      outline.bind(sm.skeleton, sm.bindMatrix);
      sm.parent?.add(outline);
    }

    model.updateWorldMatrix(true, true);
    const bbox = new THREE.Box3().setFromObject(model);
    const rawH = Math.max(0.01, bbox.max.y - bbox.min.y);
    const k = cfg.height / rawH;
    model.scale.multiplyScalar(k);
    model.position.y = -bbox.min.y * k;

    bodyHolder.remove(placeholder);
    bodyHolder.add(model);

    const bonesByName = {};
    const restMap = new Map();

    (function captureRest(node, parentWorldQ) {
      if (node.name) bonesByName[node.name.toLowerCase()] = node;
      const localQ = node.quaternion.clone();
      restMap.set(node, {
        local: localQ,
        parent: parentWorldQ.clone(),
        parentInv: parentWorldQ.clone().invert(),
      });
      const nextWorldQ = parentWorldQ.clone().multiply(localQ);
      for (const child of node.children) captureRest(child, nextWorldQ);
    })(model, new THREE.Quaternion());

    const b = (name) => bonesByName[name.toLowerCase()] || null;
    const collectFingers = (sidePrefix) => {
      const map = { thumb: [] };
      for (let j = 1; j <= 3; j++) {
        const tb = b(`${sidePrefix}HandThumb${j}`);
        if (tb) map.thumb.push(tb);
      }
      for (const fg of FINGER_GROUPS) {
        map[fg.toLowerCase()] = [];
        for (let j = 1; j <= 3; j++) {
          const fb = b(`${sidePrefix}Hand${fg}${j}`);
          if (fb) map[fg.toLowerCase()].push(fb);
        }
      }
      return map;
    };

    rig = {
      hips: b('Hips'),
      spine: b('Spine'),
      chest: b('Spine2'),
      neck: b('Neck'),
      head: b('Head'),
      lShoulder: b('LeftShoulder'),
      lArm: b('LeftArm'),
      lFore: b('LeftForeArm'),
      lHand: b('LeftHand'),
      rShoulder: b('RightShoulder'),
      rArm: b('RightArm'),
      rFore: b('RightForeArm'),
      rHand: b('RightHand'),
      lFingers: collectFingers('Left'),
      rFingers: collectFingers('Right'),
      restMap,
    };

    if (rig.rHand) rig.rHand.add(anchors.rightHand);
    if (rig.lHand) rig.lHand.add(anchors.leftHand);

    // Configura THREE.AnimationMixer com os clipes reais de Motion Capture!
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      actions = {};
      for (const clip of gltf.animations) {
        const act = mixer.clipAction(clip);
        actions[clip.name.toLowerCase()] = act;
      }
      transitionToClip('idle', 0.01);
      // Desfasa levemente o tempo inicial para que 2 personagens não respirem em sincronia robótica!
      mixer.update(Math.random() * 1.2);
    }

    actor.ready = true;
    readyCallbacks.forEach((cb) => cb(actor));
    readyCallbacks = [];
  };

  function applyCharSpaceOverride(bone, rx, ry, rz, blendWeight = 1.0) {
    if (!bone || !rig) return;
    const r = rig.restMap.get(bone);
    if (!r) return;
    _euler.set(rx, ry, rz, 'XYZ');
    _deltaQ.setFromEuler(_euler);
    _desiredQ.copy(r.parentInv).multiply(_deltaQ).multiply(r.parent).multiply(r.local);
    if (blendWeight >= 0.999) bone.quaternion.copy(_desiredQ);
    else bone.quaternion.slerp(_desiredQ, blendWeight);
  }

  function applyAdditiveCharDelta(bone, rx, ry, rz) {
    if (!bone || !rig) return;
    const r = rig.restMap.get(bone);
    if (!r) return;
    _euler.set(rx, ry, rz, 'XYZ');
    _deltaQ.setFromEuler(_euler);
    const localDelta = _desiredQ.copy(r.parentInv).multiply(_deltaQ).multiply(r.parent);
    bone.quaternion.premultiply(localDelta);
  }

  function overrideHandFingers(fingerSet, poseType) {
    if (!fingerSet || !rig) return;
    let curls = { index: 0.25, middle: 0.3, ring: 0.36, pinky: 0.42, thumb: 0.18 };
    if (poseType === 'grip' || poseType === 'fist') {
      curls = { index: 1.15, middle: 1.2, ring: 1.25, pinky: 1.28, thumb: 0.72 };
    } else if (poseType === 'open') {
      curls = { index: 0.03, middle: 0.02, ring: 0.04, pinky: 0.06, thumb: 0.04 };
    } else if (poseType === 'scissors') {
      curls = { index: 0.02, middle: 0.02, ring: 1.22, pinky: 1.25, thumb: 0.78 };
    }

    for (const [groupName, list] of Object.entries(fingerSet)) {
      const c = curls[groupName] ?? 0.25;
      for (let i = 0; i < list.length; i++) {
        const fb = list[i];
        const r = rig.restMap.get(fb);
        if (!r) continue;
        _euler.set(c * (i === 0 ? 0.85 : 1.0), 0, 0, 'XYZ');
        _deltaQ.setFromEuler(_euler);
        fb.quaternion.copy(r.local).multiply(_deltaQ);
      }
    }
  }

  const actor = {
    key,
    label: cfg.label,
    accent: cfg.accent,
    height: cfg.height,
    root,
    bodyHolder,
    anchors,
    ready: false,
    onFootstep: null,
    onLand: null,
    whenReady(fn) {
      if (actor.ready) fn(actor);
      else readyCallbacks.push(fn);
    },
    triggerSwing() {
      swingTimer = 0.38;
    },
    update(dt, state = {}) {
      const safeDt = Math.min(0.05, Math.max(0.001, dt));
      animTime += safeDt;
      if (swingTimer > 0) swingTimer = Math.max(0, swingTimer - safeDt);
      if (!rig) return;

      const mode = state.anim || 'idle';
      const spd = state.speed ?? (mode === 'run' ? 6.0 : mode === 'walk' ? 3.5 : 0);
      const jumping = !!state.jumping;

      if (wasJumping && !jumping) {
        landSquash.impulse(-1.6);
        actor.onLand?.(root.position.x, root.position.z);
      }
      wasJumping = jumping;

      const curRotY = root.rotation.y;
      if (prevRotY === null) prevRotY = curRotY;
      let dRot = curRotY - prevRotY;
      while (dRot > Math.PI) dRot -= Math.PI * 2;
      while (dRot < -Math.PI) dRot += Math.PI * 2;
      prevRotY = curRotY;
      const turnRate = dRot / safeDt;

      bankSpring.target = mode === 'sit' ? 0 : Math.max(-0.18, Math.min(0.18, -turnRate * Math.min(1, spd / 5) * 0.038));
      const bank = bankSpring.step(safeDt);
      const squash = landSquash.step(safeDt);
      motionRoot.rotation.set(0, 0, bank);

      if (contactShadow) {
        const airH = Math.max(0, root.position.y);
        contactShadow.scale.setScalar(Math.max(0.42, 1 - airH * 0.25));
        contactShadow.material.opacity = Math.max(0.2, 0.88 - airH * 0.35);
      }

      // 1. Escolhe o clipe real de Motion Capture e faz CrossFade suave!
      const isBack = !!state.animBackwards || mode === 'walkback';
      let desiredClip = 'idle';
      let fadeTime = 0.24;
      if (mode === 'sit') {
        desiredClip = 'sit';
        fadeTime = 0.28;
      } else if (jumping) {
        desiredClip = 'jump';
        fadeTime = 0.14;
      } else if (mode === 'dance') {
        desiredClip = 'dance';
        fadeTime = 0.3;
      } else if (mode === 'wave') {
        desiredClip = 'wave';
        fadeTime = 0.26;
      } else if (isBack && (spd > 0.22 || mode === 'walkback' || mode === 'walk' || mode === 'run')) {
        desiredClip = resolveAction(actions, 'walkback') ? 'walkback' : 'walk';
        fadeTime = 0.2;
      } else if (spd > 4.4 || mode === 'run') {
        desiredClip = 'run';
        fadeTime = 0.22;
      } else if (spd > 0.22 || mode === 'walk') {
        desiredClip = 'walk';
        fadeTime = 0.22;
      }

      transitionToClip(desiredClip, fadeTime);

      // Ajusta timeScale proporcionalmente à velocidade real -> passos cravados no chão!
      const curAct = activeClipKey ? resolveAction(actions, activeClipKey) : null;
      if (curAct) {
        if (activeClipKey === 'walkback') {
          curAct.timeScale = THREE.MathUtils.clamp(spd / 3.0, 0.72, 1.45);
        } else if (activeClipKey === 'walk') {
          const sign = isBack ? -1 : 1;
          curAct.timeScale = sign * THREE.MathUtils.clamp(spd / 3.3, 0.68, 1.35);
        } else if (activeClipKey === 'run') {
          const sign = isBack ? -1 : 1;
          curAct.timeScale = sign * THREE.MathUtils.clamp(spd / 6.1, 0.82, 1.26);
        } else {
          curAct.timeScale = 1.0;
        }
      }

      // Poeira de corrida sincronizada
      if (activeClipKey === 'run' && !jumping) {
        stepDustAccum += safeDt * (spd / 5.5);
        if (stepDustAccum > 0.28) {
          stepDustAccum = 0;
          actor.onFootstep?.(root.position.x, root.position.z);
        }
      }

      // Offset vertical quando sentado no banco ou no Kart 3D + absorção de pouso
      const baseHolderY = mode === 'sit' ? (state.inKart ? -0.46 : -0.36) : squash * 0.08;
      bodyHolder.position.y += (baseHolderY - bodyHolder.position.y) * (1 - Math.exp(-16 * safeDt));

      // 2. Avança o AnimationMixer (aplica as curvas ópticas reais de estúdio!)
      if (mixer) {
        mixer.update(safeDt);
      }

      // 3. Camadas Aditivas de Gameplay (aplicadas APÓS o MoCap sem destruir o movimento natural do corpo!)
      lookSpring.target = state.lookYaw ?? 0;
      const headYaw = lookSpring.step(safeDt);
      if (Math.abs(headYaw) > 0.005) {
        applyAdditiveCharDelta(rig.neck, 0, headYaw * 0.35, 0);
        applyAdditiveCharDelta(rig.head, 0, headYaw * 0.65, 0);
      }

      if (mode === 'sit' && state.inKart) {
        const st = state.steer || 0;
        applyCharSpaceOverride(rig.lArm, -0.68, 0, -0.14 + st * 0.24, 0.9);
        applyCharSpaceOverride(rig.lFore, -0.56, 0.24, 0, 0.9);
        applyCharSpaceOverride(rig.rArm, -0.68, 0, 0.14 + st * 0.24, 0.9);
        applyCharSpaceOverride(rig.rFore, -0.56, -0.24, 0, 0.9);
        overrideHandFingers(rig.lFingers, 'grip');
        overrideHandFingers(rig.rFingers, 'grip');
      } else if (mode === 'paint') {
        const p = animTime * 5.0;
        applyCharSpaceOverride(rig.rArm, -0.78 + Math.sin(p) * 0.22, Math.cos(p * 0.8) * 0.22, 0.05, 0.92);
        applyCharSpaceOverride(rig.rFore, -0.54 + Math.cos(p) * 0.18, 0, 0, 0.92);
        overrideHandFingers(rig.rFingers, 'grip');
      } else if (mode === 'rps') {
        const pump = Math.sin(animTime * 9.5);
        applyCharSpaceOverride(rig.rArm, -0.75 + pump * 0.34, 0, 0.1, 0.95);
        applyCharSpaceOverride(rig.rFore, -0.65 - pump * 0.25, 0, 0, 0.95);
        const handShape = state.rpsHand === 'papel' ? 'open' : state.rpsHand === 'tesoura' ? 'scissors' : 'fist';
        overrideHandFingers(rig.rFingers, handShape);
      } else if (swingTimer > 0) {
        const u = 1 - swingTimer / 0.38;
        const w = Math.sin(u * Math.PI);
        const k = u < 0.22 ? -(u / 0.22) * 0.35 : Math.sin(((u - 0.22) / 0.78) * Math.PI);
        applyCharSpaceOverride(rig.rArm, -1.2 * k, -0.72 * k, -0.45 * w, Math.min(1, w * 1.6));
        applyCharSpaceOverride(rig.rFore, -0.5, 0, 0, Math.min(1, w * 1.6));
        overrideHandFingers(rig.rFingers, 'grip');
      } else if (state.holdingProp) {
        overrideHandFingers(rig.rFingers, 'grip');
      }
    },
  };

  if (gltfCache[key]) {
    mountGLTF(gltfCache[key]);
  } else {
    preloadCharacters().then(() => {
      if (gltfCache[key]) mountGLTF(gltfCache[key]);
    });
  }

  return actor;
}

export function createNameBadgeSprite(name, accent = '#ff477e') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 136;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 512, 136);
  ctx.font = '800 38px "Zen Maru Gothic", "Fredoka", "Segoe UI", sans-serif';
  const w = Math.min(468, Math.max(180, ctx.measureText(name).width + 92));
  const x = (512 - w) / 2;
  const skew = 14;

  // Sombra cel-shaded dura em nanquim (#1b1936)
  ctx.fillStyle = '#1b1936';
  ctx.beginPath();
  ctx.moveTo(x + skew + 6, 34);
  ctx.lineTo(x + w + 6, 34);
  ctx.lineTo(x + w - skew + 6, 106);
  ctx.lineTo(x + 6, 106);
  ctx.closePath();
  ctx.fill();

  // Placa creme anime com faixa lateral colorida
  ctx.fillStyle = '#fffbf5';
  ctx.strokeStyle = '#1b1936';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(x + skew, 28);
  ctx.lineTo(x + w, 28);
  ctx.lineTo(x + w - skew, 100);
  ctx.lineTo(x, 100);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Faixa chanfrada de cor do personagem à esquerda
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(x + skew, 28);
  ctx.lineTo(x + skew + 22, 28);
  ctx.lineTo(x + 22, 100);
  ctx.lineTo(x, 100);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1b1936';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 262, 65);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.85, 0.49, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function createChatBubbleSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 196;
  const ctx = canvas.getContext('2d');

  const msg = text.length > 54 ? text.slice(0, 52) + '…' : text;

  // Sombra manga dura
  ctx.fillStyle = '#1b1936';
  ctx.beginPath();
  ctx.roundRect(30, 24, 588, 122, 22);
  ctx.fill();

  // Balão de diálogo mangá/anime marfim
  ctx.fillStyle = '#fffdf8';
  ctx.strokeStyle = '#1b1936';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(22, 16, 588, 122, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fffdf8';
  ctx.beginPath();
  ctx.moveTo(298, 135);
  ctx.lineTo(320, 174);
  ctx.lineTo(342, 135);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(298, 138);
  ctx.lineTo(320, 174);
  ctx.lineTo(342, 138);
  ctx.stroke();

  ctx.fillStyle = '#1b1936';
  ctx.font = '800 32px "Zen Maru Gothic", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, 316, 78);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.35, 0.72, 1);
  sprite.renderOrder = 12;
  return sprite;
}
