// Motor de Física 3D & Colisão Sólida (Ilha do Casal — Anime Edition)
// - Cápsulas sólidas para Maria e Mauricio (personagens nunca atravessam um ao outro nem objetos!)
// - Colisores estáticos 3D (Cilindros e OBBs orientados com altura topY real -> permite subir/pular em bancos, pedras, caixas e palco!)
// - Superfícies de altura contínua (Ponte arqueada com guarda-corpo sólido, Gazebo, Pavilhões)
// - Corpos Rígidos Dinâmicos 3D (Bolas chutáveis com rotação física real, gravidade, quique e Caixas/Barris empurráveis!)

import * as THREE from 'three';

const _v3 = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _dq = new THREE.Quaternion();

export class PhysicsWorld3D {
  constructor() {
    this.staticCylinders = []; // { x, z, r, bottomY, topY, climbable, tag }
    this.staticBoxes = [];     // { x, z, hx, hz, cos, sin, bottomY, topY, climbable, tag }
    this.surfaces = [];        // Array<(x, z) => number | null>
    this.pondBarriers = [];    // { cx, cz, r, bridgeHalfW }
    this.dynamicBodies = [];   // Bolas de praia/futebol, caixas de madeira, barris
    this.islandRadius = 22.6;
    this.gravity = 18.0;
  }

  clear() {
    this.staticCylinders.length = 0;
    this.staticBoxes.length = 0;
    this.surfaces.length = 0;
    this.pondBarriers.length = 0;
    this.dynamicBodies.length = 0;
  }

  setIslandBoundary(radius) {
    this.islandRadius = radius;
  }

  addSurface(heightFn) {
    this.surfaces.push(heightFn);
  }

  addPondBarrier(cx, cz, radius, bridgeHalfW = 1.15) {
    this.pondBarriers.push({ cx, cz, r: radius, bridgeHalfW });
  }

  addCylinder(x, z, radius, bottomY = 0, topY = 3.0, { climbable = false, tag = 'prop' } = {}) {
    this.staticCylinders.push({ x, z, r: radius, bottomY, topY, climbable, tag });
  }

  addBox(x, z, halfW, halfD, rotY = 0, bottomY = 0, topY = 2.0, { climbable = false, tag = 'box' } = {}) {
    this.staticBoxes.push({
      x,
      z,
      hx: halfW,
      hz: halfD,
      cos: Math.cos(rotY),
      sin: Math.sin(rotY),
      bottomY,
      topY,
      climbable,
      tag,
    });
  }

  addDynamicBody({
    id,
    mesh,
    kind = 'sphere', // 'sphere' | 'cylinder'
    x = 0,
    y = 0,
    z = 0,
    radius = 0.36,
    height = 0.72,
    mass = 1.0,
    restitution = 0.72,
    friction = 1.8,
    climbable = false,
    onKick = null,
  }) {
    const body = {
      id,
      mesh,
      kind,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      radius,
      height: kind === 'sphere' ? radius * 2 : height,
      mass: Math.max(0.1, mass),
      restitution,
      friction,
      climbable,
      onKick,
      grounded: false,
      lastKickAt: 0,
    };
    if (mesh) {
      mesh.position.set(x, kind === 'sphere' ? y + radius : y, z);
    }
    this.dynamicBodies.push(body);
    return body;
  }

  // Calcula a altura sólida de apoio sob um círculo (x, z, r) dada a altura atual dos pés (curY)
  getSupportHeight(x, z, r = 0.34, curY = 0, stepTolerance = 0.3) {
    let bestY = 0;

    for (let i = 0; i < this.surfaces.length; i++) {
      const h = this.surfaces[i](x, z);
      if (h !== null && h !== undefined && h > bestY && h <= curY + stepTolerance + 0.35) {
        bestY = h;
      }
    }

    const maxAllowedTop = curY + stepTolerance;

    for (let i = 0; i < this.staticCylinders.length; i++) {
      const c = this.staticCylinders[i];
      if (!c.climbable || c.topY <= bestY || c.topY > maxAllowedTop) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz <= (c.r + r * 0.55) * (c.r + r * 0.55)) {
        bestY = c.topY;
      }
    }

    for (let i = 0; i < this.staticBoxes.length; i++) {
      const b = this.staticBoxes[i];
      if (!b.climbable || b.topY <= bestY || b.topY > maxAllowedTop) continue;
      const dx = x - b.x;
      const dz = z - b.z;
      const lx = dx * b.cos - dz * b.sin;
      const lz = dx * b.sin + dz * b.cos;
      if (Math.abs(lx) <= b.hx + r * 0.5 && Math.abs(lz) <= b.hz + r * 0.5) {
        bestY = b.topY;
      }
    }

    for (let i = 0; i < this.dynamicBodies.length; i++) {
      const db = this.dynamicBodies[i];
      if (!db.climbable) continue;
      const topY = db.y + db.height;
      if (topY <= bestY || topY > maxAllowedTop) continue;
      const dx = x - db.x;
      const dz = z - db.z;
      if (dx * dx + dz * dz <= (db.radius + r * 0.5) * (db.radius + r * 0.5)) {
        bestY = topY;
      }
    }

    return bestY;
  }

  // Empurra (x, z, vx, vz) para fora de todos os colisores estáticos que interceptam [footY, headY]
  _resolveStaticHorizontal(entity, r, footY, headY, bounce = 0.0) {
    // 1. Limite circular da ilha
    const maxR = this.islandRadius - r;
    const distOrigin = Math.hypot(entity.x, entity.z);
    if (distOrigin > maxR && distOrigin > 0.001) {
      const nx = -entity.x / distOrigin;
      const nz = -entity.z / distOrigin;
      entity.x = -nx * maxR;
      entity.z = -nz * maxR;
      const vn = entity.vx * nx + entity.vz * nz;
      if (vn < 0) {
        entity.vx -= (1 + bounce) * vn * nx;
        entity.vz -= (1 + bounce) * vn * nz;
      }
    }

    // 2. Mureta sólida do espelho d'água central (exceto quando alinhado na ponte!)
    for (let i = 0; i < this.pondBarriers.length; i++) {
      const pb = this.pondBarriers[i];
      const dx = entity.x - pb.cx;
      const dz = entity.z - pb.cz;
      const onBridgeCorridor = Math.abs(dx) < pb.bridgeHalfW;
      if (!onBridgeCorridor && footY < 0.32) {
        const d = Math.hypot(dx, dz);
        const minR = pb.r + r;
        if (d < minR && d > 0.001) {
          const nx = dx / d;
          const nz = dz / d;
          entity.x = pb.cx + nx * minR;
          entity.z = pb.cz + nz * minR;
          const vn = entity.vx * nx + entity.vz * nz;
          if (vn < 0) {
            entity.vx -= (1 + bounce) * vn * nx;
            entity.vz -= (1 + bounce) * vn * nz;
          }
        }
      }
    }

    // 3. Cilindros sólidos (troncos, postes, fontes, pedestais, mesas)
    for (let i = 0; i < this.staticCylinders.length; i++) {
      const c = this.staticCylinders[i];
      if (headY <= c.bottomY + 0.04 || footY >= c.topY - 0.06) continue;
      const dx = entity.x - c.x;
      const dz = entity.z - c.z;
      const minD = c.r + r;
      const dSq = dx * dx + dz * dz;
      if (dSq < minD * minD) {
        const d = Math.sqrt(dSq) || 0.0001;
        const nx = dx / d;
        const nz = dz / d;
        entity.x = c.x + nx * minD;
        entity.z = c.z + nz * minD;
        const vn = entity.vx * nx + entity.vz * nz;
        if (vn < 0) {
          entity.vx -= (1 + bounce) * vn * nx;
          entity.vz -= (1 + bounce) * vn * nz;
        }
      }
    }

    // 4. Caixas orientadas 3D (OBBs: bancos, cercas, guarda-corpos da ponte, barracas, fliperamas)
    for (let i = 0; i < this.staticBoxes.length; i++) {
      const b = this.staticBoxes[i];
      if (headY <= b.bottomY + 0.04 || footY >= b.topY - 0.06) continue;

      const dx = entity.x - b.x;
      const dz = entity.z - b.z;
      // Converte para espaço local da caixa (rotY)
      const lx = dx * b.cos - dz * b.sin;
      const lz = dx * b.sin + dz * b.cos;

      const cx = Math.max(-b.hx, Math.min(b.hx, lx));
      const cz = Math.max(-b.hz, Math.min(b.hz, lz));
      let ex = lx - cx;
      let ez = lz - cz;
      const distSq = ex * ex + ez * ez;

      if (distSq < r * r) {
        let lnx = 0;
        let lnz = 0;
        let pen = 0;

        if (distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          lnx = ex / dist;
          lnz = ez / dist;
          pen = r - dist;
        } else {
          // Centro dentro da caixa -> empurra pela face mais próxima
          const px = b.hx - Math.abs(lx);
          const pz = b.hz - Math.abs(lz);
          if (px < pz) {
            lnx = lx >= 0 ? 1 : -1;
            pen = px + r;
          } else {
            lnz = lz >= 0 ? 1 : -1;
            pen = pz + r;
          }
        }

        // Volta normal para espaço mundo
        const nx = lnx * b.cos + lnz * b.sin;
        const nz = -lnx * b.sin + lnz * b.cos;
        entity.x += nx * pen;
        entity.z += nz * pen;

        const vn = entity.vx * nx + entity.vz * nz;
        if (vn < 0) {
          entity.vx -= (1 + bounce) * vn * nx;
          entity.vz -= (1 + bounce) * vn * nz;
        }
      }
    }
  }

  // Passo físico completo do jogador local contra cenário, altura, outros jogadores e objetos dinâmicos!
  stepPlayer(state, dt, otherCapsules = []) {
    const r = 0.37;
    const h = 1.68;
    const stepUp = 0.44;

    const prevY = state.y;
    state.x += state.vx * dt;
    state.z += state.vz * dt;

    // 2 sub-iterações garantem deslizamento suave mesmo em cantos entre 2 objetos!
    for (let iter = 0; iter < 2; iter++) {
      this._resolveStaticHorizontal(state, r, state.y + stepUp, state.y + h, 0.0);

      // Colisão sólida Cápsula-vs-Cápsula contra outros personagens (Maria <-> Mauricio)!
      for (let i = 0; i < otherCapsules.length; i++) {
        const o = otherCapsules[i];
        const oR = o.radius || 0.37;
        const oH = o.height || 1.68;
        if (state.y + h <= o.y + 0.08 || state.y >= o.y + oH - 0.08) continue;

        const dx = state.x - o.x;
        const dz = state.z - o.z;
        const minD = r + oR;
        const dSq = dx * dx + dz * dz;
        if (dSq < minD * minD) {
          const d = Math.sqrt(dSq) || 0.001;
          const nx = dx / d;
          const nz = dz / d;
          const overlap = minD - d;
          state.x += nx * overlap;
          state.z += nz * overlap;
          const vn = state.vx * nx + state.vz * nz;
          if (vn < 0) {
            state.vx -= vn * nx * 1.12;
            state.vz -= vn * nz * 1.12;
          }
        }
      }

      // Interação física sólida com Corpos Dinâmicos (chutar bolas / empurrar caixas e barris!)
      for (let i = 0; i < this.dynamicBodies.length; i++) {
        const db = this.dynamicBodies[i];
        const dbTop = db.y + db.height;
        if (state.y + h <= db.y + 0.05 || state.y >= dbTop - 0.14) continue;

        const dx = db.x - state.x;
        const dz = db.z - state.z;
        const minD = r + db.radius;
        const dSq = dx * dx + dz * dz;
        if (dSq < minD * minD) {
          const d = Math.sqrt(dSq) || 0.001;
          const nx = dx / d;
          const nz = dz / d;
          const overlap = minD - d;

          if (db.kind === 'sphere') {
            // Bola leve: recebe impulso de chute proporcional à velocidade do jogador!
            db.x += nx * overlap * 0.92;
            db.z += nz * overlap * 0.92;
            state.x -= nx * overlap * 0.08;
            state.z -= nz * overlap * 0.08;

            const pSpd = Math.hypot(state.vx, state.vz);
            const kickPower = Math.max(3.4, pSpd * 1.48);
            db.vx = nx * kickPower + state.vx * 0.35;
            db.vz = nz * kickPower + state.vz * 0.35;
            if (db.grounded && pSpd > 2.8) {
              db.vy = Math.min(5.2, 1.4 + pSpd * 0.42);
              db.grounded = false;
            }
            const now = performance.now();
            if (now - db.lastKickAt > 180) {
              db.lastKickAt = now;
              db.onKick?.(db, pSpd);
            }
          } else {
            // Caixa / Barril pesado: jogador empurra com atrito e sente resistência sólida!
            const pushRatio = 1 / (1 + db.mass);
            db.x += nx * overlap * pushRatio;
            db.z += nz * overlap * pushRatio;
            state.x -= nx * overlap * (1 - pushRatio);
            state.z -= nz * overlap * (1 - pushRatio);

            const pushVn = state.vx * nx + state.vz * nz;
            if (pushVn > 0) {
              db.vx = nx * pushVn * 0.55;
              db.vz = nz * pushVn * 0.55;
              state.vx -= nx * pushVn * 0.45;
              state.vz -= nz * pushVn * 0.45;
            }
          }
        }
      }
    }

    // Altura de piso/plataforma sob os pés (permite subir degraus suaves, ponte e pousar em cima de bancos/pedras/caixas!)
    const supportTol = state.jumping && state.vy > 0 ? 0.08 : (state.jumping ? Math.max(0.22, prevY - state.y + 0.2) : stepUp);
    const groundY = this.getSupportHeight(state.x, state.z, r, Math.max(prevY, state.y), supportTol);

    if (!state.jumping && state.y > groundY + 0.14) {
      // Caminhou para fora da borda de um banco/caixa/palco -> cai com gravidade real!
      state.jumping = true;
      state.vy = 0;
    }

    if (state.jumping) {
      state.vy -= this.gravity * dt;
      state.y += state.vy * dt;
      if (state.y <= groundY && state.vy <= 0) {
        state.y = groundY;
        state.vy = 0;
        state.jumping = false;
        state.justLanded = true;
      }
    } else {
      // Suaviza subida de degraus (ponte/gazebo) sem teleporte brusco
      state.y += (groundY - state.y) * Math.min(1, 22 * dt);
      state.vy = 0;
    }

    state.groundY = groundY;
    state.speed = Math.hypot(state.vx, state.vz);
  }

  // Atualiza todos os objetos físicos dinâmicos (bolas rolando/quicando, caixas e barris)
  stepDynamicBodies(dt, remoteActors = []) {
    for (let i = 0; i < this.dynamicBodies.length; i++) {
      const b = this.dynamicBodies[i];

      // Chute/empurrão também funciona quando o parceiro(a) remoto ou IA encosta!
      for (let j = 0; j < remoteActors.length; j++) {
        const ra = remoteActors[j];
        const dx = b.x - ra.x;
        const dz = b.z - ra.z;
        const minD = b.radius + 0.38;
        const dSq = dx * dx + dz * dz;
        if (dSq < minD * minD && Math.abs(b.y - ra.y) < 1.5) {
          const d = Math.sqrt(dSq) || 0.001;
          const nx = dx / d;
          const nz = dz / d;
          b.x = ra.x + nx * minD;
          b.z = ra.z + nz * minD;
          if (b.kind === 'sphere') {
            const spd = Math.max(3.0, (ra.speed || 2.5) * 1.3);
            b.vx = nx * spd;
            b.vz = nz * spd;
            if (b.grounded) {
              b.vy = 2.2;
              b.grounded = false;
            }
          }
        }
      }

      b.x += b.vx * dt;
      b.z += b.vz * dt;

      // Colisão contra árvores, muretas, bancos e limites da ilha
      this._resolveStaticHorizontal(b, b.radius, b.y + 0.05, b.y + b.height, b.restitution);

      // Colisão entre objetos dinâmicos entre si
      for (let j = i + 1; j < this.dynamicBodies.length; j++) {
        const o = this.dynamicBodies[j];
        if (b.y + b.height <= o.y || o.y + o.height <= b.y) continue;
        const dx = o.x - b.x;
        const dz = o.z - b.z;
        const minD = b.radius + o.radius;
        const dSq = dx * dx + dz * dz;
        if (dSq < minD * minD) {
          const d = Math.sqrt(dSq) || 0.001;
          const nx = dx / d;
          const nz = dz / d;
          const overlap = (minD - d) * 0.5;
          b.x -= nx * overlap;
          b.z -= nz * overlap;
          o.x += nx * overlap;
          o.z += nz * overlap;
          const rvx = o.vx - b.vx;
          const rvz = o.vz - b.vz;
          const vn = rvx * nx + rvz * nz;
          if (vn < 0) {
            const imp = -(1 + Math.min(b.restitution, o.restitution)) * vn / (1 / b.mass + 1 / o.mass);
            b.vx -= (imp / b.mass) * nx;
            b.vz -= (imp / b.mass) * nz;
            o.vx += (imp / o.mass) * nx;
            o.vz += (imp / o.mass) * nz;
          }
        }
      }

      // Gravidade e quique vertical
      const floorY = this.getSupportHeight(b.x, b.z, b.radius * 0.6, b.y, 0.25);
      b.vy -= this.gravity * dt;
      b.y += b.vy * dt;

      if (b.y <= floorY) {
        b.y = floorY;
        if (b.vy < -1.1 && b.restitution > 0.2) {
          b.vy = -b.vy * b.restitution;
          b.grounded = false;
        } else {
          b.vy = 0;
          b.grounded = true;
        }
      } else {
        b.grounded = false;
      }

      // Atrito realista no chão / resistência do ar
      const drag = b.grounded ? b.friction : 0.35;
      const damp = Math.exp(-drag * dt);
      b.vx *= damp;
      b.vz *= damp;
      if (Math.hypot(b.vx, b.vz) < 0.02) {
        b.vx = 0;
        b.vz = 0;
      }

      // Atualiza malha 3D + rotação física de rolamento em esferas!
      if (b.mesh) {
        if (b.kind === 'sphere') {
          b.mesh.position.set(b.x, b.y + b.radius, b.z);
          const spd = Math.hypot(b.vx, b.vz);
          if (spd > 0.02) {
            _axis.set(b.vz, 0, -b.vx).normalize();
            _dq.setFromAxisAngle(_axis, (spd * dt) / b.radius);
            b.mesh.quaternion.premultiply(_dq);
          }
        } else {
          b.mesh.position.set(b.x, b.y, b.z);
        }
      }
    }
  }
}
