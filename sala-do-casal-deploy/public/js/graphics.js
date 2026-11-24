// Pipeline Gráfico VIBE PLAYSTATION 2 (PS2 GS Framebuffer + Cel-Ink + Bayer Dithering + Radiosity Haze + CRT 480i)
// Combina a nostalgia visual da era de ouro do PS2 (Dragon Quest VIII / Kingdom Hearts / GTA SA / Sly Cooper)
// com animações e câmeras ultra-fluidas!

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ==================== MOLAS FÍSICAS DE 2ª ORDEM (HOOKES + DAMPING) ====================

export class Spring1D {
  constructor(initial = 0, stiffness = 140, damping = 18) {
    this.value = initial;
    this.target = initial;
    this.vel = 0;
    this.k = stiffness;
    this.c = damping;
  }

  impulse(dv) {
    this.vel += dv;
  }

  step(dt) {
    const sub = Math.min(dt, 0.05);
    const force = -this.k * (this.value - this.target) - this.c * this.vel;
    this.vel += force * sub;
    this.value += this.vel * sub;
    return this.value;
  }
}

export class SpringVec3 {
  constructor(x = 0, y = 0, z = 0, stiffness = 95, damping = 18) {
    this.pos = new THREE.Vector3(x, y, z);
    this.target = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.k = stiffness;
    this.c = damping;
    this._f = new THREE.Vector3();
  }

  snap(x, y, z) {
    this.pos.set(x, y, z);
    this.target.set(x, y, z);
    this.vel.set(0, 0, 0);
  }

  step(dt) {
    const sub = Math.min(dt, 0.05);
    this._f.copy(this.pos).sub(this.target).multiplyScalar(-this.k);
    this._f.addScaledVector(this.vel, -this.c);
    this.vel.addScaledVector(this._f, sub);
    this.pos.addScaledVector(this.vel, sub);
    return this.pos;
  }
}

// ==================== SHADER PÓS-PROCESSAMENTO AUTÊNTICO DE PS2 ====================
// - Contorno de nanquim suave (Sobel Edge Ink)
// - Ordered Bayer Dithering 4x4 + quantização suave estilo Graphic Synthesizer (GS) do PS2
// - Curva nostálgica quente (sombras índigo-violeta + altas-luzes âmbar douradas)
// - Modo TV de Tubo 480i opcional (scanlines sutis + vinheta + leve aberração nas bordas)

const PS2PostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1280, 800) },
    uCrtAmount: { value: 0.0 }, // 0.0 = PS2 Suave e Limpo (Padrão) | 1.0 = Toque leve de TV Retrô
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uCrtAmount;
    uniform float uTime;
    varying vec2 vUv;

    float bayer4x4(vec2 px) {
      int x = int(mod(px.x, 4.0));
      int y = int(mod(px.y, 4.0));
      int idx = y * 4 + x;
      if (idx == 0) return 0.0/16.0;
      if (idx == 1) return 8.0/16.0;
      if (idx == 2) return 2.0/16.0;
      if (idx == 3) return 10.0/16.0;
      if (idx == 4) return 12.0/16.0;
      if (idx == 5) return 4.0/16.0;
      if (idx == 6) return 14.0/16.0;
      if (idx == 7) return 6.0/16.0;
      if (idx == 8) return 3.0/16.0;
      if (idx == 9) return 11.0/16.0;
      if (idx == 10) return 1.0/16.0;
      if (idx == 11) return 9.0/16.0;
      if (idx == 12) return 15.0/16.0;
      if (idx == 13) return 7.0/16.0;
      if (idx == 14) return 13.0/16.0;
      return 5.0/16.0;
    }

    float luma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float r2 = dot(centered, centered);

      vec2 texel = 1.0 / uResolution;
      float chromaShift = r2 * 0.0012 * uCrtAmount;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + vec2(chromaShift, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - vec2(chromaShift, 0.0)).b;

      // Contorno super suave apenas em silhuetas fortes (sem riscar o rosto nem o chão!)
      float tl = luma(texture2D(tDiffuse, uv + vec2(-texel.x,  texel.y)).rgb);
      float tc = luma(texture2D(tDiffuse, uv + vec2( 0.0,      texel.y)).rgb);
      float tr = luma(texture2D(tDiffuse, uv + vec2( texel.x,  texel.y)).rgb);
      float ml = luma(texture2D(tDiffuse, uv + vec2(-texel.x,  0.0)).rgb);
      float mr = luma(texture2D(tDiffuse, uv + vec2( texel.x,  0.0)).rgb);
      float bl = luma(texture2D(tDiffuse, uv + vec2(-texel.x, -texel.y)).rgb);
      float bc = luma(texture2D(tDiffuse, uv + vec2( 0.0,     -texel.y)).rgb);
      float br = luma(texture2D(tDiffuse, uv + vec2( texel.x, -texel.y)).rgb);

      float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
      float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
      float edge = sqrt(gx * gx + gy * gy);
      float ink = smoothstep(0.46, 0.88, edge) * 0.18;
      col = mix(col, vec3(0.10, 0.06, 0.18), ink);

      // Color grading nostálgico delicado (quente e aconchegante)
      float lum = luma(col);
      col = mix(vec3(lum), col, 1.08);
      col += vec3(0.015, 0.005, -0.008) * smoothstep(0.5, 1.0, lum);
      col += vec3(0.006, -0.002, 0.014) * (1.0 - smoothstep(0.0, 0.45, lum));

      // Dither quase imperceptível (apenas dá textura aveludada ao céu sem granulado!)
      float dither = (bayer4x4(floor(uv * uResolution)) - 0.5) / mix(120.0, 64.0, uCrtAmount);
      float levels = mix(110.0, 64.0, uCrtAmount);
      col = floor((col + dither) * levels + 0.5) / levels;

      // Scanlines bem levinhas apenas se o usuário ativar o modo TV Retrô!
      if (uCrtAmount > 0.5) {
        float scan = sin(uv.y * 520.0 * 3.14159265) * 0.5 + 0.5;
        col *= mix(0.968, 1.012, scan);
      }

      float vig = 1.0 - r2 * mix(0.14, 0.28, uCrtAmount);
      col *= clamp(vig, 0.0, 1.0);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

// ==================== PIPELINE DE RENDERIZAÇÃO PS2 ====================

let sharedEnvTexture = null;

export function getSharedEnvironment(renderer) {
  if (sharedEnvTexture) return sharedEnvTexture;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new RoomEnvironment();
  sharedEnvTexture = pmrem.fromScene(envScene, 0.05).texture;
  envScene.dispose?.();
  pmrem.dispose();
  return sharedEnvTexture;
}

export function applyAAAEnvironment(scene, renderer, intensity = 0.35) {
  scene.environment = getSharedEnvironment(renderer);
  if ('environmentIntensity' in scene) {
    scene.environmentIntensity = intensity;
  }
}

export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  return (
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
    window.matchMedia?.('(pointer: coarse)')?.matches ||
    window.innerWidth <= 900
  );
}

/**
 * Ajusta aspect e FOV vertical automaticamente quando o celular está em modo Retrato (vertical),
 * garantindo que mesas, tabuleiros, quadras e palcos largos nunca sejam cortados nas laterais!
 */
export function adaptCameraForAspect(camera, baseFov = 45, refAspect = 1.32, maxFov = 76) {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const aspect = w / h;
  camera.aspect = aspect;

  if (aspect < refAspect) {
    const baseRad = THREE.MathUtils.degToRad(baseFov);
    const scale = Math.pow(refAspect / Math.max(0.42, aspect), 0.78);
    const newFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(baseRad * 0.5) * scale));
    camera.fov = Math.min(maxFov, newFov);
  } else {
    camera.fov = baseFov;
  }
  camera.updateProjectionMatrix();
  return aspect;
}

export function createAAAPipeline(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isMobileDevice(),
    powerPreference: 'high-performance',
  });

  let crtMode = false; // Inicia no modo PS2/Anime Suave & Nítido!
  const calcRatio = () => {
    const cap = isMobileDevice() ? 1.5 : 2.0;
    return Math.min(cap, window.devicePixelRatio || 1);
  };

  renderer.setPixelRatio(calcRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  getSharedEnvironment(renderer);

  const rtType = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const rt = new THREE.WebGLRenderTarget(
    Math.floor(window.innerWidth * calcRatio()),
    Math.floor(window.innerHeight * calcRatio()),
    { type: rtType }
  );

  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);

  // Brilho suave e sonhador estilo PS2 sem exagerar
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.22,
    0.55,
    0.94
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const ps2Pass = new ShaderPass(PS2PostShader);
  ps2Pass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  ps2Pass.uniforms.uCrtAmount.value = 0.0;
  composer.addPass(ps2Pass);

  let shakeTime = 0;
  let shakePower = 0;
  let totalTime = 0;
  const _savedCamPos = new THREE.Vector3();

  const updateSizes = (w, h) => {
    const ratio = calcRatio();
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
    ps2Pass.uniforms.uResolution.value.set(w, h);
  };

  return {
    renderer,
    composer,
    bloomPass,
    ps2Pass,
    togglePS2Filter() {
      crtMode = !crtMode;
      ps2Pass.uniforms.uCrtAmount.value = crtMode ? 1.0 : 0.0;
      updateSizes(window.innerWidth, window.innerHeight);
      return crtMode;
    },
    triggerShake(power = 0.12, duration = 0.22) {
      shakePower = Math.max(shakePower, power);
      shakeTime = Math.max(shakeTime, duration);
    },
    render(scene, camera, dt = 0.016) {
      totalTime += dt;
      ps2Pass.uniforms.uTime.value = totalTime;
      if (!scene.environment) {
        applyAAAEnvironment(scene, renderer, 0.35);
      }
      renderPass.scene = scene;
      renderPass.camera = camera;

      if (shakeTime > 0) {
        _savedCamPos.copy(camera.position);
        const decay = shakeTime / 0.25;
        camera.position.x += (Math.random() - 0.5) * shakePower * decay;
        camera.position.y += (Math.random() - 0.5) * shakePower * decay;
        composer.render(dt);
        camera.position.copy(_savedCamPos);
        shakeTime = Math.max(0, shakeTime - dt);
        if (shakeTime === 0) shakePower = 0;
      } else {
        composer.render(dt);
      }
    },
    setSize: updateSizes,
  };
}

// ==================== CÉU ESTILIZADO NOSTÁLGICO DE PS2 (TWILIGHT TOWN / VICE / DQ8) ====================

const SKY_VERT = `
  varying vec3 vWorldDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKY_FRAG = `
  uniform vec3 uZenith;
  uniform vec3 uMidSky;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  varying vec3 vWorldDir;

  void main() {
    vec3 dir = normalize(vWorldDir);
    float h = clamp(dir.y, -0.25, 1.0);

    // Gradiente de 3 faixas super nostálgico estilo PS2 (Laranja Âmbar -> Magenta Rosa -> Índigo Profundo)
    vec3 col;
    if (h < 0.0) {
      col = mix(uHorizon, uGround, clamp(-h * 4.0, 0.0, 1.0));
    } else if (h < 0.28) {
      col = mix(uHorizon, uMidSky, smoothstep(0.0, 0.28, h));
    } else {
      col = mix(uMidSky, uZenith, pow((h - 0.28) / 0.72, 0.65));
    }

    // Sol gigante retrô de PS2 com halo em anéis suaves!
    float sunAmt = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(sunAmt, 6.0) * 0.36;
    col += uSunColor * smoothstep(0.9945, 0.9975, sunAmt) * 1.45;
    // Anel de lens-flare retrô sutil ao redor do sol
    float ring = smoothstep(0.978, 0.984, sunAmt) - smoothstep(0.984, 0.990, sunAmt);
    col += uSunColor * ring * 0.28;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createAtmosphericSky({ elevation = 8, azimuth = 145 } = {}) {
  const geo = new THREE.SphereGeometry(260, 28, 20);
  const uniforms = {
    uZenith: { value: new THREE.Color(0x160f3a) },
    uMidSky: { value: new THREE.Color(0x8e3563) },
    uHorizon: { value: new THREE.Color(0xf28444) },
    uGround: { value: new THREE.Color(0x1c1230) },
    uSunColor: { value: new THREE.Color(0xffca63) },
    uSunDir: { value: new THREE.Vector3(0, 0.2, -1) },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(geo, mat);

  const sunDir = new THREE.Vector3();
  const updateSun = (elevDeg, azimDeg) => {
    const phi = THREE.MathUtils.degToRad(90 - elevDeg);
    const theta = THREE.MathUtils.degToRad(azimDeg);
    sunDir.setFromSphericalCoords(1, phi, theta);
    uniforms.uSunDir.value.copy(sunDir);

    if (elevDeg < 0) {
      // Noite PS2 (Kingdom Hearts / Persona 3)
      uniforms.uZenith.value.setHex(0x070820);
      uniforms.uMidSky.value.setHex(0x181f52);
      uniforms.uHorizon.value.setHex(0x373078);
      uniforms.uSunColor.value.setHex(0x90b4ff);
    } else if (elevDeg < 18) {
      // Pôr do Sol Clássico PS2 (Twilight Town / GTA San Andreas Orange-Pink Haze!)
      uniforms.uZenith.value.setHex(0x1b1242);
      uniforms.uMidSky.value.setHex(0x9b3869);
      uniforms.uHorizon.value.setHex(0xf48c46);
      uniforms.uSunColor.value.setHex(0xffd166);
    } else {
      // Manhã Vibrante PS2 (Dragon Quest VIII / Katamari Blue Sky)
      uniforms.uZenith.value.setHex(0x1455b8);
      uniforms.uMidSky.value.setHex(0x3c99f0);
      uniforms.uHorizon.value.setHex(0xa8e0ff);
      uniforms.uSunColor.value.setHex(0xfff4b8);
    }
    return sunDir.clone();
  };

  updateSun(elevation, azimuth);
  return { sky, updateSun };
}

// ==================== TEXTURAS HAND-PAINTED 128x128 ESTILO PS2 ====================

const texCache = {};

function makePS2Tex(key, size, drawFn, repeat = 1, srgb = true) {
  const fullKey = `ps2:${key}:${repeat}`;
  if (texCache[fullKey]) return texCache[fullKey];
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  // Filtro bilinear suave em resolução 128x128 dá exatamente o charme das texturas de VRAM do PS2!
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  texCache[fullKey] = tex;
  return tex;
}

export const SurfaceTextures = {
  grass(repeat = 12) {
    return makePS2Tex('grass', 128, (ctx, s) => {
      // Gramado quadriculado sutil + tufos pintados à mão estilo JRPG de PS2!
      ctx.fillStyle = '#3ca55c';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#359853';
      ctx.fillRect(0, 0, s / 2, s / 2);
      ctx.fillRect(s / 2, s / 2, s / 2, s / 2);
      for (let i = 0; i < 160; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        ctx.strokeStyle = i % 2 === 0 ? '#57c472' : '#26783f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + 5);
        ctx.lineTo(x - 2, y);
        ctx.moveTo(x, y + 5);
        ctx.lineTo(x + 2, y - 1);
        ctx.stroke();
      }
    }, repeat);
  },

  stonePlaza(repeat = 6) {
    return makePS2Tex('stonePlaza', 128, (ctx, s) => {
      ctx.fillStyle = '#ebe3d8';
      ctx.fillRect(0, 0, s, s);
      const step = 32;
      for (let y = 0; y < s; y += step) {
        const off = (y / step) % 2 === 0 ? 0 : step / 2;
        for (let x = -step; x < s + step; x += step) {
          ctx.fillStyle = ((x + y) / step) % 2 === 0 ? '#f0e9df' : '#e5dcd0';
          ctx.fillRect(x + off + 1, y + 1, step - 2, step - 2);
          ctx.strokeStyle = 'rgba(165, 150, 136, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + off + 1, y + 1, step - 2, step - 2);
        }
      }
    }, repeat);
  },

  wood(repeat = 3) {
    return makePS2Tex('wood', 128, (ctx, s) => {
      ctx.fillStyle = '#8b4e2b';
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 32) {
        ctx.fillStyle = (y / 32) % 2 === 0 ? '#965632' : '#7d4525';
        ctx.fillRect(0, y, s, 30);
        ctx.fillStyle = '#3d1e0d';
        ctx.fillRect(0, y + 30, s, 2);
      }
      ctx.fillStyle = 'rgba(255, 200, 150, 0.14)';
      for (let i = 0; i < 40; i++) {
        ctx.fillRect(0, Math.random() * s, s, 2);
      }
    }, repeat);
  },

  asphalt(repeat = 14) {
    return makePS2Tex('asphalt', 128, (ctx, s) => {
      ctx.fillStyle = '#323646';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 450; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#3f4458' : '#262936';
        ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3);
      }
    }, repeat);
  },

  waterNormal(repeat = 10) {
    return makePS2Tex('waterBump', 128, (ctx, s) => {
      ctx.fillStyle = '#8080ff';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(210, 230, 255, 0.45)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 28; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        ctx.beginPath();
        ctx.arc(x, y, 8 + Math.random() * 14, 0, Math.PI);
        ctx.stroke();
      }
    }, repeat, false);
  },

  softOrb() {
    if (texCache.softOrb) return texCache.softOrb;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,235,190,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    texCache.softOrb = tex;
    return tex;
  },

  blobShadow() {
    if (texCache.ps2Shadow) return texCache.ps2Shadow;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    // Sombra oval clássica de PS2 sob os pés!
    const g = ctx.createRadialGradient(32, 32, 8, 32, 32, 29);
    g.addColorStop(0, 'rgba(12, 6, 26, 0.68)');
    g.addColorStop(0.7, 'rgba(12, 6, 26, 0.42)');
    g.addColorStop(1, 'rgba(12, 6, 26, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    texCache.ps2Shadow = tex;
    return tex;
  },
};

// ==================== PARTÍCULAS ESTILIZADAS PS2 (GAME JUICE) ====================

export class VFXSystem {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this._puffGeo = new THREE.DodecahedronGeometry(0.13, 0); // Low-poly chunky puff estilo PS2!
    this._sparkGeo = new THREE.OctahedronGeometry(0.08, 0);
  }

  spawnDust(x, y, z, count = 3, scale = 1) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfff3e0,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this._puffGeo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.3,
        y + 0.07 + Math.random() * 0.06,
        z + (Math.random() - 0.5) * 0.3
      );
      mesh.scale.setScalar(0.6 * scale);
      this.scene.add(mesh);
      this.items.push({
        kind: 'dust',
        mesh,
        mat,
        vx: (Math.random() - 0.5) * 0.65,
        vy: 0.5 + Math.random() * 0.55,
        vz: (Math.random() - 0.5) * 0.65,
        age: 0,
        life: 0.42 + Math.random() * 0.16,
        scale,
      });
    }
  }

  spawnSparks(x, y, z, colorHex = 0xfbbf24, count = 14) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 1,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this._sparkGeo, mat);
      mesh.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const spd = 1.7 + Math.random() * 3.8;
      this.scene.add(mesh);
      this.items.push({
        kind: 'spark',
        mesh,
        mat,
        vx: Math.cos(a) * spd,
        vy: 1.5 + Math.random() * 3.2,
        vz: Math.sin(a) * spd,
        age: 0,
        life: 0.52 + Math.random() * 0.28,
      });
    }
  }

  spawnShockwave(x, y, z, colorHex = 0xffd166, maxScale = 3.2) {
    const geo = new THREE.RingGeometry(0.18, 0.32, 18); // Anel facetado 18 lados estilo PS2!
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.035, z);
    this.scene.add(mesh);
    this.items.push({
      kind: 'wave',
      mesh,
      mat,
      age: 0,
      life: 0.4,
      maxScale,
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      const u = it.age / it.life;
      if (u >= 1) {
        this.scene.remove(it.mesh);
        it.mat.dispose();
        if (it.kind === 'wave') it.mesh.geometry.dispose();
        this.items.splice(i, 1);
        continue;
      }

      if (it.kind === 'dust') {
        it.mesh.position.x += it.vx * dt;
        it.mesh.position.y += it.vy * dt;
        it.mesh.position.z += it.vz * dt;
        it.mesh.rotation.x += 3 * dt;
        it.mesh.rotation.z += 3 * dt;
        it.mesh.scale.setScalar(it.scale * (0.6 + u * 1.3));
        it.mat.opacity = 0.6 * (1 - u);
      } else if (it.kind === 'spark') {
        it.vy -= 9.8 * dt;
        it.mesh.position.x += it.vx * dt;
        it.mesh.position.y += it.vy * dt;
        it.mesh.position.z += it.vz * dt;
        it.mesh.rotation.x += 10 * dt;
        it.mesh.rotation.y += 10 * dt;
        it.mesh.scale.setScalar(1 - u * 0.65);
        it.mat.opacity = 1 - u;
      } else if (it.kind === 'wave') {
        it.mesh.scale.setScalar(1 + u * it.maxScale);
        it.mat.opacity = 0.92 * (1 - u);
      }
    }
  }
}
