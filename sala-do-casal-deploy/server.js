// Servidor Principal — Nosso Mundo 3D (Maria & Mauricio)
// Express + Socket.IO com autoridade em tempo real para o Mundo 3D e os 9 Minigames 3D

const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');

const {
  KART_TRACK,
  MEMORY_THEMES,
  COUPLE_QUESTIONS,
  DRAW_WORDS,
  AI_SKETCHES,
} = require('./src/gameData');

const {
  BOT_ID,
  CHAT_GREETINGS,
  createBotPlayer,
  stepWorldBot,
  stepGameBot,
  onGameEndedForBot,
} = require('./src/aiPartner');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 20000,
  pingTimeout: 25000,
});

// Healthcheck endpoint oficial para Render.com / monitoramento zero-downtime
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

app.use('/models', express.static(path.join(__dirname, 'public/models'), { maxAge: '7d' }));
app.use('/assets', express.static(path.join(__dirname, 'public/assets'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build'), { maxAge: '30d' }));
app.use('/vendor/three-addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm'), { maxAge: '30d' }));

app.get('/api/track', (_req, res) => {
  res.json(KART_TRACK);
});

const PORT = process.env.PORT || 3000;
const rooms = {};

const GAME_TYPES = ['tenis', 'corrida', 'bilhar', 'desenho', 'sintonia', 'memoria', 'lig4', 'velha', 'ppt'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const normText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function ensureRoom(code) {
  if (!rooms[code]) {
    const wins = {};
    for (const gt of GAME_TYPES) wins[gt] = { maria: 0, mauricio: 0 };
    rooms[code] = {
      code,
      mood: 'sunset',
      players: {},
      wins,
      chat: [],
      game: null,
    };
  }
  return rooms[code];
}

function humanIds(room) {
  return Object.keys(room.players).filter((id) => !room.players[id].isBot);
}

function allPlayerIds(room) {
  return Object.keys(room.players);
}

function recordWin(room, winnerId) {
  if (!room.game || !winnerId) return;
  const p = room.players[winnerId];
  if (p && (p.character === 'maria' || p.character === 'mauricio')) {
    room.wins[room.game.type][p.character] = (room.wins[room.game.type][p.character] || 0) + 1;
  }
  onGameEndedForBot(room, winnerId, botHandlers);
}

function sanitizeGameForPlayer(game, viewerId) {
  if (!game) return null;
  const copy = { ...game };
  delete copy._secretWord;
  delete copy._secretOptions;
  delete copy._secretDeck;
  delete copy._secretChoices;
  delete copy._secretVotes;

  if (game.type === 'desenho') {
    copy.myOptions = viewerId === game.drawer ? game._secretOptions : null;
    copy.secretWord = (viewerId === game.drawer || game.phase === 'roundEnd' || game.phase === 'over')
      ? game._secretWord
      : null;
  }
  return copy;
}

function broadcastRoom(room) {
  const playersList = Object.values(room.players).map((p) => ({
    id: p.id,
    name: p.name,
    character: p.character,
    isBot: !!p.isBot,
    x: p.x,
    y: p.y,
    z: p.z,
    rotY: p.rotY,
    sitting: !!p.sitting,
  }));

  for (const pid of humanIds(room)) {
    io.to(pid).emit('room:state', {
      code: room.code,
      mood: room.mood,
      hasBot: !!room.players[BOT_ID],
      players: playersList,
      wins: room.wins,
      chat: room.chat.slice(-30),
      game: sanitizeGameForPlayer(room.game, pid),
    });
  }
}

function sendChat(room, senderId, text) {
  const p = room.players[senderId];
  if (!p) return;
  const clean = String(text || '').trim().slice(0, 220);
  if (!clean) return;
  const msg = {
    id: senderId,
    name: p.name,
    character: p.character,
    text: clean,
    ts: Date.now(),
  };
  room.chat.push(msg);
  if (room.chat.length > 60) room.chat.shift();
  io.to(room.code).emit('chat:msg', msg);
}

// ==================== REGRAS E CRIAÇÃO DOS 9 MINIGAMES 3D ====================

const VELHA_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkVelhaWin(board) {
  for (const line of VELHA_LINES) {
    const v = board[line[0]];
    if (v && line.every((idx) => board[idx] === v)) {
      return { winner: v, line };
    }
  }
  return null;
}

function checkLig4Win(board) {
  const at = (r, c) => (r >= 0 && r < 6 && c >= 0 && c < 7 ? board[r * 7 + c] : null);
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      const v = at(r, c);
      if (!v) continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const cells = [[r, c], [r + dr, c + dc], [r + 2 * dr, c + 2 * dc], [r + 3 * dr, c + 3 * dc]];
        if (cells.every(([rr, cc]) => at(rr, cc) === v)) {
          return { winner: v, cells };
        }
      }
    }
  }
  return null;
}

function rackPoolBalls() {
  const balls = [{ n: 0, x: -0.68, z: 0, pocketed: false }];
  // Triângulo de 5 colunas: bola 8 no centro da 3ª coluna
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const r = 0.0395;
  const dx = r * 1.75;
  let k = 0;
  for (let col = 0; col < 5; col++) {
    for (let row = 0; row <= col; row++) {
      const bx = 0.56 + col * dx;
      const bz = (row - col / 2) * (r * 2.04) + rand(-0.001, 0.001);
      balls.push({ n: order[k++], x: +bx.toFixed(4), z: +bz.toFixed(4), pocketed: false });
    }
  }
  return balls;
}

function makeWordMask(word, revealedIndices = []) {
  return [...word]
    .map((ch, idx) => (ch === ' ' || ch === '-' ? ch : (revealedIndices.includes(idx) ? ch.toUpperCase() : '_')))
    .join(' ');
}

function makeLetterBank(word) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const clean = [...normText(word).toUpperCase()].filter((c) => /[A-Z]/.test(c));
  const extrasCount = Math.max(4, 14 - clean.length);
  const extras = [];
  for (let i = 0; i < extrasCount; i++) {
    extras.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
  }
  return shuffle([...clean, ...extras]);
}

function setupDrawRound(game, roundNum, drawerId) {
  const guesserId = game.players.find((p) => p !== drawerId) || drawerId;
  const opts = DRAW_WORDS.map((list, idx) => {
    // Se o desenhista for IA, garante opções com desenho vetorial no nível 1/2
    if (drawerId === BOT_ID && idx < 2) {
      const withArt = list.filter((w) => AI_SKETCHES[w]);
      if (withArt.length) return { word: pick(withArt), level: idx + 1 };
    }
    return { word: pick(list), level: idx + 1 };
  });

  Object.assign(game, {
    round: roundNum,
    drawer: drawerId,
    guesser: guesserId,
    phase: 'choose',
    _secretOptions: opts,
    _secretWord: null,
    wordMask: '',
    wordLen: 0,
    level: 1,
    bank: [],
    strokes: [],
    revealedIndices: [],
    endsAt: Date.now() + 20000,
    nextHintAt: 0,
    msg: 'Escolhendo uma palavra secreta...',
  });
}

function createMinigame(room, type) {
  const ids = allPlayerIds(room).slice(0, 2);
  if (ids.length < 2) return null;

  // Alterna quem começa em partidas seguidas
  const starter = room._lastStarter === ids[0] ? ids[1] : ids[0];
  room._lastStarter = starter;

  const base = {
    id: Math.random().toString(36).slice(2, 10),
    type,
    players: ids,
    turn: starter,
    winner: null,
    draw: false,
    msg: '',
    createdAt: Date.now(),
  };

  if (room.players[BOT_ID]) {
    room.players[BOT_ID]._memorySeen = {};
    room.players[BOT_ID]._nextTurnActAt = 0;
    room.players[BOT_ID]._sketchIdx = 0;
  }

  switch (type) {
    case 'tenis': {
      const pos = {
        [ids[0]]: { x: 0, z: 10.2 },
        [ids[1]]: { x: 0, z: -10.2 },
      };
      return {
        ...base,
        points: { [ids[0]]: 0, [ids[1]]: 0 },
        serverId: starter,
        phase: 'serve',
        phaseUntil: Date.now() + 2200,
        rally: 0,
        lastHitter: starter,
        matchPoint: false,
        pos,
        ball: { x: 0, y: 1.6, z: starter === ids[0] ? 10.0 : -10.0, vx: 0, vy: 0, vz: 0 },
        bounces: 0,
        msg: `Saque de ${room.players[starter]?.name || ''}!`,
      };
    }

    case 'corrida': {
      const s0 = KART_TRACK.spine[0];
      const baseAngle = Math.atan2(s0.tx, s0.tz);
      const karts = {};
      ids.forEach((id, idx) => {
        const side = idx === 0 ? -1.6 : 1.6;
        karts[id] = {
          x: +(s0.x + s0.nx * side - s0.tx * 1.5).toFixed(2),
          z: +(s0.z + s0.nz * side - s0.tz * 1.5).toFixed(2),
          angle: baseAngle,
          speed: 0,
          lap: 1,
          nextCp: 1,
          segIdx: 0,
          progress: 0,
          boostUntil: 0,
          finishedAt: 0,
          input: { throttle: 0, steer: 0, brake: false },
        };
      });
      return {
        ...base,
        lapsTotal: 3,
        phase: 'countdown',
        startAt: Date.now() + 3400,
        karts,
        msg: 'Preparem os motores! 3... 2... 1...',
      };
    }

    case 'bilhar': {
      return {
        ...base,
        balls: rackPoolBalls(),
        groups: {},
        aim: { angle: 0, power: 0.65 },
        busyUntil: 0,
        msg: `Vez de ${room.players[starter]?.name || ''} dar a tacada inicial!`,
      };
    }

    case 'desenho': {
      const g = {
        ...base,
        maxRounds: 4,
        scores: { [ids[0]]: 0, [ids[1]]: 0 },
      };
      // Começa com o humano desenhando na rodada 1 quando contra IA, depois reveza!
      const firstDrawer = ids.includes(BOT_ID) ? ids.find((i) => i !== BOT_ID) : starter;
      setupDrawRound(g, 1, firstDrawer);
      return g;
    }

    case 'sintonia': {
      const qs = shuffle(COUPLE_QUESTIONS).slice(0, 8);
      return {
        ...base,
        round: 1,
        total: qs.length,
        questions: qs,
        question: qs[0],
        phase: 'vote',
        voted: [],
        _secretVotes: {},
        reveal: null,
        matches: 0,
        history: [],
        msg: 'Respondam em segredo! Quem combina mais?',
      };
    }

    case 'memoria': {
      const deck = shuffle([...MEMORY_THEMES, ...MEMORY_THEMES].map((t) => t.id));
      return {
        ...base,
        _secretDeck: deck,
        visible: {},
        open: [],
        matched: [],
        pairs: { [ids[0]]: 0, [ids[1]]: 0 },
        combo: 0,
        lock: false,
        msg: `Vez de ${room.players[starter]?.name || ''}!`,
      };
    }

    case 'lig4': {
      return {
        ...base,
        board: Array(42).fill(null),
        hoverCol: { [ids[0]]: 3, [ids[1]]: 3 },
        lastMove: null,
        winCells: null,
        msg: `Vez de ${room.players[starter]?.name || ''}!`,
      };
    }

    case 'velha': {
      return {
        ...base,
        board: Array(9).fill(null),
        lastMove: null,
        winLine: null,
        msg: `Vez de ${room.players[starter]?.name || ''}!`,
      };
    }

    case 'ppt': {
      return {
        ...base,
        round: 1,
        winsGoal: 3,
        wins: { [ids[0]]: 0, [ids[1]]: 0 },
        phase: 'pick',
        locked: [],
        _secretChoices: {},
        reveal: null,
        phaseUntil: 0,
        msg: 'Escolha Pedra, Papel ou Tesoura!',
      };
    }
  }
  return null;
}

// ==================== FÍSICA EM TEMPO REAL: TÊNIS 3D ====================

const TENNIS_COURT = { hw: 4.5, hl: 11.5, net: 0.95, winPts: 7 };

function launchTennisBall(g, hitterId, targetX, targetZ, flightTime) {
  const b = g.ball;
  let T = flightTime;
  for (let i = 0; i < 12; i++) {
    b.vx = (targetX - b.x) / T;
    b.vz = (targetZ - b.z) / T;
    b.vy = (0.14 - b.y + 0.5 * 9.8 * T * T) / T;
    // Verifica altura ao cruzar a rede (z = 0)
    const tNet = -b.z / (b.vz || 0.001);
    if (tNet <= 0 || b.y + b.vy * tNet - 0.5 * 9.8 * tNet * tNet > TENNIS_COURT.net + 0.24) {
      break;
    }
    T += 0.07;
  }
  g.lastHitter = hitterId;
  g.bounces = 0;
}

function scoreTennisPoint(room, g, winnerId, reason) {
  if (g.phase !== 'play') return;
  const loserId = g.players.find((p) => p !== winnerId);
  g.points[winnerId] = (g.points[winnerId] || 0) + 1;
  const pw = g.points[winnerId];
  const pl = g.points[loserId] || 0;
  const wName = room.players[winnerId]?.name || 'Jogador';

  if (pw >= TENNIS_COURT.winPts && pw - pl >= 2) {
    g.winner = winnerId;
    g.phase = 'over';
    g.msg = `${reason} — ${wName} venceu a partida! 🏆`;
    recordWin(room, winnerId);
  } else {
    g.phase = 'point';
    g.phaseUntil = Date.now() + 1700;
    const total = pw + pl;
    g.serverId = g.players[Math.floor(total / 2) % 2];
    g.matchPoint = (pw >= TENNIS_COURT.winPts - 1 && pw > pl) || (pl >= TENNIS_COURT.winPts - 1 && pl > pw);
    g.msg = `${reason} Ponto de ${wName}!${g.matchPoint ? ' 🔥 Match Point!' : ''}`;
  }

  io.to(room.code).emit('game:event', {
    type: 'tenis',
    ev: 'point',
    winner: winnerId,
    points: g.points,
    msg: g.msg,
    matchPoint: g.matchPoint,
    over: !!g.winner,
  });
  broadcastRoom(room);
}

function stepTennis(room, g, dt, tickCount) {
  const now = Date.now();
  const b = g.ball;
  if (g.phase === 'over') return;

  if (g.phase === 'point' && now >= g.phaseUntil) {
    g.phase = 'serve';
    g.phaseUntil = now + 1350;
    g.rally = 0;
    g.msg = `Saque de ${room.players[g.serverId]?.name || ''}!`;
    broadcastRoom(room);
  }

  if (g.phase === 'serve' || g.phase === 'point') {
    const side = g.players[0] === g.serverId ? 1 : -1;
    const sp = g.pos[g.serverId] || { x: 0, z: side * 10.2 };
    b.x = clamp(sp.x, -3.5, 3.5) + 0.32 * side;
    b.z = side * 10.4;
    b.vx = 0; b.vy = 0; b.vz = 0;
    if (g.phase === 'serve') {
      const u = clamp(1 - (g.phaseUntil - now) / 1350, 0, 1);
      b.y = 1.05 + Math.sin(u * Math.PI) * 1.55;
      if (now >= g.phaseUntil) {
        b.y = 2.25;
        g.rally = 1;
        launchTennisBall(g, g.serverId, rand(-2.7, 2.7), -side * rand(4.2, 7.2), 1.04);
        g.phase = 'play';
        io.to(room.code).emit('game:event', { type: 'tenis', ev: 'hit', id: g.serverId, smash: false });
      }
    } else {
      b.y = 1.05;
    }
  } else if (g.phase === 'play') {
    const prevZ = b.z;
    b.vy -= 9.8 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;

    const receiverId = g.players.find((p) => p !== g.lastHitter);

    // Colisão com a rede em z = 0
    if ((prevZ > 0 && b.z <= 0) || (prevZ < 0 && b.z >= 0)) {
      if (b.y < TENNIS_COURT.net) {
        io.to(room.code).emit('game:event', { type: 'tenis', ev: 'net', x: b.x, y: b.y });
        scoreTennisPoint(room, g, receiverId, 'Na rede!');
        return;
      }
    }

    // Quique no chão
    if (b.y <= 0.12 && b.vy < 0) {
      b.y = 0.12;
      b.vy = -b.vy * 0.76;
      g.bounces++;
      io.to(room.code).emit('game:event', { type: 'tenis', ev: 'bounce', x: b.x, z: b.z });

      const hitterSide = g.players[0] === g.lastHitter ? 1 : -1;
      const inBounds = Math.abs(b.x) <= TENNIS_COURT.hw + 0.18 && Math.abs(b.z) <= TENNIS_COURT.hl + 0.22;

      if (g.bounces === 1) {
        // Primeiro quique precisa cair na quadra adversária!
        if (Math.sign(b.z) === hitterSide || !inBounds) {
          scoreTennisPoint(room, g, receiverId, 'Fora!');
          return;
        }
      } else if (g.bounces >= 2) {
        scoreTennisPoint(room, g, g.lastHitter, 'Dois quiques!');
        return;
      }
    }

    // Passou muito do fundo sem quicar ou depois de quicar
    if (Math.abs(b.z) > TENNIS_COURT.hl + 5.0 || Math.abs(b.x) > TENNIS_COURT.hw + 5.0) {
      const winner = g.bounces === 0 ? receiverId : g.lastHitter;
      scoreTennisPoint(room, g, winner, g.bounces === 0 ? 'Bola fora!' : 'Passada linda!');
      return;
    }
  }

  if (tickCount % 2 === 0) {
    io.to(room.code).emit('game:tick', {
      type: 'tenis',
      gid: g.id,
      phase: g.phase,
      rally: g.rally,
      pos: g.pos,
      ball: [+b.x.toFixed(3), +b.y.toFixed(3), +b.z.toFixed(3), +b.vx.toFixed(3), +b.vy.toFixed(3), +b.vz.toFixed(3)],
    });
  }
}

// ==================== FÍSICA EM TEMPO REAL: KART 3D ====================

function nearestTrackInfo(x, z, hintIdx = 0) {
  const spine = KART_TRACK.spine;
  const n = spine.length;
  let bestIdx = hintIdx;
  let bestDist2 = Infinity;
  // Busca global rápida (160 pontos é super leve!)
  for (let i = 0; i < n; i++) {
    const dx = x - spine[i].x;
    const dz = z - spine[i].z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDist2) {
      bestDist2 = d2;
      bestIdx = i;
    }
  }
  const s = spine[bestIdx];
  const lat = (x - s.x) * s.nx + (z - s.z) * s.nz;
  return { idx: bestIdx, s, lat };
}

function stepKart(room, g, dt, tickCount) {
  const now = Date.now();
  if (g.phase === 'over') return;

  if (g.phase === 'countdown' && now >= g.startAt) {
    g.phase = 'race';
    g.msg = 'VALENDO!! 🏁⚡';
    io.to(room.code).emit('game:event', { type: 'corrida', ev: 'go' });
    broadcastRoom(room);
  }

  const spineLen = KART_TRACK.spine.length;
  const ids = g.players;

  if (g.phase === 'race') {
    for (const id of ids) {
      const k = g.karts[id];
      if (!k || k.finishedAt) {
        if (k) k.speed *= 0.96;
        continue;
      }

      const inp = k.input || { throttle: 0, steer: 0, brake: false };
      const boosting = now < k.boostUntil;
      const maxSpd = boosting ? 30.5 : 21.5;
      const accel = boosting ? 28.0 : 17.5;

      if (inp.brake) {
        if (k.speed > 0.5) k.speed -= 24 * dt;
        else k.speed = Math.max(-7.5, k.speed - 10 * dt);
      } else if (inp.throttle > 0) {
        k.speed = Math.min(maxSpd, k.speed + accel * inp.throttle * dt);
      } else if (inp.throttle < 0) {
        k.speed = Math.max(-7.5, k.speed + 12 * inp.throttle * dt);
      } else {
        k.speed *= Math.pow(0.32, dt);
      }

      const turnFactor = Math.min(1, Math.abs(k.speed) / 4.5) * (k.speed >= -0.1 ? 1 : -1);
      k.angle -= inp.steer * 2.35 * turnFactor * dt;

      k.x += Math.sin(k.angle) * k.speed * dt;
      k.z += Math.cos(k.angle) * k.speed * dt;

      const info = nearestTrackInfo(k.x, k.z, k.segIdx);
      k.segIdx = info.idx;

      // Grama desacelera; barreira segura o kart na pista!
      if (Math.abs(info.lat) > KART_TRACK.halfWidth) {
        k.speed *= Math.pow(0.45, dt);
      }
      if (Math.abs(info.lat) > KART_TRACK.wallHalfWidth) {
        const clampedLat = Math.sign(info.lat) * KART_TRACK.wallHalfWidth;
        k.x = info.s.x + info.s.nx * clampedLat;
        k.z = info.s.z + info.s.nz * clampedLat;
        k.speed *= 0.82;
      }

      // Turbos ⚡
      for (const bp of KART_TRACK.boosts) {
        if (Math.hypot(k.x - bp.x, k.z - bp.z) < 2.35 && now > k.boostUntil - 900) {
          k.boostUntil = now + 1500;
          k.speed = Math.max(k.speed, 28.5);
          io.to(room.code).emit('game:event', { type: 'corrida', ev: 'boost', id, boostId: bp.id });
        }
      }

      // Checkpoints e voltas
      const cpTargetSeg = KART_TRACK.checkpoints[k.nextCp];
      const segDiff = Math.min(
        Math.abs(info.idx - cpTargetSeg),
        spineLen - Math.abs(info.idx - cpTargetSeg)
      );
      if (segDiff <= 7) {
        if (k.nextCp === 0) {
          k.lap++;
          k.nextCp = 1;
          if (k.lap > g.lapsTotal) {
            k.finishedAt = now;
            if (!g.winner) {
              g.winner = id;
              g.phase = 'over';
              g.msg = `${room.players[id]?.name || ''} cruzou a linha de chegada em 1º!! 🏆🏎️`;
              recordWin(room, id);
              io.to(room.code).emit('game:event', { type: 'corrida', ev: 'finish', winner: id, msg: g.msg });
              broadcastRoom(room);
            }
          } else {
            io.to(room.code).emit('game:event', { type: 'corrida', ev: 'lap', id, lap: k.lap });
          }
        } else {
          k.nextCp = (k.nextCp + 1) % KART_TRACK.checkpoints.length;
        }
      }

      k.progress = (k.lap - 1) * spineLen + info.idx;
    }

    // Empurrão entre os 2 karts!
    const k0 = g.karts[ids[0]];
    const k1 = g.karts[ids[1]];
    if (k0 && k1) {
      const dx = k1.x - k0.x;
      const dz = k1.z - k0.z;
      const d = Math.hypot(dx, dz);
      const minDist = 1.95;
      if (d > 0.001 && d < minDist) {
        const nx = dx / d;
        const nz = dz / d;
        const overlap = (minDist - d) * 0.5;
        k0.x -= nx * overlap;
        k0.z -= nz * overlap;
        k1.x += nx * overlap;
        k1.z += nz * overlap;
        io.to(room.code).emit('game:event', { type: 'corrida', ev: 'bump', x: (k0.x + k1.x) / 2, z: (k0.z + k1.z) / 2 });
      }
    }
  }

  if (tickCount % 2 === 0) {
    const kartsSnap = {};
    for (const id of ids) {
      const k = g.karts[id];
      kartsSnap[id] = {
        x: +k.x.toFixed(2),
        z: +k.z.toFixed(2),
        a: +k.angle.toFixed(3),
        s: +k.speed.toFixed(2),
        lap: Math.min(k.lap, g.lapsTotal),
        prog: k.progress,
        boost: now < k.boostUntil ? 1 : 0,
      };
    }
    io.to(room.code).emit('game:tick', {
      type: 'corrida',
      gid: g.id,
      phase: g.phase,
      startIn: Math.max(0, g.startAt - now),
      karts: kartsSnap,
    });
  }
}

// ==================== FÍSICA DETERMINÍSTICA: SINUCA 3D ====================

const POOL_TABLE = {
  hx: 1.28,
  hz: 0.64,
  r: 0.038,
  pockets: [
    { x: -1.28, z: -0.64, pr: 0.092 },
    { x: 0, z: -0.66, pr: 0.085 },
    { x: 1.28, z: -0.64, pr: 0.092 },
    { x: -1.28, z: 0.64, pr: 0.092 },
    { x: 0, z: 0.66, pr: 0.085 },
    { x: 1.28, z: 0.64, pr: 0.092 },
  ],
};

function simulatePoolShot(room, g, shooterId, angle, power) {
  const stateBalls = g.balls.map((b) => ({
    n: b.n,
    x: b.x,
    z: b.z,
    vx: 0,
    vz: 0,
    pocketed: b.pocketed,
  }));

  const cue = stateBalls.find((b) => b.n === 0);
  if (!cue || cue.pocketed) return;

  const spd = 0.85 + clamp(power, 0.08, 1) * 5.0;
  cue.vx = Math.cos(angle) * spd;
  cue.vz = Math.sin(angle) * spd;

  const frames = [];
  const clacks = [];
  const pocketedThisShot = [];
  let firstHit = null;

  const dt = 1 / 120;
  const R = POOL_TABLE.r;
  const maxSteps = 540;

  for (let step = 0; step < maxSteps; step++) {
    let moving = false;

    for (const b of stateBalls) {
      if (b.pocketed) continue;
      const v = Math.hypot(b.vx, b.vz);
      if (v > 0.008) {
        moving = true;
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        // Atrito do feltro
        const decel = 0.88 * dt;
        const nv = Math.max(0, v - decel) * 0.9965;
        b.vx = (b.vx / v) * nv;
        b.vz = (b.vz / v) * nv;
      } else {
        b.vx = 0;
        b.vz = 0;
      }

      // Caçapas
      for (const pk of POOL_TABLE.pockets) {
        if (Math.hypot(b.x - pk.x, b.z - pk.z) < pk.pr) {
          b.pocketed = true;
          b.vx = 0;
          b.vz = 0;
          pocketedThisShot.push({ n: b.n, frame: Math.floor(step / 4), x: pk.x, z: pk.z });
          break;
        }
      }
      if (b.pocketed) continue;

      // Tabelas (deixa boca da caçapa livre)
      const nearCorner = Math.abs(b.x) > POOL_TABLE.hx - 0.09 && Math.abs(b.z) > POOL_TABLE.hz - 0.09;
      const nearSide = Math.abs(b.x) < 0.085 && Math.abs(b.z) > POOL_TABLE.hz - 0.05;
      if (!nearCorner && !nearSide) {
        if (b.x < -POOL_TABLE.hx + R) { b.x = -POOL_TABLE.hx + R; b.vx = Math.abs(b.vx) * 0.82; }
        if (b.x > POOL_TABLE.hx - R) { b.x = POOL_TABLE.hx - R; b.vx = -Math.abs(b.vx) * 0.82; }
        if (b.z < -POOL_TABLE.hz + R) { b.z = -POOL_TABLE.hz + R; b.vz = Math.abs(b.vz) * 0.82; }
        if (b.z > POOL_TABLE.hz - R) { b.z = POOL_TABLE.hz - R; b.vz = -Math.abs(b.vz) * 0.82; }
      }
    }

    // Colisões bola-bola
    for (let i = 0; i < stateBalls.length; i++) {
      const a = stateBalls[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < stateBalls.length; j++) {
        const b = stateBalls[j];
        if (b.pocketed) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0 && d < R * 2) {
          const nx = dx / d;
          const nz = dz / d;
          const overlap = (R * 2 - d) * 0.5;
          a.x -= nx * overlap;
          a.z -= nz * overlap;
          b.x += nx * overlap;
          b.z += nz * overlap;

          const rvx = a.vx - b.vx;
          const rvz = a.vz - b.vz;
          const relNormal = rvx * nx + rvz * nz;
          if (relNormal > 0) {
            const imp = relNormal * 0.95;
            a.vx -= imp * nx;
            a.vz -= imp * nz;
            b.vx += imp * nx;
            b.vz += imp * nz;
            if (firstHit === null && (a.n === 0 || b.n === 0)) {
              firstHit = a.n === 0 ? b.n : a.n;
            }
            if (clacks.length < 28 && imp > 0.25) {
              clacks.push({ frame: Math.floor(step / 4), power: +Math.min(1, imp / 3.5).toFixed(2) });
            }
          }
        }
      }
    }

    if (step % 4 === 0) {
      frames.push(
        stateBalls.map((b) => [b.n, +b.x.toFixed(4), +b.z.toFixed(4), b.pocketed ? 1 : 0])
      );
    }

    if (!moving && step > 12) break;
  }

  // Regras da Sinuca Bola 8
  const opponentId = g.players.find((p) => p !== shooterId);
  const scratched = pocketedThisShot.some((p) => p.n === 0);
  const eightPocketed = pocketedThisShot.some((p) => p.n === 8);

  if (scratched) {
    cue.pocketed = false;
    cue.x = -0.68;
    cue.z = 0;
    // Evita sobrepor outra bola
    while (stateBalls.some((o) => o.n !== 0 && !o.pocketed && Math.hypot(o.x - cue.x, o.z - cue.z) < R * 2.1)) {
      cue.z += 0.085;
      if (cue.z > 0.5) { cue.z = -0.5; cue.x -= 0.085; }
    }
  }

  g.balls = stateBalls.map((b) => ({ n: b.n, x: +b.x.toFixed(4), z: +b.z.toFixed(4), pocketed: b.pocketed }));

  const ballGroup = (n) => (n >= 1 && n <= 7 ? 'solid' : n >= 9 && n <= 15 ? 'stripe' : null);

  if (eightPocketed) {
    const myGrp = g.groups[shooterId];
    const remainingMine = myGrp
      ? g.balls.filter((b) => !b.pocketed && ballGroup(b.n) === myGrp).length
      : 1;
    if (myGrp && remainingMine === 0 && !scratched) {
      g.winner = shooterId;
      g.msg = `${room.players[shooterId]?.name || ''} encaçapou a Bola 8 e venceu!! 🎱🏆`;
    } else {
      g.winner = opponentId;
      g.msg = `Bola 8 fora de hora! Vitória de ${room.players[opponentId]?.name || ''}! 🎱`;
    }
    recordWin(room, g.winner);
  } else {
    let foul = scratched || firstHit === null;
    if (!foul && g.groups[shooterId]) {
      const myGrp = g.groups[shooterId];
      const remainingMine = g.balls.filter((b) => !b.pocketed && ballGroup(b.n) === myGrp).length;
      if (remainingMine > 0 && ballGroup(firstHit) !== myGrp) foul = true;
      if (remainingMine === 0 && firstHit !== 8) foul = true;
    }

    // Define grupos na primeira bola legal encaçapada
    const legalObjs = pocketedThisShot.filter((p) => p.n !== 0 && p.n !== 8);
    if (!foul && !g.groups[shooterId] && legalObjs.length > 0) {
      const grp = ballGroup(legalObjs[0].n);
      g.groups[shooterId] = grp;
      g.groups[opponentId] = grp === 'solid' ? 'stripe' : 'solid';
    }

    const myGrpNow = g.groups[shooterId];
    const pocketedMine = legalObjs.some((p) => !myGrpNow || ballGroup(p.n) === myGrpNow);

    if (!foul && pocketedMine) {
      g.turn = shooterId;
      g.msg = `Boa tacada! ${room.players[shooterId]?.name || ''} joga de novo! 🔥`;
    } else {
      g.turn = opponentId;
      g.msg = foul
        ? `Falta! Vez de ${room.players[opponentId]?.name || ''}.`
        : `Vez de ${room.players[opponentId]?.name || ''}!`;
    }
  }

  const animDurationMs = frames.length * (1000 / 30) + 350;
  g.busyUntil = Date.now() + animDurationMs;

  io.to(room.code).emit('game:event', {
    type: 'bilhar',
    ev: 'shot',
    gid: g.id,
    shooter: shooterId,
    angle,
    power,
    frames,
    clacks,
    pocketed: pocketedThisShot,
  });

  setTimeout(() => {
    if (room.game && room.game.id === g.id) {
      broadcastRoom(room);
    }
  }, animDurationMs);
}

// ==================== TIMERS DE ATELIÊ 3D (DESENHO) ====================

function stepDrawTimers(room, g) {
  const now = Date.now();
  if (g.phase === 'choose' && now >= g.endsAt) {
    handleGameAction(room, g.drawer, { kind: 'pickWord', index: 0 });
  } else if (g.phase === 'draw') {
    // Revela dica de letra a cada 22s (até 40% da palavra)
    if (g.nextHintAt && now >= g.nextHintAt && g._secretWord) {
      g.nextHintAt = now + 22000;
      const hiddenIndices = [...g._secretWord]
        .map((ch, idx) => (ch !== ' ' && ch !== '-' && !g.revealedIndices.includes(idx) ? idx : -1))
        .filter((idx) => idx >= 0);
      if (hiddenIndices.length > Math.ceil(g._secretWord.length * 0.55)) {
        g.revealedIndices.push(pick(hiddenIndices));
        g.wordMask = makeWordMask(g._secretWord, g.revealedIndices);
        broadcastRoom(room);
      }
    }
    if (now >= g.endsAt) {
      finishDrawRound(room, g, false);
    }
  } else if (g.phase === 'roundEnd' && now >= g.endsAt) {
    if (g.round >= g.maxRounds) {
      g.phase = 'over';
      const [p0, p1] = g.players;
      if (g.scores[p0] > g.scores[p1]) {
        g.winner = p0;
        g.msg = `${room.players[p0]?.name || ''} brilhou no Ateliê 3D! 🎨🏆`;
        recordWin(room, p0);
      } else if (g.scores[p1] > g.scores[p0]) {
        g.winner = p1;
        g.msg = `${room.players[p1]?.name || ''} brilhou no Ateliê 3D! 🎨🏆`;
        recordWin(room, p1);
      } else {
        g.draw = true;
        g.msg = 'Empate artístico perfeito! 🎨💖';
      }
    } else {
      const nextDrawer = g.players.find((p) => p !== g.drawer) || g.drawer;
      setupDrawRound(g, g.round + 1, nextDrawer);
    }
    broadcastRoom(room);
  }
}

function finishDrawRound(room, g, guessedRight) {
  g.phase = 'roundEnd';
  g.endsAt = Date.now() + 3400;
  if (guessedRight) {
    const pts = g.level;
    g.scores[g.guesser] = (g.scores[g.guesser] || 0) + pts + 1;
    g.scores[g.drawer] = (g.scores[g.drawer] || 0) + pts;
    g.msg = `Acertou!! A palavra era "${g._secretWord.toUpperCase()}"! +${pts + 1}⭐`;
    io.to(room.code).emit('game:event', { type: 'desenho', ev: 'correct', word: g._secretWord, guesser: g.guesser });
  } else {
    g.msg = `Tempo esgotado! A palavra era "${(g._secretWord || '').toUpperCase()}".`;
    io.to(room.code).emit('game:event', { type: 'desenho', ev: 'timeout', word: g._secretWord });
  }
  broadcastRoom(room);
}

// ==================== AÇÕES DOS MINIGAMES 3D ====================

function handleGameAction(room, playerId, action) {
  const g = room.game;
  if (!g || !action || g.winner || g.draw || g.phase === 'over') return;
  if (!g.players.includes(playerId)) return;

  switch (g.type) {
    case 'tenis': {
      const side = g.players[0] === playerId ? 1 : -1;
      if (action.kind === 'move') {
        g.pos[playerId] = {
          x: clamp(+action.x || 0, -4.6, 4.6),
          z: side > 0 ? clamp(+action.z || 10, 1.8, 12.6) : clamp(+action.z || -10, -12.6, -1.8),
        };
      } else if (action.kind === 'swing') {
        io.to(room.code).emit('game:event', { type: 'tenis', ev: 'swing', id: playerId });
        if (g.phase !== 'play' || g.lastHitter === playerId) return;
        const p = g.pos[playerId] || { x: 0, z: side * 10.2 };
        const b = g.ball;
        const distXZ = Math.hypot(b.x - p.x, b.z - p.z);
        if (distXZ <= 2.65 && b.y <= 2.6 && Math.sign(b.z) === side) {
          const sweetSpot = distXZ < 1.45 && b.y >= 0.45 && b.y <= 1.85 && (action.power || 0) > 0.75;
          g.rally++;
          const aimX = clamp(+action.aimX || 0, -3.9, 3.9);
          const depth = sweetSpot ? rand(7.2, 10.3) : rand(4.5, 9.2);
          const flightT = sweetSpot
            ? Math.max(0.58, 0.74 - g.rally * 0.012)
            : Math.max(0.72, 1.02 - g.rally * 0.022);
          launchTennisBall(g, playerId, aimX, -side * depth, flightT);
          io.to(room.code).emit('game:event', {
            type: 'tenis',
            ev: 'hit',
            id: playerId,
            smash: sweetSpot,
            rally: g.rally,
          });
        }
      }
      break;
    }

    case 'corrida': {
      if (action.kind === 'input' && g.karts[playerId]) {
        g.karts[playerId].input = {
          throttle: clamp(+action.throttle || 0, -1, 1),
          steer: clamp(+action.steer || 0, -1, 1),
          brake: !!action.brake,
        };
      }
      break;
    }

    case 'bilhar': {
      if (g.turn !== playerId || Date.now() < g.busyUntil) return;
      if (action.kind === 'aim') {
        g.aim = { angle: +action.angle || 0, power: clamp(+action.power || 0.5, 0.05, 1) };
        io.to(room.code).emit('game:tick', { type: 'bilhar', gid: g.id, aim: g.aim, turn: g.turn });
      } else if (action.kind === 'shoot') {
        simulatePoolShot(room, g, playerId, +action.angle || 0, clamp(+action.power || 0.6, 0.08, 1));
      }
      break;
    }

    case 'desenho': {
      if (action.kind === 'pickWord' && playerId === g.drawer && g.phase === 'choose') {
        const chosen = g._secretOptions[clamp(action.index | 0, 0, 2)] || g._secretOptions[0];
        g._secretWord = chosen.word;
        g.level = chosen.level;
        g.wordLen = chosen.word.length;
        g.revealedIndices = [];
        g.wordMask = makeWordMask(chosen.word, []);
        g.bank = makeLetterBank(chosen.word);
        g.phase = 'draw';
        g.endsAt = Date.now() + 75000;
        g.nextHintAt = Date.now() + 22000;
        g.msg = `${room.players[g.drawer]?.name || ''} está pintando no cavalete 3D! (${chosen.level}⭐)`;
        broadcastRoom(room);
      } else if (action.kind === 'stroke' && playerId === g.drawer && g.phase === 'draw') {
        if (action.stroke && Array.isArray(action.stroke.pts)) {
          g.strokes.push(action.stroke);
          io.to(room.code).emit('game:event', { type: 'desenho', ev: 'stroke', stroke: action.stroke });
        }
      } else if (action.kind === 'undo' && playerId === g.drawer && g.phase === 'draw') {
        g.strokes.pop();
        io.to(room.code).emit('game:event', { type: 'desenho', ev: 'syncStrokes', strokes: g.strokes });
      } else if (action.kind === 'clear' && playerId === g.drawer && g.phase === 'draw') {
        g.strokes = [];
        io.to(room.code).emit('game:event', { type: 'desenho', ev: 'syncStrokes', strokes: [] });
      } else if (action.kind === 'guess' && playerId !== g.drawer && g.phase === 'draw') {
        const guessNorm = normText(action.text);
        if (!guessNorm) return;
        if (guessNorm === normText(g._secretWord)) {
          finishDrawRound(room, g, true);
        } else {
          sendChat(room, playerId, `Chute: ${String(action.text).slice(0, 40)}`);
          io.to(room.code).emit('game:event', { type: 'desenho', ev: 'wrongGuess', id: playerId, text: action.text });
        }
      }
      break;
    }

    case 'sintonia': {
      if (action.kind !== 'vote' || g.phase !== 'vote') return;
      const target = action.target === 'maria' ? 'maria' : 'mauricio';
      if (g.voted.includes(playerId)) return;
      g.voted.push(playerId);
      g._secretVotes[playerId] = target;
      broadcastRoom(room);

      if (g.voted.length >= 2) {
        const [p0, p1] = g.players;
        const matched = g._secretVotes[p0] === g._secretVotes[p1];
        if (matched) g.matches++;
        g.phase = 'reveal';
        g.reveal = { choices: { ...g._secretVotes }, matched };
        g.history.push({ q: g.question, matched, choices: { ...g._secretVotes } });
        g.msg = matched ? 'SINTONIA PERFEITA!! 💖✨ Pensaram igualzinho!' : 'Eita! 😂 Cada um apontou pra um lado!';
        io.to(room.code).emit('game:event', { type: 'sintonia', ev: 'reveal', matched, choices: g._secretVotes });
        broadcastRoom(room);

        setTimeout(() => {
          if (!room.game || room.game.id !== g.id) return;
          if (g.round >= g.total) {
            g.phase = 'over';
            const pct = Math.round((g.matches / g.total) * 100);
            g.draw = true; // Jogo cooperativo de casal!
            g.compatibility = pct;
            g.msg = `Sintonia do Casal: ${pct}% (${g.matches}/${g.total} respostas iguais)! 💖`;
            // Dá ponto de celebração pros dois se >= 50%!
            if (pct >= 50) {
              room.wins.sintonia.maria++;
              room.wins.sintonia.mauricio++;
            }
          } else {
            g.round++;
            g.question = g.questions[g.round - 1];
            g.phase = 'vote';
            g.voted = [];
            g._secretVotes = {};
            g.reveal = null;
            g.msg = `Pergunta ${g.round} de ${g.total}!`;
          }
          broadcastRoom(room);
        }, 3800);
      }
      break;
    }

    case 'memoria': {
      if (action.kind !== 'flip' || g.turn !== playerId || g.lock) return;
      const idx = action.index | 0;
      if (idx < 0 || idx >= 16 || g.matched.includes(idx) || g.open.includes(idx)) return;

      g.open.push(idx);
      g.visible[idx] = g._secretDeck[idx];
      io.to(room.code).emit('game:event', { type: 'memoria', ev: 'flip', index: idx, sym: g.visible[idx] });

      if (g.open.length === 2) {
        const [a, b] = g.open;
        if (g._secretDeck[a] === g._secretDeck[b]) {
          g.matched.push(a, b);
          g.open = [];
          g.pairs[playerId] = (g.pairs[playerId] || 0) + 1;
          g.combo++;
          io.to(room.code).emit('game:event', { type: 'memoria', ev: 'match', indices: [a, b], id: playerId, combo: g.combo });

          if (g.matched.length >= 16) {
            const [p0, p1] = g.players;
            if (g.pairs[p0] > g.pairs[p1]) {
              g.winner = p0;
              g.msg = `${room.players[p0]?.name || ''} venceu com ${g.pairs[p0]} pares! 🃏🏆`;
              recordWin(room, p0);
            } else if (g.pairs[p1] > g.pairs[p0]) {
              g.winner = p1;
              g.msg = `${room.players[p1]?.name || ''} venceu com ${g.pairs[p1]} pares! 🃏🏆`;
              recordWin(room, p1);
            } else {
              g.draw = true;
              g.msg = 'Empate na memória! 4 a 4 pares! 💖';
            }
          } else {
            g.msg = g.combo > 1
              ? `COMBO ${g.combo}x!! 🔥 ${room.players[playerId]?.name || ''} continua!`
              : `Par encontrado! ${room.players[playerId]?.name || ''} joga de novo!`;
          }
          broadcastRoom(room);
        } else {
          g.lock = true;
          g.combo = 0;
          broadcastRoom(room);
          setTimeout(() => {
            if (!room.game || room.game.id !== g.id) return;
            for (const k of g.open) delete g.visible[k];
            g.open = [];
            g.lock = false;
            g.turn = g.players.find((p) => p !== playerId);
            g.msg = `Vez de ${room.players[g.turn]?.name || ''}!`;
            broadcastRoom(room);
          }, 1150);
        }
      } else {
        broadcastRoom(room);
      }
      break;
    }

    case 'lig4': {
      if (action.kind === 'hover') {
        const col = clamp(action.col | 0, 0, 6);
        g.hoverCol[playerId] = col;
        io.to(room.code).emit('game:tick', { type: 'lig4', gid: g.id, hoverCol: g.hoverCol });
      } else if (action.kind === 'drop' && g.turn === playerId) {
        const col = clamp(action.col | 0, 0, 6);
        let row = 0;
        while (row < 6 && g.board[row * 7 + col]) row++;
        if (row >= 6) return;

        g.board[row * 7 + col] = playerId;
        g.lastMove = { r: row, c: col, player: playerId };
        io.to(room.code).emit('game:event', { type: 'lig4', ev: 'drop', r: row, c: col, id: playerId });

        const res = checkLig4Win(g.board);
        if (res) {
          g.winner = res.winner;
          g.winCells = res.cells;
          g.msg = `${room.players[res.winner]?.name || ''} conectou 4!! 🔴🏆`;
          recordWin(room, res.winner);
        } else if (g.board.every(Boolean)) {
          g.draw = true;
          g.msg = 'Tabuleiro cheio! Empate! 🤝';
        } else {
          g.turn = g.players.find((p) => p !== playerId);
          g.msg = `Vez de ${room.players[g.turn]?.name || ''}!`;
        }
        broadcastRoom(room);
      }
      break;
    }

    case 'velha': {
      if (action.kind !== 'place' || g.turn !== playerId) return;
      const idx = action.index | 0;
      if (idx < 0 || idx >= 9 || g.board[idx]) return;

      g.board[idx] = playerId;
      g.lastMove = idx;
      io.to(room.code).emit('game:event', { type: 'velha', ev: 'place', index: idx, id: playerId });

      const res = checkVelhaWin(g.board);
      if (res) {
        g.winner = res.winner;
        g.winLine = res.line;
        g.msg = `${room.players[res.winner]?.name || ''} venceu no Jogo da Velha 3D!! ❌⭕🏆`;
        recordWin(room, res.winner);
      } else if (g.board.every(Boolean)) {
        g.draw = true;
        g.msg = 'Deu velha!! Empate! 🤝';
      } else {
        g.turn = g.players.find((p) => p !== playerId);
        g.msg = `Vez de ${room.players[g.turn]?.name || ''}!`;
      }
      broadcastRoom(room);
      break;
    }

    case 'ppt': {
      if (action.kind !== 'choose' || g.phase !== 'pick') return;
      const valid = ['pedra', 'papel', 'tesoura'];
      if (!valid.includes(action.choice) || g.locked.includes(playerId)) return;

      g.locked.push(playerId);
      g._secretChoices[playerId] = action.choice;
      broadcastRoom(room);

      if (g.locked.length >= 2) {
        const [p0, p1] = g.players;
        const c0 = g._secretChoices[p0];
        const c1 = g._secretChoices[p1];
        const beats = { pedra: 'tesoura', papel: 'pedra', tesoura: 'papel' };
        let roundWinner = null;
        if (c0 !== c1) roundWinner = beats[c0] === c1 ? p0 : p1;
        if (roundWinner) g.wins[roundWinner]++;

        g.phase = 'clash';
        g.reveal = { choices: { [p0]: c0, [p1]: c1 }, roundWinner };
        g.msg = 'JO... KEN... PÔ!! ✊✋✌️';

        io.to(room.code).emit('game:event', {
          type: 'ppt',
          ev: 'clash',
          choices: { [p0]: c0, [p1]: c1 },
          roundWinner,
          wins: g.wins,
        });
        broadcastRoom(room);

        setTimeout(() => {
          if (!room.game || room.game.id !== g.id) return;
          const champ = g.players.find((p) => g.wins[p] >= g.winsGoal);
          if (champ) {
            g.winner = champ;
            g.phase = 'over';
            g.msg = `${room.players[champ]?.name || ''} venceu a Arena Jokenpô 3D!! 🏆`;
            recordWin(room, champ);
          } else {
            g.round++;
            g.phase = 'pick';
            g.locked = [];
            g._secretChoices = {};
            g.reveal = null;
            g.msg = `Rodada ${g.round} — Escolha sua jogada!`;
          }
          broadcastRoom(room);
        }, 3600);
      }
      break;
    }
  }
}

const botHandlers = {
  emitWorldPose(room, bot) {
    io.to(room.code).emit('world:pose', {
      id: bot.id,
      x: +bot.x.toFixed(2),
      y: +bot.y.toFixed(2),
      z: +bot.z.toFixed(2),
      rotY: +bot.rotY.toFixed(3),
      speed: +bot.speed.toFixed(2),
      jumping: false,
      sitting: !!bot.sitting,
      anim: bot.anim,
    });
  },
  emitEmote(room, id, emoji) {
    io.to(room.code).emit('emote:fx', { id, emoji });
  },
  handleGameAction,
  sendChat,
  checkLig4Win,
  checkVelhaWin,
};

// ==================== LOOP GLOBAL 60Hz DAS SALAS ====================

let globalTick = 0;
setInterval(() => {
  globalTick++;
  const dt = 1 / 60;
  for (const code of Object.keys(rooms)) {
    const room = rooms[code];
    if (humanIds(room).length === 0) continue;

    if (room.players[BOT_ID]) {
      if (globalTick % 3 === 0) stepWorldBot(room, dt * 3, botHandlers);
      stepGameBot(room, dt, botHandlers);
    }

    const g = room.game;
    if (g) {
      if (g.type === 'tenis') stepTennis(room, g, dt, globalTick);
      else if (g.type === 'corrida') stepKart(room, g, dt, globalTick);
      else if (g.type === 'desenho' && globalTick % 20 === 0) stepDrawTimers(room, g);
    }
  }
}, 1000 / 60);

// ==================== CONEXÕES SOCKET.IO ====================

io.on('connection', (socket) => {
  let currentRoomCode = null;

  socket.on('room:join', ({ roomCode, name, character, withBot } = {}) => {
    const cleanCode = String(roomCode || 'NOSSOAMOR')
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 18) || 'NOSSOAMOR';

    if (currentRoomCode && rooms[currentRoomCode]) {
      delete rooms[currentRoomCode].players[socket.id];
      socket.leave(currentRoomCode);
    }

    const room = ensureRoom(cleanCode);
    const humans = humanIds(room);

    // Se já tem 2 humanos, avisa que a sala está cheia
    if (humans.length >= 2) {
      socket.emit('room:error', { message: 'Essa sala já está com os 2 jogadores conectados!' });
      return;
    }

    // Se o parceiro real entrou e o robô estava lá, o robô sai sozinho!
    if (humans.length === 1 && room.players[BOT_ID]) {
      delete room.players[BOT_ID];
      room.game = null;
    }

    let chosenChar = character === 'maria' ? 'maria' : 'mauricio';
    // Se já houver 1 humano na sala, sugere o personagem complementar caso venha igual?
    // Mantemos a escolha ou se o outro humano já está com o mesmo, alterna para ter a dupla Maria & Mauricio!
    if (humans.length === 1) {
      const otherChar = room.players[humans[0]]?.character;
      if (otherChar === chosenChar) {
        chosenChar = otherChar === 'maria' ? 'mauricio' : 'maria';
      }
    }

    const cleanName = String(name || (chosenChar === 'maria' ? 'Maria' : 'Mauricio')).trim().slice(0, 22)
      || (chosenChar === 'maria' ? 'Maria' : 'Mauricio');

    currentRoomCode = cleanCode;
    socket.join(cleanCode);

    room.players[socket.id] = {
      id: socket.id,
      name: cleanName,
      character: chosenChar,
      isBot: false,
      x: chosenChar === 'maria' ? -1.4 : 1.4,
      y: 0,
      z: 3.5,
      rotY: Math.PI,
      speed: 0,
      jumping: false,
      sitting: false,
      anim: 'idle',
    };

    if (withBot && humanIds(room).length === 1) {
      room.players[BOT_ID] = createBotPlayer(chosenChar);
      setTimeout(() => {
        if (rooms[cleanCode]?.players[BOT_ID]) {
          sendChat(room, BOT_ID, pick(CHAT_GREETINGS));
        }
      }, 900);
    }

    socket.emit('room:joined', { youId: socket.id, roomCode: cleanCode, character: chosenChar });
    broadcastRoom(room);
  });

  socket.on('bot:toggle', ({ enabled } = {}) => {
    const room = rooms[currentRoomCode];
    if (!room) return;
    if (enabled && humanIds(room).length === 1 && !room.players[BOT_ID]) {
      const me = room.players[socket.id];
      room.players[BOT_ID] = createBotPlayer(me?.character || 'mauricio');
      sendChat(room, BOT_ID, pick(CHAT_GREETINGS));
    } else if (!enabled && room.players[BOT_ID]) {
      delete room.players[BOT_ID];
      room.game = null;
    }
    broadcastRoom(room);
  });

  socket.on('world:move', (pose = {}) => {
    const room = rooms[currentRoomCode];
    const p = room?.players[socket.id];
    if (!p) return;
    p.x = clamp(+pose.x || 0, -45, 45);
    p.y = clamp(+pose.y || 0, -1, 12);
    p.z = clamp(+pose.z || 0, -45, 45);
    p.rotY = +pose.rotY || 0;
    p.speed = clamp(+pose.speed || 0, 0, 14);
    p.jumping = !!pose.jumping;
    p.sitting = !!pose.sitting;
    p.anim = String(pose.anim || 'idle').slice(0, 16);

    socket.to(room.code).emit('world:pose', {
      id: socket.id,
      x: +p.x.toFixed(2),
      y: +p.y.toFixed(2),
      z: +p.z.toFixed(2),
      rotY: +p.rotY.toFixed(3),
      speed: +p.speed.toFixed(2),
      jumping: p.jumping,
      sitting: p.sitting,
      anim: p.anim,
    });
  });

  socket.on('world:mood', ({ mood } = {}) => {
    const room = rooms[currentRoomCode];
    if (!room) return;
    if (['sunset', 'night', 'day'].includes(mood)) {
      room.mood = mood;
      broadcastRoom(room);
    }
  });

  socket.on('chat:send', ({ text } = {}) => {
    const room = rooms[currentRoomCode];
    if (!room) return;
    sendChat(room, socket.id, text);
  });

  socket.on('emote:send', ({ emoji } = {}) => {
    const room = rooms[currentRoomCode];
    if (!room) return;
    const clean = String(emoji || '💖').slice(0, 8);
    io.to(room.code).emit('emote:fx', { id: socket.id, emoji: clean });
  });

  socket.on('game:start', ({ gameType } = {}) => {
    const room = rooms[currentRoomCode];
    if (!room || !GAME_TYPES.includes(gameType)) return;
    if (allPlayerIds(room).length < 2) {
      socket.emit('room:notice', {
        message: 'Chame seu amor com o código da sala ou ative o Parceiro IA para jogar! 💖',
      });
      return;
    }
    room.game = createMinigame(room, gameType);
    broadcastRoom(room);
  });

  socket.on('game:rematch', () => {
    const room = rooms[currentRoomCode];
    if (!room || !room.game) return;
    room.game = createMinigame(room, room.game.type);
    broadcastRoom(room);
  });

  socket.on('game:leave', () => {
    const room = rooms[currentRoomCode];
    if (!room) return;
    room.game = null;
    broadcastRoom(room);
  });

  socket.on('game:action', (action = {}) => {
    const room = rooms[currentRoomCode];
    if (!room) return;
    handleGameAction(room, socket.id, action);
  });

  socket.on('disconnect', () => {
    const room = rooms[currentRoomCode];
    if (!room) return;
    delete room.players[socket.id];
    room.game = null;
    if (humanIds(room).length === 0) {
      delete rooms[currentRoomCode];
    } else {
      broadcastRoom(room);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  let lanIp = null;
  for (const list of Object.values(nets)) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIp = iface.address;
        break;
      }
    }
  }
  console.log(`\n💖 Nosso Mundo 3D (Maria & Mauricio) rodando!`);
  console.log(`   Local:   http://localhost:${PORT}`);
  if (lanIp) console.log(`   Na rede: http://${lanIp}:${PORT}\n`);
});
