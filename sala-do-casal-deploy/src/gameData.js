// Dados compartilhados do servidor: pista de Kart 3D, perguntas, palavras e desenhos vetoriais da IA

// Curva fechada suave (Catmull-Rom) para a pista 3D de Kart
const CONTROL_PTS = [
  [0, -28], [22, -28], [38, -18], [42, 0],
  [36, 18], [20, 26], [4, 20], [-8, 26],
  [-26, 28], [-40, 18], [-42, 0], [-36, -18],
  [-22, -28],
];

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

function buildKartTrack(samples = 160) {
  const n = CONTROL_PTS.length;
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const u = (i / samples) * n;
    const seg = Math.floor(u) % n;
    const t = u - Math.floor(u);
    const p0 = CONTROL_PTS[(seg - 1 + n) % n];
    const p1 = CONTROL_PTS[seg];
    const p2 = CONTROL_PTS[(seg + 1) % n];
    const p3 = CONTROL_PTS[(seg + 2) % n];
    pts.push(catmullRom(p0, p1, p2, p3, t));
  }
  const spine = pts.map((p, i) => {
    const prev = pts[(i - 1 + samples) % samples];
    const next = pts[(i + 1) % samples];
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    const nx = -tz;
    const nz = tx;
    return { x: +p[0].toFixed(3), z: +p[1].toFixed(3), tx: +tx.toFixed(4), tz: +tz.toFixed(4), nx: +nx.toFixed(4), nz: +nz.toFixed(4) };
  });

  const boostIndices = [24, 66, 108, 142];
  const boosts = boostIndices.map((idx, k) => {
    const s = spine[idx];
    const side = k % 2 === 0 ? 2.1 : -2.1;
    return {
      id: k,
      seg: idx,
      x: +(s.x + s.nx * side).toFixed(2),
      z: +(s.z + s.nz * side).toFixed(2),
      angle: Math.atan2(s.tx, s.tz),
    };
  });

  return {
    halfWidth: 4.8,
    wallHalfWidth: 5.7,
    checkpoints: [0, 40, 80, 120],
    spine,
    boosts,
    controlPts: CONTROL_PTS,
  };
}

const KART_TRACK = buildKartTrack(160);

const MEMORY_THEMES = [
  { id: 'heart', icon: '💖', label: 'Amor', color: '#ff4d8d' },
  { id: 'star', icon: '🌟', label: 'Estrela', color: '#ffb703' },
  { id: 'moon', icon: '🌙', label: 'Lua', color: '#7b61ff' },
  { id: 'rose', icon: '🌹', label: 'Rosa', color: '#e63946' },
  { id: 'pizza', icon: '🍕', label: 'Pizza', color: '#fb8500' },
  { id: 'music', icon: '🎵', label: 'Música', color: '#00b4d8' },
  { id: 'ring', icon: '💍', label: 'Anel', color: '#ffd166' },
  { id: 'strawberry', icon: '🍓', label: 'Morango', color: '#ff5d8f' },
];

const COUPLE_QUESTIONS = [
  'Quem é mais provável de dormir no meio do filme?',
  'Quem demora mais tempo se arrumando para sair?',
  'Quem é mais romântico(a) no dia a dia?',
  'Quem fica mais bravo(a) quando está com fome?',
  'Quem pede desculpas primeiro depois de uma teimosia?',
  'Quem gasta mais com besteirinhas na internet?',
  'Quem chora mais fácil assistindo filme ou série?',
  'Quem é mais ciumento(a) (mesmo negando)?',
  'Quem escolhe melhor onde comer?',
  'Quem canta mais alto no chuveiro ou no carro?',
  'Quem se atrasa mais para os compromissos?',
  'Quem é mais carinhoso(a) e grudento(a)?',
  'Quem manda mais memes durante o dia?',
  'Quem cozinha o prato mais gostoso?',
  'Quem teria mais chance de sobreviver num apocalipse zumbi?',
  'Quem disse "eu te amo" primeiro?',
  'Quem é mais esquecido(a) com chaves, celular ou datas?',
  'Quem ri nas horas mais erradas?',
];

const DRAW_WORDS = [
  // Nível 1 (1 estrela)
  [
    'coração', 'sol', 'lua', 'casa', 'flor', 'estrela',
    'gato', 'peixe', 'árvore', 'bola', 'nuvem', 'anel',
  ],
  // Nível 2 (2 estrelas)
  [
    'pizza', 'sorvete', 'balão', 'carro', 'foguete', 'guarda-chuva',
    'violão', 'praia', 'bolo', 'borboleta', 'barco', 'castelo',
  ],
  // Nível 3 (3 estrelas)
  [
    'arco-íris', 'pôr do sol', 'montanha-russa', 'astronauta',
    'dinossauro', 'lua de mel', 'acampamento', 'ilha deserta',
  ],
];

// Desenhos vetoriais (0..1 UV) para quando o parceiro IA for o desenhista no Ateliê 3D!
function circlePts(cx, cy, r, steps = 28, a0 = 0, a1 = Math.PI * 2) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([+(cx + Math.cos(a) * r).toFixed(3), +(cy + Math.sin(a) * r).toFixed(3)]);
  }
  return out;
}

const AI_SKETCHES = {
  'coração': [
    { color: '#ef4444', size: 10, pts: (() => {
      const p = [];
      for (let i = 0; i <= 40; i++) {
        const t = (i / 40) * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        p.push([+(0.5 + x * 0.017).toFixed(3), +(0.48 + y * 0.017).toFixed(3)]);
      }
      return p;
    })() },
    { color: '#fda4af', size: 6, pts: [[0.38, 0.36], [0.35, 0.42], [0.37, 0.48]] },
  ],
  'sol': [
    { color: '#f59e0b', size: 12, pts: circlePts(0.5, 0.5, 0.17) },
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
      const a = (k * Math.PI) / 4;
      return {
        color: '#fbbf24',
        size: 7,
        pts: [[+(0.5 + Math.cos(a) * 0.23).toFixed(3), +(0.5 + Math.sin(a) * 0.23).toFixed(3)],
              [+(0.5 + Math.cos(a) * 0.35).toFixed(3), +(0.5 + Math.sin(a) * 0.35).toFixed(3)]],
      };
    }),
  ],
  'lua': [
    { color: '#facc15', size: 10, pts: circlePts(0.48, 0.5, 0.24, 24, -Math.PI * 0.65, Math.PI * 0.65) },
    { color: '#facc15', size: 10, pts: circlePts(0.58, 0.47, 0.19, 24, -Math.PI * 0.72, Math.PI * 0.78) },
    { color: '#fde047', size: 5, pts: [[0.28, 0.28], [0.30, 0.24], [0.32, 0.28], [0.27, 0.26], [0.33, 0.26], [0.28, 0.28]] },
  ],
  'casa': [
    { color: '#f97316', size: 9, pts: [[0.26, 0.48], [0.5, 0.22], [0.74, 0.48], [0.26, 0.48]] },
    { color: '#3b82f6', size: 9, pts: [[0.31, 0.48], [0.31, 0.78], [0.69, 0.78], [0.69, 0.48]] },
    { color: '#78350f', size: 8, pts: [[0.45, 0.78], [0.45, 0.59], [0.55, 0.59], [0.55, 0.78]] },
    { color: '#facc15', size: 6, pts: [[0.36, 0.55], [0.41, 0.55], [0.41, 0.61], [0.36, 0.61], [0.36, 0.55]] },
  ],
  'flor': [
    { color: '#22c55e', size: 9, pts: [[0.5, 0.52], [0.5, 0.84]] },
    { color: '#22c55e', size: 8, pts: [[0.5, 0.70], [0.62, 0.63], [0.54, 0.73]] },
    ...[0, 1, 2, 3, 4].map((k) => {
      const a = (k * Math.PI * 2) / 5;
      return { color: '#ec4899', size: 10, pts: circlePts(0.5 + Math.cos(a) * 0.12, 0.4 + Math.sin(a) * 0.12, 0.08, 16) };
    }),
    { color: '#facc15', size: 12, pts: circlePts(0.5, 0.4, 0.07, 16) },
  ],
  'estrela': [
    { color: '#fbbf24', size: 10, pts: (() => {
      const p = [];
      for (let i = 0; i <= 10; i++) {
        const r = i % 2 === 0 ? 0.28 : 0.12;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        p.push([+(0.5 + Math.cos(a) * r).toFixed(3), +(0.5 + Math.sin(a) * r).toFixed(3)]);
      }
      return p;
    })() },
  ],
  'árvore': [
    { color: '#78350f', size: 12, pts: [[0.47, 0.56], [0.47, 0.82], [0.53, 0.82], [0.53, 0.56]] },
    { color: '#22c55e', size: 12, pts: circlePts(0.5, 0.36, 0.16, 20) },
    { color: '#16a34a', size: 11, pts: circlePts(0.39, 0.45, 0.12, 18) },
    { color: '#16a34a', size: 11, pts: circlePts(0.61, 0.45, 0.12, 18) },
  ],
  'peixe': [
    { color: '#06b6d4', size: 9, pts: circlePts(0.46, 0.5, 0.18, 24) },
    { color: '#06b6d4', size: 9, pts: [[0.64, 0.5], [0.78, 0.36], [0.78, 0.64], [0.64, 0.5]] },
    { color: '#111827', size: 6, pts: circlePts(0.36, 0.46, 0.02, 8) },
  ],
  'pizza': [
    { color: '#f59e0b', size: 9, pts: [[0.5, 0.22], [0.26, 0.76], [0.74, 0.76], [0.5, 0.22]] },
    { color: '#b45309', size: 11, pts: [[0.26, 0.76], [0.5, 0.81], [0.74, 0.76]] },
    { color: '#ef4444', size: 9, pts: circlePts(0.48, 0.48, 0.04, 12) },
    { color: '#ef4444', size: 9, pts: circlePts(0.41, 0.64, 0.04, 12) },
    { color: '#ef4444', size: 9, pts: circlePts(0.57, 0.63, 0.04, 12) },
  ],
  'sorvete': [
    { color: '#d97706', size: 8, pts: [[0.38, 0.52], [0.5, 0.84], [0.62, 0.52], [0.38, 0.52]] },
    { color: '#ec4899', size: 11, pts: circlePts(0.5, 0.42, 0.13, 22) },
    { color: '#ef4444', size: 7, pts: circlePts(0.5, 0.27, 0.03, 10) },
  ],
  'foguete': [
    { color: '#e11d48', size: 8, pts: [[0.5, 0.18], [0.4, 0.36], [0.6, 0.36], [0.5, 0.18]] },
    { color: '#3b82f6', size: 8, pts: [[0.4, 0.36], [0.4, 0.66], [0.6, 0.66], [0.6, 0.36]] },
    { color: '#e11d48', size: 8, pts: [[0.4, 0.56], [0.3, 0.70], [0.4, 0.66]] },
    { color: '#e11d48', size: 8, pts: [[0.6, 0.56], [0.7, 0.70], [0.6, 0.66]] },
    { color: '#f97316', size: 9, pts: [[0.44, 0.67], [0.5, 0.84], [0.56, 0.67]] },
  ],
  'anel': [
    { color: '#eab308', size: 10, pts: circlePts(0.5, 0.58, 0.18, 26) },
    { color: '#38bdf8', size: 8, pts: [[0.42, 0.38], [0.5, 0.25], [0.58, 0.38], [0.5, 0.42], [0.42, 0.38]] },
  ],
};

module.exports = {
  KART_TRACK,
  MEMORY_THEMES,
  COUPLE_QUESTIONS,
  DRAW_WORDS,
  AI_SKETCHES,
};
