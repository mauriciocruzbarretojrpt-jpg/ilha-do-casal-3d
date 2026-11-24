// Carregador & Cel-Shader Anime para Modelos 3D Gratuitos CC0 (Quaternius & Kenney)
// Normaliza pivô na base (y = 0), escala para medidas reais em metros, aplica MeshToonMaterial
// coeso com rampa quente de Anime/JRPG e permite tingir copas de árvores em Sakura Rosa / Dourado!

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getPS2GradientMap } from './characters.js';

const loader = new GLTFLoader();
const glbCache = new Map();
const pendingLoads = new Map();

export const PROP_URLS = {
  gazebo: './models/props/gazebo.glb',
  bridge: './models/props/bridge.glb',
  fountain: './models/props/fantasy-town/fountain.glb',
  bench: './models/props/bench.glb',
  bench_cozy: './models/props/bench_cozy.glb',
  streetlight: './models/props/streetlight.glb',
  lamp_single: './models/props/lamp_single.glb',
  lantern: './models/props/fantasy-town/lantern.glb',
  fence: './models/props/fence.glb',
  market_stand_1: './models/props/market_stand_1.glb',
  market_stand_2: './models/props/market_stand_2.glb',
  stall_red: './models/props/fantasy-town/stall_red.glb',
  stall_green: './models/props/fantasy-town/stall_green.glb',
  tree_1: './models/props/tree_1.glb',
  tree_2: './models/props/tree_2.glb',
  tree_birch: './models/props/tree_birch.glb',
  palm_1: './models/props/palm_1.glb',
  palm_2: './models/props/palm_2.glb',
  bush_1: './models/props/bush_1.glb',
  bush_berries: './models/props/bush_berries.glb',
  flowers: './models/props/flowers.glb',
  lilypad: './models/props/lilypad.glb',
  rock_1: './models/props/rock_1.glb',
  rock_2: './models/props/rock_2.glb',
  barrel: './models/props/barrel.glb',
  crate: './models/props/crate.glb',
  table_round: './models/props/table_round.glb',
  chair_cafe: './models/props/chair_cafe.glb',
  houseplant: './models/props/houseplant.glb',
  arcade: './models/props/mini-arcade/arcade.glb',
  kart_blue: './models/props/car/kart_blue.glb',
  kart_pink: './models/props/car/kart_pink.glb',
  grandstand: './models/props/grandstand.glb',
  barrier_red: './models/props/barrier_red.glb',
  barrier_white: './models/props/barrier_white.glb',
  flag_checkers: './models/props/flag_checkers.glb',
};

export function loadPropGLB(key) {
  if (glbCache.has(key)) return Promise.resolve(glbCache.get(key));
  if (pendingLoads.has(key)) return pendingLoads.get(key);

  const url = PROP_URLS[key] || key;
  const p = new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        glbCache.set(key, gltf);
        pendingLoads.delete(key);
        resolve(gltf);
      },
      undefined,
      (err) => {
        console.warn(`[PropLoader] Falha ao carregar ${key} (${url}):`, err);
        pendingLoads.delete(key);
        resolve(null);
      }
    );
  });
  pendingLoads.set(key, p);
  return p;
}

export function preloadAllProps(keys = Object.keys(PROP_URLS), onProgress) {
  let done = 0;
  const total = Math.max(1, keys.length);
  return Promise.all(
    keys.map((k) =>
      loadPropGLB(k).then((res) => {
        done++;
        onProgress?.(done / total);
        return res;
      })
    )
  );
}

function isFoliageMaterial(mat, meshName = '') {
  const nm = `${mat?.name || ''} ${meshName || ''}`.toLowerCase();
  if (/leaf|leaves|foliage|bush|grass|plant|tree_top|canopy|green/.test(nm)) return true;
  if (mat?.color) {
    const { r, g, b } = mat.color;
    // Detecta verdes típicos das copas da Quaternius / Kenney
    if (g > r * 1.18 && g > b * 1.15 && g > 0.16) return true;
  }
  return false;
}

function convertToAnimeToon(oldMat, meshName, opts = {}) {
  const col = oldMat?.color ? oldMat.color.clone() : new THREE.Color(0xffffff);
  const map = oldMat?.map || null;
  if (map) map.colorSpace = THREE.SRGBColorSpace;

  const matName = `${oldMat?.name || ''} ${meshName || ''}`;
  const isLampBulb = /\blight\b|bulb|lantern_glass|glow/i.test(matName);

  if (opts.leafTint && isFoliageMaterial(oldMat, meshName)) {
    col.set(opts.leafTint);
  } else if (opts.primaryTint && /body|paint|roof|red|blue|main|cloth|fabric/i.test(oldMat?.name || '')) {
    col.set(opts.primaryTint);
  }

  return new THREE.MeshToonMaterial({
    color: isLampBulb ? 0xfff8dc : col,
    map,
    emissive: isLampBulb ? new THREE.Color(0xffb703) : new THREE.Color(0x000000),
    emissiveIntensity: isLampBulb ? 1.65 : 0.0,
    vertexColors: !!oldMat?.vertexColors,
    gradientMap: getPS2GradientMap(),
    transparent: !!oldMat?.transparent,
    opacity: oldMat?.opacity ?? 1,
    alphaTest: oldMat?.alphaTest ?? 0,
    side: oldMat?.side ?? THREE.FrontSide,
  });
}

/**
 * Instancia um modelo 3D gratuito (.glb) já com pivô centralizado na base (y=0),
 * convertido para Anime Cel-Shading e com medidas exatas para a Física 3D!
 */
export async function spawnAnimeProp(key, opts = {}) {
  const gltf = await loadPropGLB(key);
  if (!gltf || !gltf.scene) return null;

  const raw = gltf.scene.clone(true);

  if (opts.stripDriver) {
    const toRemove = [];
    raw.traverse((c) => {
      if (/character|driver|person/i.test(c.name || '')) toRemove.push(c);
    });
    toRemove.forEach((c) => c.parent?.remove(c));
  }

  raw.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(raw);
  const rawSize = new THREE.Vector3();
  const rawCenter = new THREE.Vector3();
  box.getSize(rawSize);
  box.getCenter(rawCenter);

  let k = opts.scale ?? 1;
  if (opts.targetHeight && rawSize.y > 1e-6) {
    k = opts.targetHeight / rawSize.y;
  } else if (opts.targetWidth && Math.max(rawSize.x, rawSize.z) > 1e-6) {
    k = opts.targetWidth / Math.max(rawSize.x, rawSize.z);
  }

  const wrapper = new THREE.Group();
  raw.scale.multiplyScalar(k);
  raw.position.set(-rawCenter.x * k, -box.min.y * k, -rawCenter.z * k);

  const castShadow = opts.castShadow ?? true;
  const receiveShadow = opts.receiveShadow ?? true;

  raw.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = castShadow;
    child.receiveShadow = receiveShadow;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((m) => convertToAnimeToon(m, child.name, opts));
    } else if (child.material) {
      child.material = convertToAnimeToon(child.material, child.name, opts);
    }
  });

  wrapper.add(raw);
  if (opts.position) wrapper.position.set(opts.position[0], opts.position[1] || 0, opts.position[2]);
  if (opts.rotY !== undefined) wrapper.rotation.y = opts.rotY;

  const finalSize = new THREE.Vector3(rawSize.x * k, rawSize.y * k, rawSize.z * k);
  return {
    group: wrapper,
    size: finalSize,
    halfX: finalSize.x * 0.5,
    halfZ: finalSize.z * 0.5,
    height: finalSize.y,
    radius: Math.max(finalSize.x, finalSize.z) * 0.5,
  };
}
