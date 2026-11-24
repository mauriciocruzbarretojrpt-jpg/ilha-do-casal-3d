// Mapa 3D Explorável — "Ilha do Casal: Anime Edition"
// Montado com modelos 3D gratuitos reais (CC0 Quaternius & Kenney .glb), Cel-Shading Anime,
// Física 3D Completa (PhysicsWorld3D: personagens sólidos, árvores, bancos, muretas, ponte arqueada,
// bolas chutáveis com rolamento físico real e caixas/barris interativos!).

import * as THREE from 'three';
import {
  createCharacterActor,
  createNameBadgeSprite,
  createChatBubbleSprite,
  createStylizedMat,
} from './characters.js';
import {
  SpringVec3,
  SurfaceTextures,
  VFXSystem,
  createAtmosphericSky,
  adaptCameraForAspect,
  isMobileDevice,
} from './graphics.js';
import { PhysicsWorld3D } from './physics3d.js';
import { spawnAnimeProp, preloadAllProps } from './propLoader.js';
import { MINIGAMES } from './catalog.js';
import { audio } from './audio.js';

const MOOD_PRESETS = {
  sunset: {
    label: 'Crepúsculo Sakura',
    skyElev: 7.5,
    skyAzim: 155,
    fog: 0x7c3f68,
    fogDensity: 0.0072,
    hemiSky: 0xffd0b5,
    hemiGround: 0x3b2854,
    hemiInt: 0.94,
    sunColor: 0xffb36b,
    sunInt: 1.62,
    water: 0x2186b8,
    lanternGlow: 1.9,
    starsOpacity: 0.38,
    exposure: 0.99,
  },
  night: {
    label: 'Noite Estrelada',
    skyElev: -4.5,
    skyAzim: 155,
    fog: 0x161b4a,
    fogDensity: 0.0088,
    hemiSky: 0x7b96ff,
    hemiGround: 0x181538,
    hemiInt: 0.78,
    sunColor: 0xa6c1ff,
    sunInt: 1.1,
    water: 0x143d75,
    lanternGlow: 2.6,
    starsOpacity: 0.95,
    exposure: 1.04,
  },
  day: {
    label: 'Manhã de Verão',
    skyElev: 36,
    skyAzim: 135,
    fog: 0x7ec8f8,
    fogDensity: 0.0048,
    hemiSky: 0xffffff,
    hemiGround: 0x4d7c0f,
    hemiInt: 1.06,
    sunColor: 0xfff8d6,
    sunInt: 1.68,
    water: 0x14a3f5,
    lanternGlow: 0.35,
    starsOpacity: 0.0,
    exposure: 0.96,
  },
};

function makeScoreSignCanvas(mg, wins = { maria: 0, mauricio: 0 }) {
  const c = document.createElement('canvas');
  c.width = 540;
  c.height = 196;
  const ctx = c.getContext('2d');

  const skew = 16;
  // Sombra manga dura em nanquim (#1b1936)
  ctx.fillStyle = '#1b1936';
  ctx.beginPath();
  ctx.moveTo(24 + skew, 24);
  ctx.lineTo(524, 24);
  ctx.lineTo(524 - skew, 180);
  ctx.lineTo(24, 180);
  ctx.closePath();
  ctx.fill();

  // Placa marfim anime
  ctx.fillStyle = '#fffbf5';
  ctx.strokeStyle = '#1b1936';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(16 + skew, 16);
  ctx.lineTo(516, 16);
  ctx.lineTo(516 - skew, 172);
  ctx.lineTo(16, 172);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Faixa superior com a cor do minigame
  ctx.fillStyle = mg.accent;
  ctx.beginPath();
  ctx.moveTo(19 + skew, 19);
  ctx.lineTo(513, 19);
  ctx.lineTo(506, 86);
  ctx.lineTo(19 + skew * 0.55, 86);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1b1936';
  ctx.lineWidth = 5;
  ctx.font = '900 33px "Mochiy Pop One", "Zen Maru Gothic", "Fredoka", sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeText(mg.name.toUpperCase(), 268, 63);
  ctx.fillText(mg.name.toUpperCase(), 268, 63);

  ctx.font = '800 28px "Zen Maru Gothic", "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#e11d68';
  ctx.fillText(`MARIA ${wins.maria || 0}`, 152, 138);
  ctx.fillStyle = '#1b1936';
  ctx.fillText('✦ VS ✦', 268, 138);
  ctx.fillStyle = '#0284c7';
  ctx.fillText(`${wins.mauricio || 0} MAURICIO`, 386, 138);

  return c;
}

function makeBeachBallTexture(primaryHex, secondaryHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  const stripes = [primaryHex, '#fffdf7', secondaryHex, '#ffd166', primaryHex, '#fffdf7'];
  const sw = c.width / stripes.length;
  stripes.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(i * sw, 0, sw + 1, c.height);
    ctx.fillStyle = '#1b1936';
    ctx.fillRect(i * sw, 0, 3, c.height);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class CoupleIslandWorld {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.12, 320);
    adaptCameraForAspect(this.camera, 48, 1.25, 72);

    this.vfx = new VFXSystem(this.scene);
    this.physics = new PhysicsWorld3D();
    this.physics.setIslandBoundary(22.5);

    this.mode = 'menu';
    this.menuFocus = 'mauricio';
    this.moodKey = 'sunset';

    this.youId = null;
    this.players = new Map();
    this.pavilions = [];
    this.animatedProps = [];
    this.bulbMats = [];

    this.localState = {
      x: 0,
      y: 0,
      z: 3.6,
      vx: 0,
      vz: 0,
      vy: 0,
      rotY: Math.PI,
      speed: 0,
      jumping: false,
      justLanded: false,
      groundY: 0,
      coyoteTimer: 0,
      jumpBuffer: 0,
      sitting: false,
      walkTarget: null,
    };

    this.camOrbit = {
      yaw: 0,
      pitch: 0.34,
      dist: 6.6,
      dragging: false,
      lastX: 0,
      lastY: 0,
    };
    this.camPosSpring = new SpringVec3(0, 4, 10, 115, 20);
    this.camLookSpring = new SpringVec3(0, 1.4, 3.6, 145, 22);

    this.keys = new Set();
    this.joyVec = { x: 0, y: 0 };
    this._poseSendAccum = 0;
    this._stepSoundAccum = 0;
    this._nearTarget = null;

    this._buildSkyAndLighting();
    this._buildIslandBaseAndColliders();
    this._buildMenuShowcaseActors();
    this._buildPavilions();
    this._buildDynamicPhysicsPlayground();
    this._populateCC0ModelsAsync();
    this._buildParticles();
    this._bindInputs();
    this.setMood('sunset');
  }

  _buildSkyAndLighting() {
    this.skySystem = createAtmosphericSky({ elevation: 4.5, azimuth: 148 });
    this.scene.add(this.skySystem.sky);

    const starCount = 520;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.08 + Math.random() * 0.92);
      const r = 185;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.15,
      transparent: true,
      opacity: 0.3,
      fog: false,
      toneMapped: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.scene.add(this.stars);

    this.hemiLight = new THREE.HemisphereLight(0xffc6ad, 0x2d243b, 0.92);
    this.scene.add(this.hemiLight);

    const shadowRes = isMobileDevice() ? 1024 : 2048;
    this.sunLight = new THREE.DirectionalLight(0xffab68, 2.05);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(shadowRes, shadowRes);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 95;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.025;
    const d = 28;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    this.plazaLight = new THREE.PointLight(0xffb76b, 3.0, 19, 1.6);
    this.plazaLight.position.set(0, 3.8, -2.0);
    this.scene.add(this.plazaLight);

    this.scene.fog = new THREE.FogExp2(0x4b2956, 0.0072);
  }

  setMood(moodKey) {
    const m = MOOD_PRESETS[moodKey] ? moodKey : 'sunset';
    this.moodKey = m;
    const p = MOOD_PRESETS[m];

    const sunDir = this.skySystem.updateSun(p.skyElev, p.skyAzim);
    const lightElev = Math.max(0.28, sunDir.y);
    this.sunLight.position.set(sunDir.x * 34, lightElev * 38, sunDir.z * 34);

    this.scene.fog.color.setHex(p.fog);
    this.scene.fog.density = p.fogDensity;
    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemiInt;
    this.sunLight.color.setHex(p.sunColor);
    this.sunLight.intensity = p.sunInt;
    this.starMat.opacity = p.starsOpacity;
    this.plazaLight.intensity = p.lanternGlow * 1.4;

    if (this.oceanMat) this.oceanMat.color.setHex(p.water);
    if (this.pondMat) this.pondMat.color.setHex(p.water);
    if (this.bulbMats) {
      this.bulbMats.forEach((bm) => { bm.emissiveIntensity = p.lanternGlow; });
    }
    this.callbacks.onExposureChange?.(p.exposure);
    return p.label;
  }

  cycleMood() {
    const order = ['sunset', 'night', 'day'];
    const next = order[(order.indexOf(this.moodKey) + 1) % order.length];
    this.setMood(next);
    return next;
  }

  _buildIslandBaseAndColliders() {
    const waterBump = SurfaceTextures.waterNormal(14);
    this.waterBump = waterBump;

    // 1. Oceano Turquesa Anime
    const oceanGeo = new THREE.CircleGeometry(160, 64);
    oceanGeo.rotateX(-Math.PI / 2);
    this.oceanMat = new THREE.MeshStandardMaterial({
      color: 0x2186b8,
      bumpMap: waterBump,
      bumpScale: 0.04,
      roughness: 0.12,
      metalness: 0.3,
      envMapIntensity: 1.2,
    });
    this.oceanMesh = new THREE.Mesh(oceanGeo, this.oceanMat);
    this.oceanMesh.position.y = -0.55;
    this.scene.add(this.oceanMesh);

    const foamGeo = new THREE.RingGeometry(24.6, 26.3, 64);
    foamGeo.rotateX(-Math.PI / 2);
    this.foamMesh = new THREE.Mesh(
      foamGeo,
      new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.5 })
    );
    this.foamMesh.position.y = -0.48;
    this.scene.add(this.foamMesh);

    // 2. Terreno de Praia Dourada + Gramado Cel-Shaded
    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(24.6, 26.6, 0.72, 44),
      createStylizedMat(0xf7d996)
    );
    sand.position.y = -0.42;
    sand.receiveShadow = true;
    this.scene.add(sand);

    const grassTex = SurfaceTextures.grass(14);
    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(23.3, 24.3, 0.36, 44),
      createStylizedMat(0xffffff, { map: grassTex })
    );
    grass.position.y = -0.18;
    grass.receiveShadow = true;
    this.scene.add(grass);
    this.groundMesh = grass;

    // 3. Praça Central e Espelho d'Água Sólido com Ponte Arqueada
    const stoneTex = SurfaceTextures.stonePlaza(7);
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(8.9, 9.15, 0.09, 40),
      createStylizedMat(0xffffff, { map: stoneTex })
    );
    plaza.position.set(0, 0.025, -2.0);
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    this.pondMat = new THREE.MeshStandardMaterial({
      color: 0x2299dd,
      bumpMap: waterBump,
      bumpScale: 0.025,
      roughness: 0.08,
      metalness: 0.38,
      envMapIntensity: 1.35,
    });
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(3.55, 3.55, 0.09, 44), this.pondMat);
    pond.position.set(0, 0.045, -2.0);
    this.scene.add(pond);

    const pondRim = new THREE.Mesh(
      new THREE.TorusGeometry(3.64, 0.19, 14, 48),
      createStylizedMat(0xf1f5f9)
    );
    pondRim.rotation.x = Math.PI / 2;
    pondRim.position.set(0, 0.1, -2.0);
    pondRim.castShadow = true;
    pondRim.receiveShadow = true;
    this.scene.add(pondRim);

    // Física da Lagoa + Ponte Arqueada (altura contínua casada ao modelo 3D bridge.glb + guarda-corpos laterais!)
    this.physics.addPondBarrier(0, -2.0, 3.66, 1.35);
    this.physics.addSurface((x, z) => {
      const dz = z + 2.0;
      if (Math.abs(x) <= 1.42 && Math.abs(dz) <= 3.85) {
        const u = Math.min(1, Math.abs(dz) / 3.85);
        return Math.cos(u * Math.PI * 0.5) * 0.68 + 0.08;
      }
      return null;
    });
    // Guarda-corpos laterais sólidos da ponte
    this.physics.addBox(-1.46, -2.0, 0.14, 3.5, 0, 0.0, 1.15, { tag: 'bridge-rail' });
    this.physics.addBox(1.46, -2.0, 0.14, 3.5, 0, 0.0, 1.15, { tag: 'bridge-rail' });

    // Posições-chave de marcos da ilha
    this.gazeboPos = new THREE.Vector3(4.2, 0, 5.2);
    this.benchPos = new THREE.Vector3(-5.2, 0, 4.4);

    // Piso elevado caminhável do Gazebo + iluminação cinematográfica de 3 pontos para o Menu 3D!
    const gazeboFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(2.95, 3.18, 0.18, 36),
      createStylizedMat(0xfffbf5, { map: SurfaceTextures.stonePlaza(3) })
    );
    gazeboFloor.position.set(this.gazeboPos.x, 0.09, this.gazeboPos.z);
    gazeboFloor.receiveShadow = true;
    this.scene.add(gazeboFloor);

    this.physics.addSurface((x, z) => {
      if (Math.hypot(x - this.gazeboPos.x, z - this.gazeboPos.z) <= 2.95) return 0.34;
      return null;
    });
    // 4 pilares diagonais sólidos do Gazebo
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      this.physics.addCylinder(
        this.gazeboPos.x + Math.cos(a) * 2.38,
        this.gazeboPos.z + Math.sin(a) * 2.38,
        0.24,
        0,
        3.4,
        { tag: 'gazebo-pillar' }
      );
    }

    const keyLight = new THREE.PointLight(0xffe0c2, 3.1, 10, 1.5);
    keyLight.position.set(this.gazeboPos.x + 0.8, 2.55, this.gazeboPos.z + 2.2);
    const rimLight = new THREE.PointLight(0x7cc4ff, 2.3, 8.5, 1.6);
    rimLight.position.set(this.gazeboPos.x - 0.6, 2.4, this.gazeboPos.z - 2.0);
    this.scene.add(keyLight, rimLight);

    // Colisor sólido e subível para o Banco Romântico Principal
    this.physics.addBox(this.benchPos.x, this.benchPos.z, 0.96, 0.36, 0.55, 0, 0.52, {
      climbable: true,
      tag: 'bench-main',
    });

    // Marcador de clique no chão
    const ringGeo = new THREE.RingGeometry(0.26, 0.4, 28);
    ringGeo.rotateX(-Math.PI / 2);
    this.walkMarker = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, toneMapped: false })
    );
    this.walkMarker.position.y = 0.05;
    this.walkMarker.visible = false;
    this.scene.add(this.walkMarker);
  }

  // Monta todos os cenários e objetos com Modelos 3D Gratuitos Reais (CC0 Quaternius & Kenney .glb)!
  async _populateCC0ModelsAsync() {
    // 1. Ponte 3D real da Quaternius sobre o espelho d'água
    spawnAnimeProp('bridge', {
      targetWidth: 7.5,
      position: [0, -0.04, -2.0],
    }).then((res) => {
      if (!res) return;
      // Garante que o comprimento maior da ponte cruze o eixo Z!
      if (res.size.x > res.size.z) res.group.rotation.y = Math.PI / 2;
      this.scene.add(res.group);
    });

    // 2. Gazebo Romântico 3D real da Quaternius
    spawnAnimeProp('gazebo', {
      targetWidth: 5.8,
      position: [this.gazeboPos.x, 0.06, this.gazeboPos.z],
      rotY: Math.PI / 4,
    }).then((res) => {
      if (res) this.scene.add(res.group);
    });

    // 3. Bancos de Parque 3D reais (sob a cerejeira + praça sem sobrepor fontes!)
    const benches = [
      ['bench', this.benchPos.x, this.benchPos.z, 0.55, false],
      ['bench_cozy', -7.2, -4.4, 0.95, true],
      ['bench_cozy', -6.8, 0.8, 1.45, true],
    ];
    benches.forEach(([key, bx, bz, rot, addCol]) => {
      spawnAnimeProp(key, {
        targetWidth: 1.95,
        position: [bx, 0, bz],
        rotY: rot,
      }).then((res) => {
        if (!res) return;
        if (res.size.z > res.size.x) res.group.rotation.y += Math.PI / 2;
        this.scene.add(res.group);
        if (addCol) {
          this.physics.addBox(bx, bz, 0.92, 0.36, res.group.rotation.y, 0, 0.52, { climbable: true, tag: 'bench' });
        }
      });
    });

    // 4. Fontes Ornamentais 3D da Kenney flanqueando a praça + Vitória-régia na lagoa
    for (const [fx, fz] of [[-5.0, -5.8], [5.0, -5.8]]) {
      this.physics.addCylinder(fx, fz, 0.95, 0, 1.45, { climbable: true, tag: 'fountain' });
      spawnAnimeProp('fountain', {
        targetWidth: 1.95,
        position: [fx, 0.02, fz],
      }).then((res) => {
        if (res) this.scene.add(res.group);
      });
    }

    const lilyCoords = [[-1.9, -1.1, 0.3], [-2.3, -2.7, 1.8], [2.0, -1.2, 2.4], [2.2, -2.9, 0.9]];
    lilyCoords.forEach(([lx, lz, rot]) => {
      spawnAnimeProp('lilypad', {
        targetWidth: 0.72,
        position: [lx, 0.09, lz],
        rotY: rot,
        castShadow: false,
      }).then((res) => {
        if (res) this.scene.add(res.group);
      });
    });

    // 5. Bosque Anime de Cerejeiras Sakura Rosa, Ipês Dourados e Bétulas (Quaternius CC0 + Colisores de Tronco!)
    const treePlacements = [
      ['tree_1', -6.9, 5.3, 4.9, '#ff85b3'],
      ['tree_2', 7.9, 6.5, 4.7, '#ffa6c9'],
      ['tree_birch', -8.2, -9.2, 4.8, '#ffd166'],
      ['tree_1', 8.4, -9.0, 4.9, '#ff85b3'],
      ['tree_2', -18.2, -1.5, 5.4, '#ff9ebb'],
      ['tree_1', 18.5, -1.2, 5.3, '#ffd166'],
      ['tree_birch', -16.2, 11.2, 5.1, '#ff85b3'],
      ['tree_2', 16.0, 11.5, 5.0, '#ffa6c9'],
      ['tree_1', -7.2, 16.5, 4.6, '#ffd166'],
      ['tree_2', 8.0, 16.2, 4.8, '#ff85b3'],
      ['tree_1', 0, -21.0, 5.4, '#ffa6c9'],
      ['tree_birch', -18.0, -12.2, 4.9, '#ffd166'],
      ['tree_2', 18.0, -12.0, 5.0, '#ff85b3'],
    ];
    treePlacements.forEach(([key, tx, tz, h, tint], i) => {
      this.physics.addCylinder(tx, tz, 0.42, 0, 3.2, { tag: 'tree-trunk' });
      spawnAnimeProp(key, {
        targetHeight: h,
        leafTint: tint,
        position: [tx, 0, tz],
        rotY: i * 1.37,
      }).then((res) => {
        if (res) this.scene.add(res.group);
      });
    });

    // 6. Palmeiras Tropicais 3D na Orla da Praia
    const palmSpots = [
      [-20.8, 6.5, 5.2], [20.8, 6.2, 5.0], [-13.5, 17.8, 5.1], [13.5, 17.6, 5.3],
      [-20.5, -7.8, 4.9], [20.5, -7.8, 5.1], [-9.2, -20.2, 5.0], [9.2, -20.2, 5.2],
    ];
    palmSpots.forEach(([px, pz, h], idx) => {
      this.physics.addCylinder(px, pz, 0.35, 0, 3.5, { tag: 'palm-trunk' });
      spawnAnimeProp(idx % 2 === 0 ? 'palm_1' : 'palm_2', {
        targetHeight: h,
        position: [px, -0.08, pz],
        rotY: Math.atan2(-px, -pz) + (idx % 2 ? 0.4 : -0.4),
      }).then((res) => {
        if (res) this.scene.add(res.group);
      });
    });

    // 7. Postes Românticos Duplos 3D (Quaternius Street Pack) + Varal de Luzes Quentes
    const lanternSpots = [
      [-5.5, -6.5], [5.5, -6.5], [-6.5, 1.5], [6.5, 1.5],
      [-10.2, 9.2], [10.2, 9.2],
    ];
    const postTops = [];
    for (const [lx, lz] of lanternSpots) {
      this.physics.addCylinder(lx, lz, 0.24, 0, 3.7, { tag: 'streetlight' });
      postTops.push(new THREE.Vector3(lx, 3.55, lz));
      spawnAnimeProp('streetlight', {
        targetHeight: 3.85,
        position: [lx, 0, lz],
        rotY: Math.atan2(-lx, -lz),
      }).then((res) => {
        if (res) this.scene.add(res.group);
      });
    }

    const pairs = [[0, 1], [0, 2], [1, 3], [2, 3]];
    for (const [ia, ib] of pairs) {
      const a = postTops[ia];
      const b = postTops[ib];
      for (let k = 1; k <= 7; k++) {
        const u = k / 8;
        const p = new THREE.Vector3().lerpVectors(a, b, u);
        p.y -= Math.sin(u * Math.PI) * 0.44;
        const isWarm = k % 2 === 0;
        const bMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: isWarm ? 0xffb703 : 0xff5d8f,
          emissiveIntensity: 1.9,
          toneMapped: false,
        });
        this.bulbMats.push(bMat);
        const miniBulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), bMat);
        miniBulb.position.copy(p);
        this.scene.add(miniBulb);
      }
    }

    // 8. Cantinho Café & Barraquinha de Festival Anime na Praça (Quaternius Village & Interior Packs)
    this.physics.addBox(8.2, 0.6, 1.15, 0.78, -0.45, 0, 2.5, { tag: 'cafe-stand' });
    spawnAnimeProp('market_stand_1', {
      targetHeight: 2.75,
      position: [8.2, 0, 0.6],
      rotY: -0.45,
    }).then((res) => { if (res) this.scene.add(res.group); });

    for (const [tx, tz] of [[6.2, -1.2], [6.8, 2.4]]) {
      this.physics.addCylinder(tx, tz, 0.56, 0, 0.82, { climbable: true, tag: 'cafe-table' });
      spawnAnimeProp('table_round', { targetHeight: 0.8, position: [tx, 0, tz] }).then((r) => r && this.scene.add(r.group));
      for (const [ox, oz, ry] of [[-0.78, 0, Math.PI / 2], [0.78, 0, -Math.PI / 2]]) {
        this.physics.addCylinder(tx + ox, tz + oz, 0.28, 0, 0.85, { climbable: true, tag: 'cafe-chair' });
        spawnAnimeProp('chair_cafe', { targetHeight: 0.88, position: [tx + ox, 0, tz + oz], rotY: ry }).then((r) => r && this.scene.add(r.group));
      }
    }

    // 9. Pedras escaláveis (climbable!), arbustos floridos e cercas de madeira rústica
    const rocks = [
      ['rock_1', -3.8, 6.2, 1.15, 0.62],
      ['rock_2', -9.4, 2.2, 1.35, 0.75],
      ['rock_1', 9.8, 4.6, 1.25, 0.68],
      ['rock_2', 3.4, -7.8, 1.1, 0.58],
    ];
    rocks.forEach(([rk, rx, rz, w, topH], i) => {
      this.physics.addCylinder(rx, rz, w * 0.46, 0, topH, { climbable: true, tag: 'rock' });
      spawnAnimeProp(rk, { targetWidth: w, position: [rx, 0, rz], rotY: i * 1.7 }).then((r) => r && this.scene.add(r.group));
    });

    const flowerSpots = [
      [-4.2, 3.6], [-6.0, 5.8], [3.2, 6.8], [5.8, 4.0], [-2.5, -6.2], [2.6, -6.2],
      [-9.2, -4.5], [9.4, -4.2], [-4.5, 9.8], [4.8, 9.6],
    ];
    flowerSpots.forEach(([fx, fz], idx) => {
      const propKey = idx % 3 === 0 ? 'bush_berries' : (idx % 2 === 0 ? 'flowers' : 'bush_1');
      spawnAnimeProp(propKey, {
        targetWidth: propKey === 'flowers' ? 0.85 : 1.05,
        position: [fx, 0, fz],
        rotY: idx * 1.1,
      }).then((r) => r && this.scene.add(r.group));
    });

    // Cercas de madeira perto do mirante sul
    for (const [fx, fz, ry] of [[-4.2, 19.8, 0.18], [-2.1, 20.2, 0.08], [2.1, 20.2, -0.08], [4.2, 19.8, -0.18]]) {
      this.physics.addBox(fx, fz, 0.95, 0.16, ry, 0, 0.95, { climbable: true, tag: 'fence' });
      spawnAnimeProp('fence', { targetWidth: 1.9, position: [fx, 0, fz], rotY: ry }).then((r) => r && this.scene.add(r.group));
    }
  }

  // Objetos Físicos Dinâmicos Interativos (Bolas chutáveis + Caixas e Barris empurráveis/escaláveis!)
  _buildDynamicPhysicsPlayground() {
    // 1. Bola de Praia Sakura/Ciano na praça (chute junto com seu amor!)
    const ball1Geo = new THREE.SphereGeometry(0.42, 24, 20);
    const ball1Mat = new THREE.MeshToonMaterial({
      map: makeBeachBallTexture('#ff477e', '#38b6ff'),
      gradientMap: createStylizedMat(0xffffff).gradientMap,
    });
    const ball1Mesh = new THREE.Mesh(ball1Geo, ball1Mat);
    ball1Mesh.castShadow = true;
    this.scene.add(ball1Mesh);

    this.physics.addDynamicBody({
      id: 'beach-ball-1',
      mesh: ball1Mesh,
      kind: 'sphere',
      x: 1.65,
      y: 0.6,
      z: 2.3,
      radius: 0.42,
      mass: 0.65,
      restitution: 0.78,
      friction: 1.35,
      onKick: (b, spd) => {
        audio.play('bounce');
        if (spd > 3.2) this.vfx.spawnSparks(b.x, b.y + 0.35, b.z, 0xff477e, 6);
      },
    });

    // 2. Bola Esportiva Dourada/Azul perto do gramado oeste
    const ball2Mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 22, 18),
      new THREE.MeshToonMaterial({
        map: makeBeachBallTexture('#ffd166', '#2563eb'),
        gradientMap: createStylizedMat(0xffffff).gradientMap,
      })
    );
    ball2Mesh.castShadow = true;
    this.scene.add(ball2Mesh);

    this.physics.addDynamicBody({
      id: 'soccer-ball-2',
      mesh: ball2Mesh,
      kind: 'sphere',
      x: -2.1,
      y: 0.5,
      z: 2.5,
      radius: 0.34,
      mass: 0.75,
      restitution: 0.72,
      friction: 1.5,
      onKick: (b, spd) => {
        audio.play('bounce');
        if (spd > 3.2) this.vfx.spawnSparks(b.x, b.y + 0.3, b.z, 0xffd166, 5);
      },
    });

    // 3. Caixas e Barris 3D reais CC0 com física de massa, empurrão e topo escalável!
    const heavyProps = [
      ['crate', -3.2, -0.4, 0.76, 2.2],
      ['crate', -2.35, -0.55, 0.68, 2.0],
      ['barrel', 7.2, 3.8, 0.88, 2.8],
    ];
    heavyProps.forEach(([key, hx, hz, h, mass], idx) => {
      const holder = new THREE.Group();
      this.scene.add(holder);
      const body = this.physics.addDynamicBody({
        id: `${key}-${idx}`,
        mesh: holder,
        kind: 'cylinder',
        x: hx,
        y: 0,
        z: hz,
        radius: h * 0.48,
        height: h,
        mass,
        restitution: 0.15,
        friction: 5.5,
        climbable: true,
      });
      spawnAnimeProp(key, { targetHeight: h, rotY: idx * 0.6 }).then((res) => {
        if (res) {
          holder.add(res.group);
          body.radius = Math.max(res.halfX, res.halfZ);
          body.height = res.height;
        }
      });
    });
  }

  _create3DHeart(scale = 0.3, color = 0xff477e, emissive = false) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.5);
    shape.bezierCurveTo(0.6, -0.1, 0.9, 0.45, 0.48, 0.8);
    shape.bezierCurveTo(0.2, 1.0, 0, 0.72, 0, 0.55);
    shape.bezierCurveTo(0, 0.72, -0.2, 1.0, -0.48, 0.8);
    shape.bezierCurveTo(-0.9, 0.45, -0.6, -0.1, 0, -0.5);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 3,
    });
    geo.center();
    const mat = emissive
      ? new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 1.6,
          roughness: 0.25,
          metalness: 0.2,
          toneMapped: false,
        })
      : createStylizedMat(color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(scale);
    return mesh;
  }

  _buildMenuShowcaseActors() {
    this.menuGroup = new THREE.Group();
    this.menuGroup.position.copy(this.gazeboPos);
    this.menuGroup.position.y = 0.34;

    this.menuMaria = createCharacterActor('maria');
    this.menuMaria.root.position.set(-0.62, 0, 0.15);
    this.menuMaria.root.rotation.y = 0.22;

    this.menuMauricio = createCharacterActor('mauricio');
    this.menuMauricio.root.position.set(0.62, 0, 0.15);
    this.menuMauricio.root.rotation.y = -0.22;

    const haloGeo = new THREE.RingGeometry(0.5, 0.64, 40);
    haloGeo.rotateX(-Math.PI / 2);
    this.menuHaloMat = new THREE.MeshBasicMaterial({
      color: 0x38b6ff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.menuHalo = new THREE.Mesh(haloGeo, this.menuHaloMat);
    this.menuHalo.position.set(0.62, 0.025, 0.15);

    this.menuGroup.add(this.menuMaria.root, this.menuMauricio.root, this.menuHalo);
    this.scene.add(this.menuGroup);
  }

  setMenuCharacterFocus(focusKey) {
    this.menuFocus = focusKey;
    if (focusKey === 'maria') {
      this.menuHalo.visible = true;
      this.menuHalo.position.set(-0.62, 0.025, 0.15);
      this.menuHaloMat.color.setHex(0xff477e);
    } else if (focusKey === 'mauricio') {
      this.menuHalo.visible = true;
      this.menuHalo.position.set(0.62, 0.025, 0.15);
      this.menuHaloMat.color.setHex(0x38b6ff);
    } else {
      this.menuHalo.visible = false;
    }
  }

  _buildPavilions() {
    const stoneMat = createStylizedMat(0xf8fafc);
    const padMat = createStylizedMat(0xfffbf5);
    const pedMat = createStylizedMat(0xffe5ec);

    for (let idx = 0; idx < MINIGAMES.length; idx++) {
      const mg = MINIGAMES[idx];
      const [px, pz] = mg.pos;
      const faceAngle = Math.atan2(-px, -pz);
      const group = new THREE.Group();
      group.position.set(px, 0, pz);
      group.rotation.y = faceAngle;

      const distCenter = Math.hypot(px, pz + 2);
      const steps = Math.floor(distCenter / 1.55);
      for (let s = 3; s < steps; s++) {
        const u = s / steps;
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.04, 12), stoneMat);
        st.position.set(px * u, 0.015, -2 + (pz + 2) * u);
        st.receiveShadow = true;
        this.scene.add(st);
      }

      const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.48, 0.15, 32), padMat);
      pad.position.y = 0.075;
      pad.receiveShadow = true;
      pad.castShadow = true;
      group.add(pad);

      // Piso caminhável do pavilhão + pedestal central sólido na Física 3D!
      this.physics.addSurface((x, z) => {
        if (Math.hypot(x - px, z - pz) <= 2.38) return 0.15;
        return null;
      });
      this.physics.addCylinder(px, pz, 0.68, 0, 1.45, { climbable: true, tag: `pavilion-${mg.id}` });

      const ringGeo = new THREE.RingGeometry(2.32, 2.55, 44);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: mg.accent,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.04;
      group.add(ring);

      const emblem = this._createMinigame3DEmblem(mg);
      emblem.position.y = 1.32;
      group.add(emblem);

      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.72, 0.68, 20), pedMat);
      ped.position.y = 0.42;
      ped.castShadow = true;
      ped.receiveShadow = true;
      group.add(ped);

      // Adiciona quiosque / fliperama / kart 3D real da Kenney ao lado de cada pavilhão!
      const sidePropKey =
        mg.id === 'corrida' ? 'kart_pink'
          : (mg.id === 'lig4' || mg.id === 'velha' || mg.id === 'memoria') ? 'arcade'
            : (idx % 2 === 0 ? 'stall_red' : 'stall_green');
      const sideX = px + Math.cos(faceAngle) * 2.65;
      const sideZ = pz - Math.sin(faceAngle) * 2.65;
      this.physics.addCylinder(sideX, sideZ, 0.72, 0, 2.1, { climbable: true, tag: 'pavilion-stall' });
      spawnAnimeProp(sidePropKey, {
        targetHeight: sidePropKey === 'kart_pink' ? 1.05 : 2.15,
        stripDriver: true,
        position: [sideX, 0, sideZ],
        rotY: faceAngle,
      }).then((res) => {
        if (res) this.scene.add(res.group);
      });

      const signCanvas = makeScoreSignCanvas(mg, { maria: 0, mauricio: 0 });
      const signTex = new THREE.CanvasTexture(signCanvas);
      signTex.colorSpace = THREE.SRGBColorSpace;
      const signSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: signTex, transparent: true, toneMapped: false })
      );
      signSprite.scale.set(3.35, 1.22, 1);
      signSprite.position.y = 2.95;
      group.add(signSprite);

      this.scene.add(group);
      this.pavilions.push({ mg, group, ringMat, emblem, signSprite, signTex, x: px, z: pz });
    }
  }

  _createMinigame3DEmblem(mg) {
    const g = new THREE.Group();
    const accentMat = createStylizedMat(mg.accent);
    switch (mg.id) {
      case 'tenis': {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.36, 22, 18), createStylizedMat(0xd9f99d));
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.06, 12, 28), accentMat);
        g.add(ball, rim);
        break;
      }
      case 'corrida': {
        spawnAnimeProp('kart_blue', { targetWidth: 1.05, stripDriver: true }).then((res) => {
          if (res) {
            res.group.position.y = -0.25;
            g.add(res.group);
          }
        });
        break;
      }
      case 'bilhar': {
        const eight = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 20), createStylizedMat(0x1e293b));
        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.18, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        dot.position.z = 0.41;
        g.add(eight, dot);
        break;
      }
      case 'desenho': {
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.62, 0.08), createStylizedMat(0xffffff));
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.72, 0.05), createStylizedMat(0xb45309));
        frame.position.z = -0.03;
        const splash = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), accentMat);
        splash.position.set(0.12, 0.05, 0.06);
        g.add(frame, board, splash);
        break;
      }
      case 'sintonia': {
        const h1 = this._create3DHeart(0.42, 0xff477e, true);
        h1.position.x = -0.22;
        const h2 = this._create3DHeart(0.42, 0x38b6ff, true);
        h2.position.set(0.22, 0.08, 0.08);
        g.add(h1, h2);
        break;
      }
      case 'memoria': {
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.66, 0.07), accentMat);
        c1.position.x = -0.2;
        c1.rotation.y = 0.25;
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.66, 0.07), createStylizedMat(0xfbbf24));
        c2.position.x = 0.22;
        c2.rotation.y = -0.25;
        g.add(c1, c2);
        break;
      }
      case 'lig4': {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.68, 0.12), accentMat);
        const d1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 18), createStylizedMat(0xff477e));
        d1.rotation.x = Math.PI / 2;
        d1.position.set(-0.18, 0.1, 0);
        const d2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 18), createStylizedMat(0xfacc15));
        d2.rotation.x = Math.PI / 2;
        d2.position.set(0.18, -0.1, 0);
        g.add(frame, d1, d2);
        break;
      }
      case 'velha': {
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.14), createStylizedMat(0xff477e));
        b1.rotation.z = Math.PI / 4;
        const b2 = b1.clone();
        b2.rotation.z = -Math.PI / 4;
        const oRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 12, 24), accentMat);
        oRing.position.z = -0.18;
        g.add(b1, b2, oRing);
        break;
      }
      case 'ppt': {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), accentMat);
        const paper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.54, 0.04), createStylizedMat(0xf8fafc));
        paper.position.set(0.28, 0.12, -0.15);
        paper.rotation.z = -0.3;
        g.add(rock, paper);
        break;
      }
    }
    return g;
  }

  updateScoreboards(wins = {}) {
    for (const p of this.pavilions) {
      const c = makeScoreSignCanvas(p.mg, wins[p.mg.id] || { maria: 0, mauricio: 0 });
      p.signTex.image = c;
      p.signTex.needsUpdate = true;
    }
  }

  _buildParticles() {
    // Pétalas de Sakura flutuando suavemente pela ilha!
    const count = 200;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 2.0 + Math.random() * 21.5;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.5 + Math.random() * 5.8;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffc2d4,
      map: SurfaceTextures.softOrb(),
      size: 0.3,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      toneMapped: false,
    });
    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  // ==================== CONTROLES & FÍSICA SÓLIDA DO JOGADOR ====================

  _bindInputs() {
    window.addEventListener('keydown', (e) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (this.mode !== 'explore') return;

      if (k === ' ') {
        this.localState.jumpBuffer = 0.14;
      } else if (k === 'e') {
        this.triggerNearInteraction();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    let downX = 0;
    let downY = 0;
    let movedDist = 0;
    const activeCanvasPointers = new Map();
    let prevPinchDist = null;

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'explore') return;
      activeCanvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activeCanvasPointers.size === 1) {
        this.camOrbit.dragging = true;
        this.camOrbit.pointerId = e.pointerId;
        this.camOrbit.lastX = e.clientX;
        this.camOrbit.lastY = e.clientY;
        downX = e.clientX;
        downY = e.clientY;
        movedDist = 0;
      } else if (activeCanvasPointers.size === 2) {
        // Pinça de 2 dedos para zoom no celular!
        const pts = [...activeCanvasPointers.values()];
        prevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        movedDist = 999;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (this.mode !== 'explore' || !activeCanvasPointers.has(e.pointerId)) return;
      activeCanvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activeCanvasPointers.size >= 2) {
        const pts = [...activeCanvasPointers.values()];
        const curDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (prevPinchDist !== null) {
          const delta = prevPinchDist - curDist;
          this.camOrbit.dist = Math.max(3.4, Math.min(14.5, this.camOrbit.dist + delta * 0.025));
        }
        prevPinchDist = curDist;
        return;
      }

      if (!this.camOrbit.dragging || e.pointerId !== this.camOrbit.pointerId) return;
      const dx = e.clientX - this.camOrbit.lastX;
      const dy = e.clientY - this.camOrbit.lastY;
      this.camOrbit.lastX = e.clientX;
      this.camOrbit.lastY = e.clientY;
      movedDist += Math.hypot(dx, dy);
      this.camOrbit.yaw -= dx * 0.0056;
      this.camOrbit.pitch = Math.max(0.12, Math.min(1.02, this.camOrbit.pitch + dy * 0.0044));
    });

    const endCanvasPointer = (e) => {
      if (!activeCanvasPointers.has(e.pointerId)) return;
      activeCanvasPointers.delete(e.pointerId);
      if (activeCanvasPointers.size < 2) prevPinchDist = null;

      if (e.pointerId === this.camOrbit.pointerId) {
        this.camOrbit.dragging = false;
        this.camOrbit.pointerId = null;
        if (this.mode === 'explore' && movedDist < 10 && e.target === this.canvas && e.type === 'pointerup') {
          this._handleGroundClick(downX, downY);
        }
      }
    };

    window.addEventListener('pointerup', endCanvasPointer);
    window.addEventListener('pointercancel', endCanvasPointer);

    this.canvas.addEventListener('wheel', (e) => {
      if (this.mode !== 'explore') return;
      this.camOrbit.dist = Math.max(3.4, Math.min(14.5, this.camOrbit.dist + e.deltaY * 0.006));
    }, { passive: true });
  }

  _handleGroundClick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);

    const pavMeshes = this.pavilions.map((p) => p.group);
    const hitPav = ray.intersectObjects(pavMeshes, true);
    if (hitPav.length > 0) {
      const p = hitPav[0].point;
      this.localState.walkTarget = { x: p.x, z: p.z };
      this.localState.sitting = false;
      this.walkMarker.position.set(p.x, 0.05, p.z);
      this.walkMarker.visible = true;
      this.vfx.spawnShockwave(p.x, 0.02, p.z, 0xffd166, 2.2);
      return;
    }

    const hits = ray.intersectObject(this.groundMesh, false);
    if (hits.length > 0) {
      const p = hits[0].point;
      if (Math.hypot(p.x, p.z) < 22.3) {
        this.localState.walkTarget = { x: p.x, z: p.z };
        this.localState.sitting = false;
        this.walkMarker.position.set(p.x, 0.05, p.z);
        this.walkMarker.visible = true;
        this.vfx.spawnShockwave(p.x, 0.02, p.z, 0xffd166, 2.2);
      }
    }
  }

  setJoystick(x, y) {
    this.joyVec.x = x;
    this.joyVec.y = y;
  }

  mobileJump() {
    if (this.mode === 'explore') {
      this.localState.jumpBuffer = 0.14;
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.menuGroup.visible = mode === 'menu';
    for (const entry of this.players.values()) {
      entry.actor.root.visible = mode === 'explore';
    }
    if (mode === 'explore') {
      const s = this.localState;
      this.camLookSpring.snap(s.x, s.y + 1.35, s.z);
      this.camPosSpring.snap(s.x, s.y + 3.6, s.z + 6.6);
    } else {
      this.walkMarker.visible = false;
    }
  }

  // ==================== JOGADORES E REDE ====================

  syncPlayers(playersList, youId) {
    this.youId = youId;
    const activeIds = new Set(playersList.map((p) => p.id));

    for (const [id, entry] of this.players.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.actor.root);
        this.players.delete(id);
      }
    }

    for (const p of playersList) {
      let entry = this.players.get(p.id);
      if (!entry || entry.data.character !== p.character) {
        if (entry) this.scene.remove(entry.actor.root);
        const actor = createCharacterActor(p.character);
        actor.onFootstep = (fx, fz) => this.vfx.spawnDust(fx, actor.root.position.y, fz, 2, 0.85);
        actor.onLand = (fx, fz) => {
          this.vfx.spawnDust(fx, actor.root.position.y, fz, 6, 1.15);
          this.vfx.spawnShockwave(fx, actor.root.position.y, fz, 0xffffff, 2.0);
        };

        const badge = createNameBadgeSprite(
          p.name,
          p.character === 'maria' ? '#ff477e' : '#2eb5ff'
        );
        badge.position.set(0, 0.24, 0);
        actor.anchors.headTop.add(badge);
        actor.root.position.set(p.x || 0, p.y || 0, p.z || 3.6);
        actor.root.visible = this.mode === 'explore';
        this.scene.add(actor.root);

        entry = {
          data: p,
          actor,
          badge,
          bubble: null,
          bubbleUntil: 0,
          targetPos: new THREE.Vector3(p.x || 0, p.y || 0, p.z || 3.6),
          targetRot: p.rotY || 0,
          remoteSpeed: 0,
          remoteJumping: false,
          remoteSitting: !!p.sitting,
          remoteAnim: 'idle',
        };
        this.players.set(p.id, entry);

        if (p.id === youId) {
          this.localState.x = p.x || 0;
          this.localState.z = p.z || 3.6;
          this.localState.rotY = p.rotY ?? Math.PI;
          this.camLookSpring.snap(this.localState.x, 1.35, this.localState.z);
        }
      } else {
        entry.data = p;
      }
    }
  }

  applyRemotePose(pose) {
    if (pose.id === this.youId) return;
    const entry = this.players.get(pose.id);
    if (!entry) return;
    entry.targetPos.set(pose.x, pose.y || 0, pose.z);
    entry.targetRot = pose.rotY || 0;
    entry.remoteSpeed = pose.speed || 0;
    entry.remoteJumping = !!pose.jumping;
    entry.remoteSitting = !!pose.sitting;
    entry.remoteAnim = pose.anim || 'idle';
  }

  showChatBubble(playerId, text) {
    const entry = this.players.get(playerId);
    if (!entry) return;
    if (entry.bubble) entry.actor.anchors.headTop.remove(entry.bubble);
    const sprite = createChatBubbleSprite(text);
    sprite.position.set(0, 0.8, 0);
    entry.actor.anchors.headTop.add(sprite);
    entry.bubble = sprite;
    entry.bubbleUntil = performance.now() + 5500;
  }

  triggerPlayerEmote(playerId, emoteKey, svgMarkup) {
    const entry = this.players.get(playerId);
    if (!entry) return;
    if (emoteKey === '👋' || emoteKey === 'wave') entry.waveUntil = performance.now() + 2400;
    else if (emoteKey === '🔥' || emoteKey === 'dance') entry.danceUntil = performance.now() + 3000;

    this.vfx.spawnSparks(
      entry.actor.root.position.x,
      entry.actor.root.position.y + 1.5,
      entry.actor.root.position.z,
      emoteKey === '💖' || emoteKey === '😘' || emoteKey === 'love' ? 0xff477e : 0xffd166,
      9
    );

    const worldPos = new THREE.Vector3();
    entry.actor.anchors.headTop.getWorldPosition(worldPos);
    const projected = worldPos.project(this.camera);
    if (projected.z < 1) {
      const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-projected.y * 0.5 + 0.5) * window.innerHeight;
      const el = document.createElement('div');
      el.className = 'floating-heart-fx';
      if (svgMarkup) el.innerHTML = svgMarkup;
      else el.textContent = emoteKey;
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2100);
    }
  }

  triggerNearInteraction() {
    if (!this._nearTarget) return;
    if (this._nearTarget.kind === 'bench') {
      this.localState.sitting = !this.localState.sitting;
      if (this.localState.sitting) {
        this.localState.x = this.benchPos.x - 0.35;
        this.localState.z = this.benchPos.z + 0.38;
        this.localState.y = 0.08;
        this.localState.vx = 0;
        this.localState.vz = 0;
        this.localState.rotY = 0.55;
        this.localState.walkTarget = null;
      } else {
        this.localState.z = this.benchPos.z + 0.85;
      }
      audio.play('click');
    } else if (this._nearTarget.kind === 'game') {
      audio.play('click');
      this.callbacks.onInteract?.(this._nearTarget.gameId);
    }
  }

  // ==================== LOOP 60 FPS ====================

  update(dt, elapsed) {
    if (this.waterBump) {
      this.waterBump.offset.x = elapsed * 0.022;
      this.waterBump.offset.y = elapsed * 0.016;
    }
    if (this.foamMesh) {
      const s = 1 + Math.sin(elapsed * 1.8) * 0.015;
      this.foamMesh.scale.set(s, s, 1);
    }
    if (this.particles) {
      this.particles.rotation.y = elapsed * 0.035;
      this.particles.position.y = Math.sin(elapsed * 1.1) * 0.12;
    }
    this.animatedProps.forEach((fn) => fn(elapsed));
    this.vfx.update(dt);

    for (let i = 0; i < this.pavilions.length; i++) {
      const p = this.pavilions[i];
      p.emblem.rotation.y = elapsed * 1.05 + i;
      p.emblem.position.y = 1.32 + Math.sin(elapsed * 2.2 + i) * 0.085;
    }

    if (this.mode === 'menu') {
      const mariaAnim = this.menuFocus === 'maria' ? 'wave' : 'idle';
      const mauricioAnim = this.menuFocus === 'mauricio' ? 'wave' : 'idle';
      this.menuMaria.update(dt, { anim: mariaAnim });
      this.menuMauricio.update(dt, { anim: mauricioAnim });

      const gz = this.gazeboPos;
      const isPortrait = window.innerWidth <= 860 && window.innerHeight > window.innerWidth;

      let targetLook;
      let desiredCam;
      if (isPortrait) {
        // No celular vertical, o card do menu fica embaixo -> enquadra Maria & Mauricio na janela superior!
        const cx = this.menuFocus === 'maria' ? gz.x - 0.5 : (this.menuFocus === 'mauricio' ? gz.x + 0.5 : gz.x);
        targetLook = new THREE.Vector3(cx, 0.28, gz.z + 0.15);
        desiredCam = new THREE.Vector3(cx + Math.sin(elapsed * 0.35) * 0.16, 1.62, gz.z + 5.35);
      } else {
        targetLook = new THREE.Vector3(gz.x - 1.05, 1.18, gz.z + 0.1);
        desiredCam = new THREE.Vector3(gz.x - 1.05 + Math.sin(elapsed * 0.35) * 0.22, 1.56, gz.z + 4.75);

        if (this.menuFocus === 'maria') {
          targetLook.set(gz.x - 1.32, 1.2, gz.z + 0.15);
          desiredCam.set(gz.x - 1.32 + Math.sin(elapsed * 0.4) * 0.18, 1.52, gz.z + 4.2);
        } else if (this.menuFocus === 'mauricio') {
          targetLook.set(gz.x - 0.85, 1.22, gz.z + 0.15);
          desiredCam.set(gz.x - 0.85 + Math.sin(elapsed * 0.4) * 0.18, 1.54, gz.z + 4.5);
        }
      }

      if (!this._menuCamInited) {
        this._menuCamInited = true;
        this.camera.position.copy(desiredCam);
        this._menuLook = targetLook.clone();
      }
      this.camera.position.lerp(desiredCam, 1 - Math.exp(-4.2 * dt));
      this._menuLook.lerp(targetLook, 1 - Math.exp(-4.8 * dt));
      this.camera.lookAt(this._menuLook);
      return;
    }

    this._stepLocalPlayer(dt);
    this._stepWorldPhysicsBodies(dt);
    this._updateAllActors(dt);
    this._checkProximity(elapsed);
    this._updateExploreCamera(dt);
  }

  _stepWorldPhysicsBodies(dt) {
    const remoteActors = [];
    for (const [id, entry] of this.players.entries()) {
      if (id !== this.youId) {
        remoteActors.push({
          x: entry.actor.root.position.x,
          y: entry.actor.root.position.y,
          z: entry.actor.root.position.z,
          speed: entry.remoteSpeed || 0,
        });
      }
    }
    this.physics.stepDynamicBodies(dt, remoteActors);
  }

  _stepLocalPlayer(dt) {
    const s = this.localState;

    if (this.keys.has('q')) this.camOrbit.yaw += 1.9 * dt;
    if (this.keys.has('r')) this.camOrbit.yaw -= 1.9 * dt;

    let ix = this.joyVec.x;
    let iz = this.joyVec.y;
    if (this.keys.has('w') || this.keys.has('arrowup')) iz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) iz += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) ix -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) ix += 1;

    let desiredVx = 0;
    let desiredVz = 0;

    const mag = Math.hypot(ix, iz);
    if (mag > 0.08) {
      s.walkTarget = null;
      this.walkMarker.visible = false;
      s.sitting = false;

      const nx = ix / Math.max(1, mag);
      const nz = iz / Math.max(1, mag);
      const running = this.keys.has('shift') || mag > 0.88;
      const topSpeed = (running ? 6.8 : 4.0) * Math.min(1, mag);

      const sin = Math.sin(this.camOrbit.yaw);
      const cos = Math.cos(this.camOrbit.yaw);
      desiredVx = (nx * cos + nz * sin) * topSpeed;
      desiredVz = (-nx * sin + nz * cos) * topSpeed;
    } else if (s.walkTarget) {
      const dx = s.walkTarget.x - s.x;
      const dz = s.walkTarget.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) {
        s.walkTarget = null;
        this.walkMarker.visible = false;
      } else {
        const spd = Math.min(4.2, d * 3.8 + 1.1);
        desiredVx = (dx / d) * spd;
        desiredVz = (dz / d) * spd;
      }
    }

    const accelRate = Math.hypot(desiredVx, desiredVz) > 0.1 ? 14.0 : 12.0;
    const grip = 1 - Math.exp(-accelRate * dt);
    s.vx += (desiredVx - s.vx) * grip;
    s.vz += (desiredVz - s.vz) * grip;

    // Coyote time + Jump buffer antes do passo físico
    if (!s.jumping) s.coyoteTimer = 0.12;
    else s.coyoteTimer = Math.max(0, s.coyoteTimer - dt);

    if (s.jumpBuffer > 0) {
      s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
      if (s.coyoteTimer > 0) {
        s.jumping = true;
        s.coyoteTimer = 0;
        s.jumpBuffer = 0;
        s.sitting = false;
        s.vy = 6.7;
        this.vfx.spawnDust(s.x, s.y, s.z, 5, 1.0);
        audio.play('jump');
      }
    }

    // Coleta cápsulas sólidas de todos os outros personagens presentes na Ilha!
    const otherCapsules = [];
    if (!s.sitting) {
      for (const [id, entry] of this.players.entries()) {
        if (id !== this.youId) {
          otherCapsules.push({
            x: entry.actor.root.position.x,
            y: entry.actor.root.position.y,
            z: entry.actor.root.position.z,
            radius: 0.38,
            height: 1.68,
          });
        }
      }
      s.justLanded = false;
      this.physics.stepPlayer(s, dt, otherCapsules);
      if (s.justLanded) {
        audio.play('step');
      }
    } else {
      s.vx = 0;
      s.vz = 0;
      s.speed = 0;
    }

    // Gira suavemente o personagem na direção do deslocamento real
    if (s.speed > 0.16 && !s.sitting) {
      const targetRot = Math.atan2(s.vx, s.vz);
      let dAngle = targetRot - s.rotY;
      while (dAngle > Math.PI) dAngle -= Math.PI * 2;
      while (dAngle < -Math.PI) dAngle += Math.PI * 2;
      s.rotY += dAngle * (1 - Math.exp(-14 * dt));
    }

    if (s.speed > 0.6 && !s.jumping) {
      this._stepSoundAccum += dt * (s.speed > 5 ? 1.55 : 1);
      if (this._stepSoundAccum > 0.36) {
        this._stepSoundAccum = 0;
        audio.play('step');
      }
    }

    this._poseSendAccum += dt;
    if (this._poseSendAccum >= 0.05) {
      this._poseSendAccum = 0;
      const myEntry = this.players.get(this.youId);
      const now = performance.now();
      let anim = 'idle';
      if (s.sitting) anim = 'sit';
      else if (myEntry?.danceUntil > now) anim = 'dance';
      else if (myEntry?.waveUntil > now) anim = 'wave';
      else if (s.speed > 4.6) anim = 'run';
      else if (s.speed > 0.18) anim = 'walk';

      this.callbacks.onMovePose?.({
        x: s.x,
        y: s.y,
        z: s.z,
        rotY: s.rotY,
        speed: s.speed,
        jumping: s.jumping,
        sitting: s.sitting,
        anim,
      });
    }
  }

  _updateAllActors(dt) {
    const now = performance.now();
    const entries = [...this.players.entries()];

    for (const [id, entry] of entries) {
      if (entry.bubble && now > entry.bubbleUntil) {
        entry.actor.anchors.headTop.remove(entry.bubble);
        entry.bubble = null;
      }

      let lookYaw;
      const partner = entries.find(([oid]) => oid !== id)?.[1];
      if (partner) {
        const dx = partner.actor.root.position.x - entry.actor.root.position.x;
        const dz = partner.actor.root.position.z - entry.actor.root.position.z;
        if (Math.hypot(dx, dz) < 4.5) {
          let rel = Math.atan2(dx, dz) - entry.actor.root.rotation.y;
          while (rel > Math.PI) rel -= Math.PI * 2;
          while (rel < -Math.PI) rel += Math.PI * 2;
          if (Math.abs(rel) < 1.2) lookYaw = rel * 0.55;
        }
      }

      if (id === this.youId) {
        const s = this.localState;
        entry.actor.root.position.set(s.x, s.y, s.z);
        entry.actor.root.rotation.y = s.rotY;
        let anim = 'idle';
        if (s.sitting) anim = 'sit';
        else if (entry.danceUntil > now) anim = 'dance';
        else if (entry.waveUntil > now) anim = 'wave';
        else if (s.speed > 4.6) anim = 'run';
        else if (s.speed > 0.18) anim = 'walk';

        entry.actor.update(dt, {
          speed: s.speed,
          jumping: s.jumping,
          vy: s.vy,
          lookYaw,
          anim,
        });
      } else {
        const prevY = entry.actor.root.position.y;
        entry.actor.root.position.lerp(entry.targetPos, 1 - Math.exp(-12 * dt));
        const estVy = (entry.actor.root.position.y - prevY) / Math.max(0.001, dt);

        let da = entry.targetRot - entry.actor.root.rotation.y;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        entry.actor.root.rotation.y += da * (1 - Math.exp(-12 * dt));

        let anim = entry.remoteAnim || 'idle';
        if (entry.remoteSitting) anim = 'sit';
        else if (entry.danceUntil > now) anim = 'dance';
        else if (entry.waveUntil > now) anim = 'wave';

        entry.actor.update(dt, {
          speed: entry.remoteSpeed,
          jumping: entry.remoteJumping,
          vy: estVy,
          lookYaw,
          anim,
        });
      }
    }
  }

  _checkProximity(elapsed) {
    const s = this.localState;
    let nearest = null;
    let bestDist = 3.45;

    for (const p of this.pavilions) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      const active = d < 3.45;
      p.ringMat.opacity = active ? 0.92 + Math.sin(elapsed * 7) * 0.08 : 0.58;
      if (d < bestDist) {
        bestDist = d;
        nearest = {
          kind: 'game',
          gameId: p.mg.id,
          iconId: p.mg.id,
          title: p.mg.name,
          desc: p.mg.desc,
          btnLabel: 'Jogar (E)',
        };
      }
    }

    const dBench = Math.hypot(s.x - this.benchPos.x, s.z - this.benchPos.z);
    if (!nearest && dBench < 2.6) {
      nearest = {
        kind: 'bench',
        iconId: 'sintonia',
        title: 'Banco sob a Cerejeira',
        desc: s.sitting ? 'Admirando o pôr do sol juntinhos' : 'Sentar juntos sob as pétalas de Sakura',
        btnLabel: s.sitting ? 'Levantar (E)' : 'Sentar (E)',
      };
    }

    const prevKey = this._nearTarget ? `${this._nearTarget.kind}:${this._nearTarget.gameId || ''}:${s.sitting}` : '';
    const nextKey = nearest ? `${nearest.kind}:${nearest.gameId || ''}:${s.sitting}` : '';
    this._nearTarget = nearest;
    if (prevKey !== nextKey) {
      this.callbacks.onPromptChange?.(nearest);
    }
  }

  _updateExploreCamera(dt) {
    const s = this.localState;
    const o = this.camOrbit;

    const leadX = s.vx * 0.14;
    const leadZ = s.vz * 0.14;
    const focusY = s.y + 1.34;

    this.camLookSpring.target.set(s.x + leadX, focusY, s.z + leadZ);
    const lookPt = this.camLookSpring.step(dt);

    const cx = lookPt.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist;
    const cz = lookPt.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist;
    const cy = Math.max(0.65, lookPt.y + Math.sin(o.pitch) * o.dist);

    this.camPosSpring.target.set(cx, cy, cz);
    const camPt = this.camPosSpring.step(dt);

    this.camera.position.copy(camPt);
    this.camera.lookAt(lookPt);

    const baseFov = window.innerWidth < window.innerHeight ? 58.0 : 48.0;
    const targetFov = s.speed > 5.0 ? baseFov + 4.5 : baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-6 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    adaptCameraForAspect(this.camera, 48, 1.25, 72);
  }
}
