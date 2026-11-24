# Ilha do Casal 3D — regras do projeto

Jogo web 3D para duas pessoas (Maria e Mauricio) jogarem juntas: um mundo onde os dois
andam, conversam por chat e entram em **9 minigames 3D** espalhados pelo mapa.

Stack: Node.js + Express + Socket.IO (`server.js`, `src/`), Three.js no cliente
(`public/js/`), sem framework de front-end. Roda no navegador do computador **e do celular**.

Direção de arte: **Anime / JRPG**, com `MeshToonMaterial`, névoa e presets de clima
(`MOOD_PRESETS` em `public/js/world3d.js`).

```
server.js                  servidor, salas, autoridade das partidas
src/aiPartner.js           o robô que joga sozinho
src/gameData.js            dados dos minigames
public/index.html          toda a interface (HUD, menus, modais)
public/css/style.css       estilo da interface
public/js/world3d.js       o mundo 3D (classe CoupleIslandWorld)
public/js/graphics.js      renderer, luz, pós-processamento
public/js/physics3d.js     física e colisão
public/js/characters.js    Maria e Mauricio (modelos .glb + animação)
public/js/propLoader.js    carrega os props de public/models/props/
public/js/main.js          laço principal, controles, cola tudo
public/js/games/*.js       os 9 minigames
```

---

## As 3 regras que não se quebram

### 1. Nunca quebrar o que já funciona
O jogo está jogável. Toda mudança parte disso.
- Antes de mexer em algo que funciona, **reproduza o problema**. Sem falha reproduzida, não há conserto a fazer.
- Não refatore código que está funcionando só porque daria para escrever melhor.
- Uma mudança por vez, com um "pronto" claro. Nada de mexer em cinco coisas e torcer.

### 2. Ver com os próprios olhos
**Não existe "deve funcionar".** Mudou algo visível? Abra o jogo no navegador e olhe.
- Rode `npm start`, abra `http://localhost:3000`, entre numa sala, faça a ação, **tire print**.
- Bug visual só se confirma com imagem. Bug de lógica, com valor medido.
- Se não deu para verificar (animação travada, precisa de 2 pessoas, precisa de celular de verdade),
  **diga que não verificou**. Nunca afirme que está pronto sem ter visto.

### 3. Relatar honestamente
- Se o teste falhou, mostre a saída do erro.
- Se pulou uma etapa, diga qual.
- Se não tem certeza, diga que não tem certeza. Chute apresentado como fato é o pior resultado possível.

---

## Para onde o jogo está indo

Três objetivos abertos. Avance neles aos poucos, nunca todos de uma vez.

1. **O mapa cresce e vira uma cidade pequena** — ver `docs/CIDADE.md`
2. **O HUD fica com cara de GTA: limpo e com poucos elementos** — ver `docs/HUD.md`
3. **A jogabilidade melhora estudando mundo aberto de verdade** — ver `docs/REFERENCIAS.md`

O histórico de cada passada fica em `docs/DIARIO.md`. **Leia antes de começar** — evita
consertar duas vezes a mesma coisa e mostra o que ficou sem verificar.

---

## Limites de desempenho (isso é um jogo web, não um PC gamer)

A cidade **não pode** derrubar o FPS no celular. Orçamento por quadro:

| | Alvo | Teto |
|---|---|---|
| FPS no celular | 60 | nunca abaixo de 30 |
| Draw calls | < 150 | 250 |
| Triângulos na tela | < 150 mil | 300 mil |
| Download total | < 10 MB | 15 MB |
| Personagem | 20 mil tris | 25 mil |

Hoje os dois personagens já custam ~3,6 MB (`public/models/maria.glb` e `mauricio.glb`).
Props novos entram no orçamento que sobra.

Como manter isso:
- **Instanciar** o que se repete (prédios, postes, árvores, barraquinhas): `InstancedMesh`.
  O projeto já tem um kit grande em `public/models/props/` — **reaproveite, não baixe mais**.
- **Reaproveitar geometrias e materiais.** Dez prédios iguais = um material, uma geometria.
  O `propLoader.js` já existe para isso: carregue uma vez, clone.
- **Névoa + distância de corte** da câmera escondem o fim do mundo e cortam o que está longe.
  A névoa já está no mundo (`MOOD_PRESETS`) — use, é de graça.
- Poucos materiais, texturas pequenas (512 ou 1024), atlas quando der.
- Nada de sombra dinâmica em tudo: sombra "borrão" no chão já resolve.
- **Meça antes e depois.** Se uma mudança custou FPS, ou se justifica ou volta atrás.

---

## Estética (não negociar sem avisar)

Visual **anime / JRPG toon**:
- `MeshToonMaterial` em tudo — personagem e cenário recebem o mesmo tratamento
- Névoa colorida e céu em degradê, trocados pelos presets de clima
- Cores saturadas e harmônicas, luz direcional forte com preenchimento frio
- Os filtros opcionais (CRT, PS2) são **efeito do jogador**, não a estética base.
  Tudo tem de ficar bonito com eles desligados.

Personagens: modelos `.glb` com esqueleto, em `public/models/`. Animação em
`public/js/characters.js`.

---

## Como escrever código aqui

- **Comentário explica o porquê, não o quê.** `// evita a textura esticar na vertical` vale;
  `// loop sobre os vértices` não vale.
- Em português, como o resto do projeto.
- Siga o estilo do arquivo que você está editando. `world3d.js` tem 57 KB — ler antes de mexer.
- Nada de dependência nova sem necessidade real. O projeto tem 3 (`express`, `socket.io`,
  `three`) e está bom assim.
- O servidor é a autoridade das partidas. Nada de confiar em posição ou pontuação vinda do
  cliente sem validar.
- Nada de modelo, textura ou som de jogo comercial. Só CC0 / domínio público
  (ver `FONTES-MODELOS-3D.md`) ou feito aqui.

### Armadilhas já conhecidas (não repetir)

Estas custaram tempo neste jogo:

- **Animação com "canto" na curva.** `Math.max`, `Math.abs` e `clamp` no meio de uma animação
  criam tranco visível. Use curvas contínuas (senos/cossenos) e `tanh` para saturar.
- **Suavização por quadro.** `lerp(a, b, 0.2)` roda mais rápido em 144 fps do que em 30.
  Use `1 - Math.exp(-k * dt)`.
- **Medir orientação no espaço do mundo.** O boneco pode entrar na cena já girado; medir no
  mundo inverte o sinal e o personagem anda de costas. Meça no espaço do próprio modelo.
- **Textura sem `RepeatWrapping`.** UV maior que 1 fica "esticada" em vez de repetir.
- **Modelo de IA com textura emissiva.** Geradores exportam a cor em `emissiveMap`, não em
  `map`. Aceite as duas, senão o personagem aparece branco.
- **Objeto preso ao osso que some.** Se o `.glb` ainda está carregando, você prendeu a raquete
  no boneco provisório. Espere o modelo ficar pronto antes de prender qualquer coisa.
- **Cache de módulo no navegador.** Depois de editar um `.js`, recarregue de verdade antes de
  concluir que a correção não funcionou.
- **Painel do navegador escondido.** O navegador limita o `requestAnimationFrame` de aba que
  não está à vista, e tudo parece travado. Traga a janela para a frente antes de julgar
  qualquer coisa que se mexe.

---

## Celular é cidadão de primeira classe

Metade do tempo de jogo é no celular. Toda tela nova precisa:
- Alvos de toque com no mínimo 44 px
- Nada de elemento essencial embaixo do dedo que está no joystick (canto inferior esquerdo)
  nem embaixo do botão de pulo (canto inferior direito)
- Funcionar em pé (retrato) e deitado
- Respeitar a área segura do iPhone (`env(safe-area-inset-*)`)
- Sem zoom acidental ao tocar duas vezes

---

## O que fazer quando travar

Se bater numa decisão que muda o rumo do jogo (trocar de engine, mexer no protocolo de rede,
descartar um minigame, refazer o mundo do zero), **pare e pergunte**. Não decida sozinho.
