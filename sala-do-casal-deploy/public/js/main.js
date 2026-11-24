// Orquestrador Principal — Ilha do Casal 3D (Anime / JRPG Edition)
// Integra o Mundo 3D Físico (modelos CC0 + PhysicsWorld3D), Rigs MoCap corrigidos,
// Artes 2D Anime Originais e Ícones Vetoriais Cel-Shaded!

import * as THREE from 'three';
import { preloadCharacters } from './characters.js';
import { createAAAPipeline, isMobileDevice } from './graphics.js';
import { CoupleIslandWorld } from './world3d.js';
import { MINIGAMES } from './catalog.js';
import { getAnimeIcon } from './animeIcons.js';
import { audio } from './audio.js';

import { Tennis3DGame } from './games/tennis3d.js';
import { Kart3DGame } from './games/kart3d.js';
import { Pool3DGame } from './games/pool3d.js';
import { Atelier3DGame } from './games/atelier3d.js';
import { Stage3DGame } from './games/stage3d.js';
import { Memory3DGame } from './games/memory3d.js';
import { Connect4_3DGame } from './games/connect4_3d.js';
import { TicTacToe3DGame } from './games/tictactoe3d.js';
import { RPS3DGame } from './games/rps3d.js';

const GAME_CLASSES = {
  tenis: Tennis3DGame,
  corrida: Kart3DGame,
  bilhar: Pool3DGame,
  desenho: Atelier3DGame,
  sintonia: Stage3DGame,
  memoria: Memory3DGame,
  lig4: Connect4_3DGame,
  velha: TicTacToe3DGame,
  ppt: RPS3DGame,
};

const EMOTE_SVG_BY_CHAR = {
  '💖': 'emoteLove',
  '😘': 'emoteKiss',
  '🥰': 'emoteSparkle',
  '😂': 'emoteHappy',
  '🔥': 'emoteDance',
  '👋': 'emoteWave',
};

// Injeta todos os ícones vetoriais Anime Cel-Shaded no DOM (zero emojis de sistema!)
function hydrateAnimeIcons() {
  document.querySelectorAll('.svg-slot[data-icon]').forEach((el) => {
    el.innerHTML = getAnimeIcon(el.dataset.icon);
  });

  const setBtn = (id, iconKey, label) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (label) {
      btn.innerHTML = `<span class="btn-ico">${getAnimeIcon(iconKey)}</span><span class="lbl">${label}</span>`;
    } else {
      btn.innerHTML = getAnimeIcon(iconKey);
    }
  };

  setBtn('btn-random-room', 'dice');
  setBtn('btn-copy-link', 'link');
  setBtn('btn-ps2-filter', 'crt', 'Filtro Suave');
  setBtn('btn-mood', 'weather', 'Clima');
  setBtn('btn-bot-toggle', 'partner', 'Parceiro IA');
  setBtn('btn-games-drawer', 'gamepad', '9 Jogos 3D');

  const chatBtn = document.getElementById('btn-chat-toggle');
  if (chatBtn) {
    chatBtn.innerHTML = `<span class="btn-ico">${getAnimeIcon('chat')}</span><span class="lbl">Chat</span><span id="chat-unread" class="badge-dot hidden"></span>`;
  }

  setBtn('btn-music', 'musicOn');
  setBtn('btn-sound', 'soundOn');
  setBtn('btn-fullscreen', 'fullscreen');
  setBtn('btn-back-menu', 'home');

  document.querySelectorAll('#emote-bar button').forEach((btn) => {
    const svgKey = btn.dataset.svg || EMOTE_SVG_BY_CHAR[btn.dataset.emote] || 'emoteLove';
    btn.innerHTML = getAnimeIcon(svgKey);
  });
}

hydrateAnimeIcons();

const canvas = document.getElementById('webgl-canvas');
const pipeline = createAAAPipeline(canvas);
const socket = window.io();

let youId = null;
let selectedChar = 'mauricio';
let nameAutoSynced = true;
let roomState = null;
let activeMinigame = null;
let activeGameId = null;
let gameOverShownForId = null;
const playersMap = new Map();

// ==================== INICIALIZAÇÃO DO MUNDO 3D FÍSICO ====================

const world = new CoupleIslandWorld(canvas, {
  onMovePose(pose) {
    socket.emit('world:move', pose);
  },
  onExposureChange(exp) {
    if (!activeMinigame) {
      pipeline.renderer.toneMappingExposure = exp;
    }
  },
  onPromptChange(promptInfo) {
    const box = document.getElementById('world-prompt');
    const mobAct = document.getElementById('btn-mobile-action');
    if (!promptInfo || activeMinigame) {
      box.classList.add('hidden');
      mobAct?.classList.add('hidden');
      return;
    }
    document.getElementById('prompt-icon').innerHTML = getAnimeIcon(promptInfo.iconId || 'gamepad');
    document.getElementById('prompt-title').textContent = promptInfo.title;
    document.getElementById('prompt-desc').textContent = promptInfo.desc;
    document.getElementById('btn-prompt-go').textContent = promptInfo.btnLabel || 'Jogar (E)';
    if (mobAct) {
      mobAct.textContent = promptInfo.kind === 'bench' ? 'SENTAR' : 'JOGAR';
      mobAct.classList.remove('hidden');
    }
    box.classList.remove('hidden');
  },
  onInteract(gameId) {
    socket.emit('game:start', { gameType: gameId });
  },
});

preloadCharacters((progress) => {
  const fill = document.getElementById('loader-fill');
  const label = document.getElementById('loader-label');
  if (fill) fill.style.width = `${Math.round(progress * 100)}%`;
  if (progress >= 1 && label) {
    label.textContent = '✦ Rigs 3D e Ilha prontos para jogar! ✦';
    setTimeout(() => {
      document.getElementById('menu-loader')?.classList.add('hidden');
    }, 850);
  }
}).catch(() => {
  const label = document.getElementById('loader-label');
  if (label) label.textContent = 'Pronto para entrar!';
});

// ==================== UTILITÁRIOS DE UI ====================

function showToast(msg) {
  const wrap = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = `✦ ${msg}`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function copyInviteLink(code) {
  const clean = (code || document.getElementById('inp-room').value || 'NOSSOAMOR').toUpperCase().trim();
  const url = `${window.location.origin}/?sala=${encodeURIComponent(clean)}`;
  navigator.clipboard?.writeText(url).then(() => {
    showToast(`Link copiado! Envie para seu amor: ?sala=${clean}`);
  }).catch(() => {
    showToast(`Código da sala: ${clean}`);
  });
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('sala')) {
  document.getElementById('inp-room').value = urlParams.get('sala').toUpperCase().slice(0, 16);
}

// ==================== INTERAÇÕES DO MENU INICIAL ANIME ====================

const inpName = document.getElementById('inp-name');
const inpRoom = document.getElementById('inp-room');

inpName.addEventListener('input', () => { nameAutoSynced = false; });

document.querySelectorAll('.char-card').forEach((card) => {
  card.addEventListener('click', () => {
    audio.unlock();
    audio.play('selectChar');
    selectedChar = card.dataset.char === 'maria' ? 'maria' : 'mauricio';
    document.querySelectorAll('.char-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');

    if (nameAutoSynced || inpName.value === 'Maria' || inpName.value === 'Mauricio') {
      inpName.value = selectedChar === 'maria' ? 'Maria' : 'Mauricio';
      nameAutoSynced = true;
    }

    const otherLabel = selectedChar === 'maria' ? 'O Mauricio (IA)' : 'A Maria (IA)';
    document.getElementById('bot-btn-sub').textContent =
      `${otherLabel} explora e joga com você até seu amor entrar!`;
    document.getElementById('showcase-text').textContent =
      `Destaque no Gazebo 3D: ${selectedChar === 'maria' ? 'Maria (2P)' : 'Mauricio (1P)'} acenando ao vivo!`;

    world.setMenuCharacterFocus(selectedChar);
  });
});

const handleToggleCRT = () => {
  audio.unlock();
  audio.play('selectChar');
  const crtOn = pipeline.togglePS2Filter();
  const menuBtn = document.getElementById('btn-menu-crt');
  const hudBtnLbl = document.querySelector('#btn-ps2-filter .lbl');
  if (menuBtn) menuBtn.textContent = crtOn ? 'Filtro: TV Retrô' : 'Filtro: Suave';
  if (hudBtnLbl) hudBtnLbl.textContent = crtOn ? 'TV Retrô' : 'Filtro Suave';
  showToast(crtOn ? 'Modo TV Retrô ativado!' : 'Modo Anime Cel-Shading Suave ativado!');
};

document.getElementById('btn-menu-crt')?.addEventListener('click', handleToggleCRT);
document.getElementById('btn-ps2-filter')?.addEventListener('click', handleToggleCRT);

document.getElementById('btn-cam-couple').addEventListener('click', () => {
  audio.unlock();
  audio.play('click');
  world.setMenuCharacterFocus('couple');
  document.getElementById('showcase-text').textContent = 'Enquadramento Casal: Maria & Mauricio juntos no Gazebo 3D!';
});

document.getElementById('btn-random-room').addEventListener('click', () => {
  audio.play('click');
  const words = ['NOSSOAMOR', 'SAKURA', 'CASAL3D', 'PARAISO', 'SEMPREJUNTOS', 'MEUBEM'];
  inpRoom.value = words[Math.floor(Math.random() * words.length)] + Math.floor(10 + Math.random() * 89);
});

document.getElementById('btn-copy-link').addEventListener('click', () => {
  audio.play('click');
  copyInviteLink(inpRoom.value);
});

function joinWorld(withBot) {
  audio.unlock();
  audio.play('win');
  const roomCode = inpRoom.value.trim().toUpperCase() || 'NOSSOAMOR';
  const name = inpName.value.trim() || (selectedChar === 'maria' ? 'Maria' : 'Mauricio');
  socket.emit('room:join', {
    roomCode,
    name,
    character: selectedChar,
    withBot,
  });
}

document.getElementById('btn-join-online').addEventListener('click', () => joinWorld(false));
document.getElementById('btn-join-bot').addEventListener('click', () => joinWorld(true));

// ==================== CONTROLES DO HUD DA ILHA 3D ====================

document.getElementById('hud-room-pill').addEventListener('click', () => {
  copyInviteLink(roomState?.code);
});

document.getElementById('btn-prompt-go').addEventListener('click', () => {
  world.triggerNearInteraction();
});

document.getElementById('btn-mood').addEventListener('click', () => {
  audio.play('click');
  const next = world.cycleMood();
  socket.emit('world:mood', { mood: next });
});

document.getElementById('btn-bot-toggle').addEventListener('click', () => {
  audio.play('click');
  socket.emit('bot:toggle', { enabled: !roomState?.hasBot });
});

document.getElementById('btn-games-drawer').addEventListener('click', () => {
  audio.play('click');
  renderGamesModal();
  document.getElementById('games-modal').classList.remove('hidden');
});

document.getElementById('btn-close-games').addEventListener('click', () => {
  document.getElementById('games-modal').classList.add('hidden');
});

document.getElementById('btn-chat-toggle').addEventListener('click', () => {
  audio.play('click');
  const drawer = document.getElementById('chat-drawer');
  drawer.classList.toggle('hidden');
  document.getElementById('chat-unread')?.classList.add('hidden');
});

document.getElementById('btn-close-chat').addEventListener('click', () => {
  document.getElementById('chat-drawer').classList.add('hidden');
});

document.getElementById('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = document.getElementById('chat-input');
  if (!inp.value.trim()) return;
  socket.emit('chat:send', { text: inp.value.trim() });
  inp.value = '';
});

document.querySelectorAll('#emote-bar button').forEach((btn) => {
  btn.addEventListener('click', () => {
    socket.emit('emote:send', { emoji: btn.dataset.emote });
  });
});

document.getElementById('btn-music').addEventListener('click', () => {
  audio.unlock();
  const on = audio.toggleMusic();
  showToast(on ? 'Trilha ambiente ativada' : 'Trilha ambiente pausada');
});

document.getElementById('btn-sound').addEventListener('click', (e) => {
  const muted = audio.toggleMute();
  e.currentTarget.innerHTML = getAnimeIcon(muted ? 'soundOff' : 'soundOn');
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

document.getElementById('btn-back-menu').addEventListener('click', () => {
  window.location.reload();
});

document.getElementById('btn-leave-game').addEventListener('click', () => {
  audio.play('click');
  socket.emit('game:leave');
});

document.getElementById('btn-gameover-leave').addEventListener('click', () => {
  audio.play('click');
  socket.emit('game:leave');
});

document.getElementById('btn-rematch').addEventListener('click', () => {
  audio.play('click');
  document.getElementById('mg-gameover').classList.add('hidden');
  socket.emit('game:rematch');
});

// ==================== JOYSTICK VIRTUAL & BOTÕES MULTI-TOUCH MOBILE ====================

function syncWorldControlsVisibility() {
  if (!youId || activeMinigame) return;
  if (isMobileDevice()) {
    document.getElementById('mobile-world-controls')?.classList.remove('hidden');
    document.getElementById('world-controls-hint')?.classList.add('hidden');
  } else {
    document.getElementById('mobile-world-controls')?.classList.add('hidden');
    document.getElementById('world-controls-hint')?.classList.remove('hidden');
  }
}

(function setupMobileControls() {
  const zone = document.getElementById('joystick-zone');
  const stick = document.getElementById('joystick-stick');
  if (!zone || !stick) return;

  let joyPointerId = null;

  function updateStickFromXY(clientX, clientY) {
    const rect = zone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.42;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > maxR) {
      dx = (dx / d) * maxR;
      dy = (dy / d) * maxR;
    }
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    world.setJoystick(dx / maxR, dy / maxR);
  }

  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    joyPointerId = e.pointerId;
    zone.setPointerCapture?.(e.pointerId);
    updateStickFromXY(e.clientX, e.clientY);
  });

  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyPointerId) return;
    e.preventDefault();
    updateStickFromXY(e.clientX, e.clientY);
  });

  const resetStick = (e) => {
    if (joyPointerId === null || (e && e.pointerId !== undefined && e.pointerId !== joyPointerId)) return;
    joyPointerId = null;
    stick.style.transform = 'translate(-50%, -50%)';
    world.setJoystick(0, 0);
  };

  zone.addEventListener('pointerup', resetStick);
  zone.addEventListener('pointercancel', resetStick);

  const jumpBtn = document.getElementById('btn-mobile-jump');
  jumpBtn?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    world.mobileJump();
  });

  const actBtn = document.getElementById('btn-mobile-action');
  actBtn?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    world.triggerNearInteraction();
  });
})();

function renderGamesModal() {
  const grid = document.getElementById('games-grid');
  const wins = roomState?.wins || {};
  grid.innerHTML = MINIGAMES.map((mg) => {
    const w = wins[mg.id] || { maria: 0, mauricio: 0 };
    return `
      <div class="game-tile" data-gid="${mg.id}">
        <div class="game-tile-head">
          <div class="game-tile-icon" style="background:${mg.accent}22">${getAnimeIcon(mg.id)}</div>
          <div>
            <span class="game-tile-jp">${mg.jpTag || '3D ARENA'}</span>
            <strong>${mg.name}</strong>
          </div>
        </div>
        <p>${mg.desc}</p>
        <div class="game-tile-score">
          <span style="color:#e11d68">Maria ${w.maria || 0}</span>
          <span style="color:#1b1936">✦ VS ✦</span>
          <span style="color:#0284c7">${w.mauricio || 0} Mauricio</span>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.game-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      audio.play('click');
      document.getElementById('games-modal').classList.add('hidden');
      socket.emit('game:start', { gameType: tile.dataset.gid });
    });
  });
}

// ==================== TRANSIÇÃO MUNDO 3D <-> MINIGAMES 3D ====================

function mountMinigame3D(game) {
  disposeActiveMinigame();
  const Cls = GAME_CLASSES[game.type];
  if (!Cls) return;

  activeGameId = game.id;
  gameOverShownForId = null;
  pipeline.renderer.toneMappingExposure = 1.02;

  const meta = MINIGAMES.find((m) => m.id === game.type) || { id: 'gamepad', name: 'Jogo 3D' };
  document.getElementById('mg-icon').innerHTML = getAnimeIcon(meta.id);
  document.getElementById('mg-title').textContent = meta.name;
  document.getElementById('mg-gameover').classList.add('hidden');
  document.getElementById('minigame-hud').classList.remove('hidden');

  document.getElementById('top-hud').classList.add('hidden');
  document.getElementById('world-prompt').classList.add('hidden');
  document.getElementById('emote-bar').classList.add('hidden');
  document.getElementById('world-controls-hint').classList.add('hidden');
  document.getElementById('mobile-world-controls').classList.add('hidden');
  document.getElementById('games-modal').classList.add('hidden');

  const ctx = {
    canvas,
    youId,
    playersMap,
    initialGame: game,
    shake(power = 0.12, dur = 0.22) {
      pipeline.triggerShake(power, dur);
    },
    sendAction(payload) {
      socket.emit('game:action', payload);
    },
    setScoreHTML(html) {
      document.getElementById('mg-scoreboard').innerHTML = html;
    },
    setStatus(text) {
      document.getElementById('mg-status-banner').textContent = text;
    },
    mountUI(htmlOrNode) {
      const box = document.getElementById('mg-custom-ui');
      if (typeof htmlOrNode === 'string') {
        box.innerHTML = htmlOrNode;
      } else {
        box.innerHTML = '';
        if (htmlOrNode) box.appendChild(htmlOrNode);
      }
    },
  };

  activeMinigame = new Cls(ctx);
}

function disposeActiveMinigame() {
  if (activeMinigame) {
    activeMinigame.dispose?.();
    activeMinigame = null;
    activeGameId = null;
  }
  document.getElementById('minigame-hud').classList.add('hidden');
  document.getElementById('mg-custom-ui').innerHTML = '';
  document.getElementById('mg-gameover').classList.add('hidden');

  if (youId) {
    document.getElementById('top-hud').classList.remove('hidden');
    document.getElementById('emote-bar').classList.remove('hidden');
    syncWorldControlsVisibility();
  }
}

// ==================== EVENTOS DE REDE ====================

socket.on('room:joined', ({ youId: id, roomCode, character }) => {
  youId = id;
  selectedChar = character;

  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('top-hud').classList.remove('hidden');
  document.getElementById('emote-bar').classList.remove('hidden');
  document.getElementById('hud-room-code').textContent = roomCode;

  syncWorldControlsVisibility();

  world.setMode('explore');
  showToast(`Bem-vindo(a) à Ilha 3D, ${character === 'maria' ? 'Maria' : 'Mauricio'}!`);
});

socket.on('room:error', ({ message }) => showToast(message));
socket.on('room:notice', ({ message }) => showToast(message));

socket.on('room:state', (state) => {
  roomState = state;
  playersMap.clear();
  for (const p of state.players) playersMap.set(p.id, p);

  // Party Bar JRPG com os Retratos 2D Anime reais da Maria e do Mauricio!
  const bar = document.getElementById('hud-players-bar');
  bar.innerHTML = state.players.map((p) => {
    const portrait = p.character === 'maria' ? './assets/ui/maria_portrait.jpg' : './assets/ui/mauricio_portrait.jpg';
    return `
      <div class="player-chip ${p.character}">
        <img src="${portrait}" alt="${p.name}" />
        <span>${p.name}</span>
      </div>
    `;
  }).join('');

  const humanCount = state.players.filter((p) => !p.isBot).length;
  const botBtn = document.getElementById('btn-bot-toggle');
  const botLbl = botBtn?.querySelector('.lbl');
  if (humanCount === 1) {
    botBtn.classList.remove('hidden');
    if (botLbl) botLbl.textContent = state.hasBot ? 'Dispensar IA' : 'Chamar IA';
  } else {
    botBtn.classList.add('hidden');
  }

  world.setMood(state.mood);
  world.syncPlayers(state.players, youId);
  world.updateScoreboards(state.wins);

  const chatBox = document.getElementById('chat-messages');
  if (chatBox && chatBox.childElementCount === 0 && state.chat?.length) {
    state.chat.forEach(appendChatItem);
  }

  if (state.game) {
    if (!activeMinigame || activeGameId !== state.game.id) {
      mountMinigame3D(state.game);
    } else {
      activeMinigame.onState(state.game);
    }

    if ((state.game.winner || state.game.draw) && gameOverShownForId !== state.game.id) {
      gameOverShownForId = state.game.id;
      const g = state.game;
      const won = g.winner === youId;
      audio.play(won || g.draw ? 'win' : 'lose');

      setTimeout(() => {
        if (!activeMinigame || activeGameId !== g.id) return;
        document.getElementById('mg-gameover-icon').innerHTML = getAnimeIcon(g.draw ? 'heart' : 'trophy');
        document.getElementById('mg-gameover-title').textContent = g.draw
          ? (g.type === 'sintonia' ? `${g.compatibility ?? 100}% de Sintonia!` : 'Empate!')
          : `${playersMap.get(g.winner)?.name || 'Vencedor'} Venceu!`;
        document.getElementById('mg-gameover-sub').textContent = g.msg || '';
        document.getElementById('mg-gameover').classList.remove('hidden');
      }, 950);
    }
  } else if (activeMinigame) {
    disposeActiveMinigame();
  }
});

socket.on('world:pose', (pose) => {
  world.applyRemotePose(pose);
});

function appendChatItem(msg) {
  const box = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-item';
  const strong = document.createElement('strong');
  strong.className = msg.character === 'maria' ? 'maria' : 'mauricio';
  strong.textContent = `${msg.name}: `;
  const span = document.createElement('span');
  span.textContent = msg.text;
  div.append(strong, span);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

socket.on('chat:msg', (msg) => {
  appendChatItem(msg);
  world.showChatBubble(msg.id, msg.text);
  audio.play('chat');
  if (document.getElementById('chat-drawer').classList.contains('hidden') && msg.id !== youId) {
    document.getElementById('chat-unread')?.classList.remove('hidden');
  }
});

socket.on('emote:fx', ({ id, emoji }) => {
  audio.play('emote');
  const svgKey = EMOTE_SVG_BY_CHAR[emoji];
  world.triggerPlayerEmote(id, emoji, svgKey ? getAnimeIcon(svgKey) : null);
});

socket.on('game:tick', (data) => {
  activeMinigame?.onTick?.(data);
});

socket.on('game:event', (ev) => {
  activeMinigame?.onEvent?.(ev);
});

// ==================== LOOP DE RENDERIZAÇÃO 60 FPS ====================

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  pipeline.setSize(w, h);
  world.onResize(w, h);
  activeMinigame?.onResize?.(w, h);
  syncWorldControlsVisibility();
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;

  if (activeMinigame) {
    activeMinigame.update(dt, elapsed);
    pipeline.render(activeMinigame.scene, activeMinigame.camera, dt);
  } else {
    world.update(dt, elapsed);
    pipeline.render(world.scene, world.camera, dt);
  }
}
animate();
