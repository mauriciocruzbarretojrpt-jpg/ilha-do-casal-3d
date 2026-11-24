# A cidade

Hoje o mapa é uma **ilha** com praia, café, ponte e os minigames em volta
(`CoupleIslandWorld`, em `public/js/world3d.js`). O objetivo é ela crescer e virar uma
**cidadezinha** — com bairros, ruas e os jogos virando lugares da cidade.

> **Pequena mesmo.** Uma cidade que dá para atravessar a pé em **40 a 60 segundos**.
> Grande demais num jogo de duas pessoas é só distância entre vocês dois.
>
> A ilha **não** é descartada: ela vira o litoral da cidade. Crescer para dentro, não
> começar de novo.

---

## O que a cidade precisa ter

### 1. Três marcos grandes, visíveis de longe

É assim que a pessoa se orienta sem olhar o mapa. GTA V faz a cidade inteira com três
silhuetas dominantes; se você enche o horizonte de marcos médios, nenhum vira referência.

| Marco | Para que serve |
|---|---|
| **Torre / prédio alto no centro** | o "norte" da cidade, visível de qualquer lugar |
| **Praça do casal** (o coreto / `gazebo.glb` + a fonte) | ponto de encontro e de voltar |
| **A praia e o farol na borda** | dá limite ao mundo sem parede invisível |

Regra: de qualquer ponto da cidade, **pelo menos um marco tem de estar à vista.**

### 2. Bairros com cara diferente

Três ou quatro, cada um com paleta e silhueta próprias, para a pessoa saber onde está
só pela cor:

- **Centro** — prédios, lojinhas, poste, asfalto (o pacote `fantasy-town` serve)
- **Residencial** — casas baixas, muito verde, cerca (`fence.glb`), calçada larga
- **Orla** — areia, palmeira (`palm_1/2.glb`), quiosque, céu mais aberto (**é o que já existe**)
- **Praça / parque** — grama, árvore, banco (`bench_cozy.glb`), fonte (`fountain.glb`)

Nas fronteiras, misture: uma rua de transição em vez de um corte seco. A **ponte** que já
existe é um bom corte natural entre dois bairros.

### 3. Os minigames viram lugares, não fliperamas

Cada jogo no lugar onde ele faria sentido na cidade:

| Jogo | Lugar na cidade | Props que já existem |
|---|---|---|
| Tênis | quadra no parque | `grandstand.glb`, `fence.glb` |
| Corrida | kartódromo na borda | `kart_*.glb`, `barrier_*.glb`, `flag_checkers.glb` |
| Sinuca | bar / salão no centro | `chair_cafe.glb`, `table_round.glb` |
| Ateliê (desenhar) | muro de grafite / ateliê | `market_stand_*.glb` |
| Palco | palco na praça | `stall_*.glb`, `lantern.glb` |
| Memória, Ligue 4, Velha, Pedra-Papel-Tesoura | mesinhas de café na praça | `table_round.glb`, `chair_cafe.glb` |

O fliperama (`arcade.glb`, `mini-arcade/`) **não precisa sumir** — virou uma lojinha de
fliperama no centro, com os jogos de mesa dentro. Mas chegar perto do lugar é o convite
principal (ver `docs/HUD.md`). O menu `☰ Jogos` continua existindo como atalho, escondido.

### 4. Ruas que levam a algum lugar

- Ruas **curvas**, não grade quadrada: a curva esconde o que vem depois e dá vontade de ir ver.
- Da praça dá para chegar a qualquer bairro **sem precisar de mapa**.
- Nada de rua que não leva a nada. Todo caminho termina num jogo, num marco ou numa vista.
- Atalhos: beco, escada, a ponte. Quem descobre se sente esperto.

### 5. Vida (é isso que faz parecer cidade, não cenário)

Barato e com efeito enorme:
- Carros parados na rua (`props/car/`, via `InstancedMesh` — zero custo de lógica)
- 4 a 6 pessoas andando em caminho fixo, em loop
- Pássaro, folha voando, luz de poste piscando
- Som ambiente por bairro: trânsito no centro, onda na orla, passarinho no parque
  (`public/js/audio.js`)
- O ciclo de clima/luz que já existe (`MOOD_PRESETS`) passando devagar sozinho

---

## Como construir sem derrubar o FPS

Os limites valem: **60 FPS no celular, < 150 draw calls, < 150 mil triângulos.**
Uma cidade cabe nisso se for construída assim:

1. **Kit de peças, não modelos únicos.** O projeto já tem ~40 props em
   `public/models/props/`. Umas 10 peças reaproveitadas com escala e rotação diferentes
   fazem uma cidade inteira. **Não baixe mais** antes de esgotar o que tem.
2. **`InstancedMesh` para tudo que repete.** 200 prédios de 1 geometria = 1 draw call.
   O `propLoader.js` já carrega e clona — faça ele instanciar em vez de clonar o que repete muito.
3. **Uma textura de atlas** para o kit, em vez de uma por peça.
4. **Névoa + `camera.far` curto.** Já existe névoa no mundo. Esconde o fim do mapa e corta
   o que está longe — e a névoa toon fica bonita, não parece limitação.
5. **Dividir em setores** e só desenhar os setores perto. Não precisa de octree: uma
   grade de células e checar distância já resolve.
6. **Colisão separada da arte.** Caixas invisíveis simples em `physics3d.js`, nunca a malha
   do prédio.
7. **Chão em pedaços grandes**, não um plano gigante com textura esticada.

**Faça por partes e meça cada uma.** Um bairro, mede. Outro bairro, mede. Se o FPS caiu
abaixo de 50 no celular, resolve antes de acrescentar o próximo.

---

## Ordem de construção sugerida

1. **Reorganizar o que já existe** em praça + parque + orla, com os 9 jogos espalhados ali.
   Nada de geometria nova nesta etapa — o jogo continua jogável do começo ao fim.
2. Acrescentar o **centro** com a torre, o bar e a lojinha de fliperama.
3. Acrescentar o **residencial** e as ruas que ligam tudo.
4. Mover a **corrida** para um kartódromo de verdade na borda.
5. Só então: vida, som por bairro, ciclo de luz andando sozinho.

**Em nenhuma etapa o jogo pode ficar injogável.** Se uma etapa quebra os minigames,
ela está grande demais — divida.
