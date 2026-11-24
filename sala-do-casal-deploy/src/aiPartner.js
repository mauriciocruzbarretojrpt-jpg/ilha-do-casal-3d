// Parceiro(a) IA que assume o outro modelo (Maria ou Mauricio) quando você joga sozinho
// Anda pelo mundo 3D ao seu lado, conversa e joga todos os 9 minigames 3D!

const { KART_TRACK, AI_SKETCHES } = require('./gameData');

const BOT_ID = 'ai-partner';

const CHAT_GREETINGS = [
  'Cheguei, meu amor! 💖 Qual jogo 3D vamos encarar primeiro?',
  'Oiê! 😍 Vamos passear pela ilha ou ir direto pros jogos?',
  'Prontíssimo(a) pra ganhar de você hoje! 😘✨',
];

const CHAT_WIN = [
  'Ganheeei! 😘 Mas deixo você pedir revanche!',
  'Ponto pra mim! 💖 Joga muito, mas hoje tô inspirado(a)!',
  'Vitória!! 🏆🥰 Mais uma?',
];

const CHAT_LOSE = [
  'Nossa, mandou muito bem!! 👏💖 Quero revanche!',
  'Você roubou meu coração e a partida 😂💖',
  'Boa!! Na próxima eu viro o jogo! 🔥',
];

function rand(a, b) {
  return a + Math.random() * (b - a);
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createBotPlayer(humanCharacter) {
  const charKey = humanCharacter === 'maria' ? 'mauricio' : 'maria';
  const name = charKey === 'maria' ? 'Maria (IA)' : 'Mauricio (IA)';
  return {
    id: BOT_ID,
    name,
    character: charKey,
    isBot: true,
    x: 2.2,
    y: 0,
    z: 2.5,
    rotY: Math.PI,
    speed: 0,
    jumping: false,
    sitting: false,
    anim: 'idle',
    _phase: 0,
    _nextEmoteAt: Date.now() + 9000,
    _nextTurnActAt: 0,
    _memorySeen: {},
    _sketchIdx: 0,
    _nextSketchAt: 0,
  };
}

function stepWorldBot(room, dt, handlers) {
  const bot = room.players[BOT_ID];
  if (!bot || room.game) return;
  const human = Object.values(room.players).find((p) => !p.isBot);
  if (!human) return;

  const now = Date.now();
  bot._phase += dt;

  // Segue o jogador humano a uma distância confortável (~2.3m) na ilha 3D
  const targetX = human.x + Math.cos(bot._phase * 0.45) * 1.9;
  const targetZ = human.z + Math.sin(bot._phase * 0.45) * 1.9;
  const dx = targetX - bot.x;
  const dz = targetZ - bot.z;
  const dist = Math.hypot(dx, dz);

  if (human.sitting) {
    // Se o humano sentou no banco romântico, senta ao lado!
    bot.x += (human.x + 0.75 - bot.x) * Math.min(1, dt * 5);
    bot.z += (human.z - bot.z) * Math.min(1, dt * 5);
    bot.rotY = human.rotY;
    bot.speed = 0;
    bot.sitting = true;
    bot.anim = 'sit';
  } else {
    bot.sitting = false;
    if (dist > 1.85) {
      const moveSpeed = dist > 5.5 ? 6.2 : 3.6;
      const vx = (dx / dist) * moveSpeed;
      const vz = (dz / dist) * moveSpeed;
      bot.x += vx * dt;
      bot.z += vz * dt;
      bot.rotY = Math.atan2(vx, vz);
      bot.speed = moveSpeed;
      bot.anim = moveSpeed > 5 ? 'run' : 'walk';
    } else {
      bot.speed = 0;
      bot.anim = 'idle';
      // Olha suavemente para o parceiro
      const lookAngle = Math.atan2(human.x - bot.x, human.z - bot.z);
      bot.rotY = lookAngle;
    }
  }

  if (now > bot._nextEmoteAt) {
    bot._nextEmoteAt = now + rand(14000, 26000);
    handlers.emitEmote(room, BOT_ID, pick(['💖', '😘', '🥰', '👋', '✨']));
  }

  handlers.emitWorldPose(room, bot);
}

function stepGameBot(room, dt, handlers) {
  const bot = room.players[BOT_ID];
  const g = room.game;
  if (!bot || !g || g.winner || g.draw || g.phase === 'over') return;

  const now = Date.now();

  switch (g.type) {
    case 'tenis': {
      const side = g.players[0] === BOT_ID ? 1 : -1;
      const p = g.pos[BOT_ID] || (g.pos[BOT_ID] = { x: 0, z: side * 10.2 });
      const b = g.ball;
      // Corre em direção à trajetória da bola quando ela vem pro lado da IA
      const comingToBot = (side > 0 && b.vz > 0) || (side < 0 && b.vz < 0);
      let tx = 0;
      let tz = side * 10.2;
      if (comingToBot && Math.abs(b.vz) > 0.2) {
        const timeToLine = Math.max(0, Math.min(1.5, (side * 9.5 - b.z) / b.vz));
        tx = Math.max(-4.1, Math.min(4.1, b.x + b.vx * timeToLine * 0.92));
        tz = side * Math.max(5.2, Math.min(11.0, Math.abs(b.z) + 0.6));
      }
      const dx = tx - p.x;
      const dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      const maxStep = 6.9 * dt;
      if (d > 0.05) {
        p.x += (dx / d) * Math.min(d, maxStep);
        p.z += (dz / d) * Math.min(d, maxStep);
      }

      if (g.phase === 'play' && g.lastHitter !== BOT_ID) {
        const distBall = Math.hypot(b.x - p.x, b.z - p.z);
        if (distBall < 2.05 && Math.sign(b.z) === side && b.y < 2.3) {
          const aimX = rand(-3.3, 3.3);
          const power = Math.random() < 0.28 ? 1.0 : 0.72;
          handlers.handleGameAction(room, BOT_ID, { kind: 'swing', aimX, power });
        }
      }
      break;
    }

    case 'corrida': {
      if (g.phase !== 'race') return;
      const k = g.karts[BOT_ID];
      if (!k || k.finishedAt) return;
      const spine = KART_TRACK.spine;
      const lookIdx = (k.segIdx + 8) % spine.length;
      const target = spine[lookIdx];
      // Leve variação humana na linha
      const offset = Math.sin(now * 0.0013) * 1.1;
      const tx = target.x + target.nx * offset;
      const tz = target.z + target.nz * offset;
      const desired = Math.atan2(tx - k.x, tz - k.z);
      let diff = desired - k.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      k.input = {
        throttle: Math.abs(diff) > 0.85 ? 0.68 : 0.96,
        steer: Math.max(-1, Math.min(1, diff * 2.1)),
        brake: Math.abs(diff) > 1.35,
      };
      break;
    }

    case 'bilhar': {
      if (g.turn !== BOT_ID || now < g.busyUntil) return;
      if (!bot._nextTurnActAt) bot._nextTurnActAt = now + 1350;
      if (now < bot._nextTurnActAt) return;
      bot._nextTurnActAt = 0;

      const cue = g.balls.find((b) => b.n === 0 && !b.pocketed);
      if (!cue) return;
      const myGroup = g.groups[BOT_ID];
      const candidates = g.balls.filter((b) => {
        if (b.n === 0 || b.pocketed) return false;
        if (!myGroup) return b.n !== 8;
        if (myGroup === 'solid') return b.n >= 1 && b.n <= 7;
        return b.n >= 9 && b.n <= 15;
      });
      const targets = candidates.length > 0 ? candidates : g.balls.filter((b) => b.n === 8 && !b.pocketed);
      const target = pick(targets) || { x: 0.5, z: 0 };

      // Mira em direção à caçapa mais alinhada com a bola-alvo
      const pockets = [
        [-1.28, -0.64], [0, -0.66], [1.28, -0.64],
        [-1.28, 0.64], [0, 0.66], [1.28, 0.64],
      ];
      let bestAngle = Math.atan2(target.z - cue.z, target.x - cue.x);
      let bestScore = -Infinity;
      for (const [px, pz] of pockets) {
        const vx = px - target.x;
        const vz = pz - target.z;
        const d = Math.hypot(vx, vz) || 1;
        // Posição da ghost ball atrás da bola-alvo
        const gx = target.x - (vx / d) * 0.076;
        const gz = target.z - (vz / d) * 0.076;
        const sx = gx - cue.x;
        const sz = gz - cue.z;
        const sd = Math.hypot(sx, sz) || 1;
        const dot = (sx / sd) * (vx / d) + (sz / sd) * (vz / d);
        if (dot > bestScore) {
          bestScore = dot;
          bestAngle = Math.atan2(sz, sx);
        }
      }
      bestAngle += rand(-0.045, 0.045);
      const power = rand(0.55, 0.85);
      handlers.handleGameAction(room, BOT_ID, { kind: 'aim', angle: bestAngle, power });
      setTimeout(() => {
        if (room.game && room.game.id === g.id && room.game.turn === BOT_ID) {
          handlers.handleGameAction(room, BOT_ID, { kind: 'shoot', angle: bestAngle, power });
        }
      }, 650);
      bot._nextTurnActAt = now + 4000;
      break;
    }

    case 'desenho': {
      if (g.drawer === BOT_ID) {
        if (g.phase === 'choose') {
          if (!bot._nextTurnActAt) bot._nextTurnActAt = now + 900;
          if (now >= bot._nextTurnActAt) {
            bot._nextTurnActAt = 0;
            bot._sketchIdx = 0;
            // Prefere palavra que tenha desenho vetorial bonito!
            const idx = g._secretOptions.findIndex((o) => AI_SKETCHES[o.word]);
            handlers.handleGameAction(room, BOT_ID, { kind: 'pickWord', index: idx >= 0 ? idx : 0 });
          }
        } else if (g.phase === 'draw') {
          const sketch = AI_SKETCHES[g._secretWord];
          if (sketch && bot._sketchIdx < sketch.length && now >= bot._nextSketchAt) {
            bot._nextSketchAt = now + 950;
            const stroke = sketch[bot._sketchIdx++];
            handlers.handleGameAction(room, BOT_ID, { kind: 'stroke', stroke });
          }
        }
      } else if (g.phase === 'draw') {
        // IA adivinhando o desenho do humano!
        if (!bot._nextTurnActAt) bot._nextTurnActAt = now + rand(6500, 11000);
        if (now >= bot._nextTurnActAt && g.strokes.length >= 2) {
          bot._nextTurnActAt = now + rand(7000, 11000);
          if (Math.random() < 0.42 || g.strokes.length >= 6) {
            handlers.handleGameAction(room, BOT_ID, { kind: 'guess', text: g._secretWord });
          } else {
            const wrongGuesses = ['sol', 'casa', 'flor', 'coração', 'estrela', 'gato', 'pizza'];
            const wrong = pick(wrongGuesses.filter((w) => w !== g._secretWord));
            handlers.sendChat(room, BOT_ID, `Hmm... será "${wrong}"? 🤔`);
          }
        }
      }
      break;
    }

    case 'sintonia': {
      if (g.phase !== 'vote' || g.voted.includes(BOT_ID)) return;
      if (!bot._nextTurnActAt) bot._nextTurnActAt = now + rand(900, 1900);
      if (now >= bot._nextTurnActAt) {
        bot._nextTurnActAt = 0;
        const target = Math.random() < 0.5 ? 'maria' : 'mauricio';
        handlers.handleGameAction(room, BOT_ID, { kind: 'vote', target });
      }
      break;
    }

    case 'memoria': {
      // Memoriza cartas abertas recentemente com chance realista
      for (const idx of g.open) {
        if (g.visible[idx] && Math.random() < 0.85) {
          bot._memorySeen[idx] = g.visible[idx];
        }
      }
      if (g.turn !== BOT_ID || g.lock) return;
      if (!bot._nextTurnActAt) bot._nextTurnActAt = now + 850;
      if (now < bot._nextTurnActAt) return;
      bot._nextTurnActAt = now + 850;

      const available = [];
      for (let i = 0; i < 16; i++) {
        if (!g.matched.includes(i) && !g.open.includes(i)) available.push(i);
      }
      if (!available.length) return;

      let choice = null;
      if (g.open.length === 1) {
        const firstIdx = g.open[0];
        const sym = g.visible[firstIdx];
        const matchIdx = available.find((i) => bot._memorySeen[i] === sym);
        choice = matchIdx !== undefined ? matchIdx : pick(available);
      } else {
        // Procura par já conhecido
        const bySym = {};
        for (const i of available) {
          const s = bot._memorySeen[i];
          if (s) {
            if (bySym[s] !== undefined) { choice = bySym[s]; break; }
            bySym[s] = i;
          }
        }
        if (choice === null) choice = pick(available);
      }
      handlers.handleGameAction(room, BOT_ID, { kind: 'flip', index: choice });
      break;
    }

    case 'lig4': {
      if (g.turn !== BOT_ID) return;
      if (!bot._nextTurnActAt) bot._nextTurnActAt = now + 950;
      if (now < bot._nextTurnActAt) return;
      bot._nextTurnActAt = 0;

      const validCols = [];
      for (let c = 0; c < 7; c++) {
        if (!g.board[5 * 7 + c]) validCols.push(c);
      }
      if (!validCols.length) return;

      const humanId = g.players.find((p) => p !== BOT_ID);
      const canWinCol = (player) => {
        for (const c of validCols) {
          let r = 0;
          while (r < 6 && g.board[r * 7 + c]) r++;
          const copy = [...g.board];
          copy[r * 7 + c] = player;
          if (handlers.checkLig4Win(copy)) return c;
        }
        return null;
      };

      let col = canWinCol(BOT_ID);
      if (col === null) col = canWinCol(humanId);
      if (col === null) {
        // Prefere colunas centrais
        const weighted = validCols.sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3) + rand(-1.2, 1.2));
        col = weighted[0];
      }
      handlers.handleGameAction(room, BOT_ID, { kind: 'hover', col });
      setTimeout(() => {
        if (room.game && room.game.id === g.id && room.game.turn === BOT_ID) {
          handlers.handleGameAction(room, BOT_ID, { kind: 'drop', col });
        }
      }, 380);
      bot._nextTurnActAt = now + 2000;
      break;
    }

    case 'velha': {
      if (g.turn !== BOT_ID) return;
      if (!bot._nextTurnActAt) bot._nextTurnActAt = now + 800;
      if (now < bot._nextTurnActAt) return;
      bot._nextTurnActAt = 0;

      const empty = g.board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
      if (!empty.length) return;
      const humanId = g.players.find((p) => p !== BOT_ID);

      const findLineMove = (who) => {
        for (const i of empty) {
          const copy = [...g.board];
          copy[i] = who;
          if (handlers.checkVelhaWin(copy)) return i;
        }
        return null;
      };
      let move = findLineMove(BOT_ID);
      if (move === null && Math.random() < 0.8) move = findLineMove(humanId);
      if (move === null && empty.includes(4) && Math.random() < 0.7) move = 4;
      if (move === null) move = pick(empty);

      handlers.handleGameAction(room, BOT_ID, { kind: 'place', index: move });
      break;
    }

    case 'ppt': {
      if (g.phase !== 'pick' || g.locked.includes(BOT_ID)) return;
      if (!bot._nextTurnActAt) bot._nextTurnActAt = now + rand(650, 1400);
      if (now >= bot._nextTurnActAt) {
        bot._nextTurnActAt = 0;
        handlers.handleGameAction(room, BOT_ID, {
          kind: 'choose',
          choice: pick(['pedra', 'papel', 'tesoura']),
        });
      }
      break;
    }
  }
}

function onGameEndedForBot(room, winnerId, handlers) {
  const bot = room.players[BOT_ID];
  if (!bot || !winnerId) return;
  setTimeout(() => {
    if (!room.players[BOT_ID]) return;
    const msg = winnerId === BOT_ID ? pick(CHAT_WIN) : pick(CHAT_LOSE);
    handlers.sendChat(room, BOT_ID, msg);
  }, 1100);
}

module.exports = {
  BOT_ID,
  CHAT_GREETINGS,
  createBotPlayer,
  stepWorldBot,
  stepGameBot,
  onGameEndedForBot,
};
