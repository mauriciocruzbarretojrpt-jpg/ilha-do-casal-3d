# ✦ Ilha do Casal 3D — ふたりの島 (Maria & Mauricio)

Jogo multiplayer online em **3D** (PC + Mobile iOS/Android) feito com **Three.js + Node.js + Socket.IO**, com direção de arte **Anime / JRPG**, física 3D sólida, captura de movimento óptica real nos modelos da **Maria** e do **Mauricio**, cenários em domínio público (CC0) e **9 minigames 3D completos**.

---

## 🚀 Como subir no GitHub

Abra o terminal dentro desta pasta (`sala-do-casal`) e rode:

```bash
git init
git add .
git commit -m "feat: Ilha do Casal 3D Anime Edition (PC + Mobile)"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

---

## ☁️ Como hospedar gratuitamente no Render (`render.com`)

Este repositório já inclui o arquivo **`render.yaml`** configurado com *WebSockets* (Socket.IO) e `/healthz`! Você pode hospedar de duas formas:

### Opção A — Deploy Automático com 1 Clique (Blueprint)
1. Acesse [https://dashboard.render.com](https://dashboard.render.com) e clique em **New +** → **Blueprint**.
2. Conecte o seu repositório do GitHub.
3. O Render lerá automaticamente o arquivo `render.yaml` e criará o serviço gratuito!

### Opção B — Web Service Manual
1. No painel do Render, clique em **New +** → **Web Service** e escolha o repositório do GitHub.
2. Preencha:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
3. Clique em **Deploy Web Service**. Assim que ficar *Live*, basta mandar o link `https://seu-jogo.onrender.com/?sala=NOSSOAMOR` no WhatsApp para jogar juntos pelo celular ou pelo PC!

> **Nota sobre o plano Free do Render**: No plano gratuito, o servidor hiberna após 15 minutos sem ninguém conectado e acorda automaticamente em ~30 segundos no primeiro acesso. Enquanto vocês estiverem jogando na sala, o Socket.IO mantém o servidor acordado sem cair!

---

## 📱 Controles no Celular e no PC

- **Celular / Tablet (Retrato ou Paisagem)**:
  - **Joystick Virtual** (polegar esquerdo) + **Arrastar na tela** (polegar direito gira a câmera 3D) + **Pinça de 2 dedos** (zoom) + botões **PULAR** e **JOGAR / SENTAR**.
  - Dica: No Safari (iPhone) ou Chrome (Android), toque em **Compartilhar / Menu → Adicionar à Tela Inicial** para abrir em tela cheia como aplicativo!
- **PC**:
  - `WASD` ou Setas para andar · `Shift` para correr · `Espaço` para pular · `E` para interagir · Arrastar o mouse gira a câmera 3D.
