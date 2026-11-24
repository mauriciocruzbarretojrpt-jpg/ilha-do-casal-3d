# O HUD

Estética **GTA**: limpo, nos cantos, quase nada no meio. E o pedido é explícito —
**menos elementos na tela, nada poluído.**

> **A regra que decide tudo:** um elemento só fica na tela se a pessoa **precisa dele agora**.
> Todo o resto aparece quando importa e sai quando não importa mais.
> Foi assim que o GTA resolveu: a barra de vida não fica sempre lá, ela aparece ao tomar dano.

Tudo isto é `public/index.html` + `public/css/style.css`.

---

## Andando pela cidade — só isto na tela

```
┌──────────────────────────────────────────────┐
│                                              │
│                                              │
│                                              │
│                                              │
│                                              │
│  ╭──────╮                                    │
│  │ mapa │                        [💬]  [⚙]  │
│  ╰──────╯                                    │
└──────────────────────────────────────────────┘
```

**Três coisas. É isso.**

| Elemento | Onde | Observação |
|---|---|---|
| Minimapa | canto inferior esquerdo | círculo, com seta sua e seta dela — **ainda não existe, criar** |
| Chat | canto inferior direito, **recolhido** | `chat-drawer`, abre ao tocar, fecha sozinho |
| Botão de opções | canto inferior direito | **um** ícone que abre som, música, clima, CRT/PS2, tela cheia |

No celular, mais o joystick (esquerda, por cima do mapa) e o botão de pulo (direita).

### O minimapa

- **Círculo**, não retângulo. Ocupa pouco e cabe no canto.
- Gira com a câmera, com a sua seta sempre no centro.
- Mostra: você, ela, e os pontos de jogo como ícones simples.
- **Sem nome escrito em cima**, sem legenda, sem bússola com números.
- Como fazer barato: uma segunda `OrthographicCamera` olhando de cima para um
  `renderTarget` pequeno (256 px), desenhada num `<canvas>` recortado em círculo. Ou,
  mais barato ainda, desenhar à mão num canvas 2D a partir das posições — sem render extra.
  **Meça as duas** antes de escolher; o minimapa não pode custar 10 FPS.
- No celular pode ficar menor ainda — ou esconder dentro dos minigames.

---

## O que aparece só quando precisa

| Aparece | Quando | Sai quando |
|---|---|---|
| **Convite para jogar** (`world-prompt`) | você está perto do lugar | você se afasta |
| **Nome dela** | ela está na tela e perto | ela sai de perto |
| **Balão de fala** | ela mandou mensagem | 4 segundos depois |
| **Nome do bairro** | você entra num bairro novo | 2 segundos depois, desaparecendo |
| **Código da sala** | nos primeiros 10 s, ou no menu de opções | depois disso, nunca |
| **Placar** (`mg-scoreboard`) | dentro de um minigame | ao sair do minigame |

Tudo isso **entra e sai desaparecendo em uns 0,25 s**, nunca piscando. Elemento que
aparece de repente é mais poluição do que informação.

### O convite para jogar

Em vez de uma barra no rodapé da tela, o convite fica **perto da coisa** — flutuando acima
da quadra, do bar, da mesa (um `Sprite` ou um `CSS2DObject` no mundo 3D).
É assim que a pessoa associa o lugar ao jogo.

```
        ╭───────────────╮
        │  🎾  Tênis    │
        │  Maria 3 × 2  │     <- o placar do casal, pequeno
        ╰───────────────╯
              [ E ]           <- ou "toque" no celular
```

O jogo já desenha placar em cartaz no mundo (`makeScoreSignCanvas` em `world3d.js`) —
o caminho já está aberto, é só o convite ir para lá também.

---

## Dentro de um minigame

O HUD do mundo **sai inteiro**. Fica só o que aquele jogo precisa:
placar, tempo se tiver, o controle do jogo e um `✕` para sair (`btn-leave-game`).

Nada de minimapa, nada de chat aberto, nada de contador de FPS.

---

## Estilo visual do HUD

Para combinar com o toon anime e com a cara de GTA:

- **Sem caixa cinza translúcida atrás do texto.** Texto direto na tela com **contorno
  escuro** (`text-shadow` de 2 px em volta) — lê em qualquer fundo e não suja a imagem.
- Fonte **sem serifa, pesada, levemente condensada**, caixa alta nos rótulos curtos.
- Paleta: branco, preto do contorno, e **uma** cor de destaque (o rosa do casal).
  Não três cores de destaque.
- Ícone chapado, sem gradiente, sem brilho, sem sombra solta.
- Números grandes, rótulo pequeno. `3 — 2` grande, "PLACAR" minúsculo em cima, se precisar.
- Margem da borda da tela: **24 px no PC**; no celular 16 px **mais** a área segura
  (`env(safe-area-inset-*)`).

---

## O que remover do HUD atual

O `index.html` hoje tem isto sempre na tela. A barra de cima (`top-hud`) é o alvo principal:

| Hoje | Vai para |
|---|---|
| `hud-room-pill` / `hud-room-code` | só nos primeiros 10 s, depois no menu de opções |
| `hud-players-bar` | sai da tela fixa — o nome aparece sobre a cabeça de quem está perto |
| `showcase-pill` / `showcase-text` | sai, ou vira o aviso de bairro que desaparece |
| `btn-sound`, `btn-music`, `btn-mood`, `btn-menu-crt`, `btn-ps2-filter`, `btn-fullscreen`, `btn-cam-couple` | **um** botão `⚙` que abre tudo isso num painelzinho |
| `btn-games-drawer` (`☰ Jogos`) | fica, mas discreto — o caminho normal é chegar perto do lugar |
| `world-controls-hint` | primeiros 10 segundos e nunca mais |
| `chat-drawer` aberto | recolhido, com a bolinha `chat-unread` avisando |

São **7 botões virando 1**. É aqui que a tela despolui de verdade.

Nada disso perde função: continua tudo acessível, só não ocupando tela enquanto a pessoa
está andando.

## Checklist antes de aceitar um HUD novo

- [ ] Andando pela cidade, dá para contar os elementos na tela nos dedos de uma mão?
- [ ] Tirando cada elemento, a pessoa perde algo de verdade? Se não, tire.
- [ ] No celular, em pé, nada fica embaixo do dedo do joystick nem do botão de pulo?
- [ ] Todo texto lê sobre fundo claro **e** escuro (praia de dia e noite)?
- [ ] Nada aparece ou desaparece piscando?
- [ ] O minimapa custou menos de 3 FPS? (mediu?)
