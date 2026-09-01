# Videoconferência P2P para 2 Pessoas (WebRTC)

Aplicação web moderna, responsiva, acessível e funcional de videoconferência ponto a ponto (P2P) projetada para chamadas privadas de exatamente **duas pessoas** via WebRTC, com compartilhamento de tela em alta qualidade, sinalização via WebSocket e controle de acesso protegido por senha.

---

## 🚀 Funcionalidades

- 🔒 **Acesso Protegido**: Entrada protegida pela senha fixa `1015`, solicitada antes de liberar a tela da chamada.
- 👥 **Limite Estrito de 2 Participantes**: Capacidade restrita a exatamente 2 pessoas por sala; um terceiro participante é rejeitado com mensagem clara (`ROOM_FULL`).
- ⚡ **Comunicação Direta P2P via WebRTC**: Transmissão de áudio e vídeo de baixa latência diretamente entre os dois navegadores, com sinalização em tempo real via WebSocket.
- 🖥️ **Compartilhamento de Tela de Alta Resolução**: Captura de tela inteira/janela via `getDisplayMedia`, com substituição contínua de faixa (`replaceTrack`) e restauração automática da câmera ao encerrar o compartilhamento.
- 🎛️ **Controles Completos de Mídia**:
  - Mutar / desmutar microfone.
  - Ligar / desligar câmera.
  - Iniciar / parar compartilhamento de tela.
  - Encerrar chamada e sair da sala.
- 🎯 **Qualidade e Otimização de Mídia**:
  - Áudio com cancelamento de eco (`echoCancellation`), supressão de ruído (`noiseSuppression`) e ganho automático (`autoGainControl`).
  - Fallback progressivo de resolução de vídeo (1080p Full HD -> 720p HD -> 480p SD -> Básico) conforme a capacidade do dispositivo e câmera.
  - Priorização de bitrate para transmissões nítidas.
- 🎨 **Interface Moderna e Acessível**:
  - Tema escuro com design glassmorphism responsivo para Desktop, Tablets e Smartphones.
  - Indicadores visuais de estado (Aguardando, Conectando, Conectado, Reconectando, Mudo, Compartilhando Tela).
  - Suporte a acessibilidade (atributos ARIA, labels semânticos, foco visível).
  - Notificações em formato Toast e modais informativos para erros e permissões negadas.

---

## 📋 Requisitos de Ambiente

- **Node.js**: versão 18 ou superior (testado na versão 22 LTS).
- **Navegador Moderno**: Google Chrome, Mozilla Firefox, Microsoft Edge ou Apple Safari recente com suporte a WebRTC (`getUserMedia`, `RTCPeerConnection`, `getDisplayMedia`).

> **Nota sobre permissões do navegador:** Por questões de segurança dos navegadores, o acesso à câmera, microfone e compartilhamento de tela requer um contexto seguro: `http://localhost:<porta>`, `http://127.0.0.1:<porta>` ou conexão via `https://`.

---

## 🛠️ Instalação e Execução

### 1. Instalar Dependências
```bash
npm install
```

### 2. Iniciar o Servidor
```bash
npm start
```
O servidor estará disponível em: [http://localhost:3000](http://localhost:3000)

### 3. Modo de Desenvolvimento (com auto-reload)
```bash
npm run dev
```

### 4. Executar os Testes Automatizados
```bash
npm test
```

### 5. Verificação de Sintaxe e Linting
```bash
npm run lint
```

---

## 🔑 Acesso e Uso

1. Abra [http://localhost:3000](http://localhost:3000) no seu navegador.
2. Digite o **Identificador da Sala** (por padrão `sala-principal`).
3. Digite a senha de acesso: `1015`.
4. Clique em **Entrar na Chamada** e conceda as permissões de câmera e microfone solicitadas pelo navegador.
5. Abra uma segunda aba (ou envie o link para outro participante na mesma rede/localhost) e repita o processo com a mesma sala e senha.
6. A chamada P2P se conectará automaticamente.

---

## 🛡️ Segurança e Limitações da Senha Fixa

### Aviso de Segurança
- A senha fixa `1015` atua como uma barreira de acesso e validação da aplicação contra acessos não autorizados imediatos.
- **Limitação:** Uma senha estática/hardcoded não substitui um sistema de autenticação empresarial para produção (como OAuth2, JWT com expiração, SSO ou senhas individuais com hash bcrypt/argon2). Em um ambiente corporativo ou público aberto, recomenda-se integrar autenticação baseada em sessão ou tokens efêmeros gerados no backend.

### Medidas de Segurança Implementadas
- **Validação no Servidor de Sinalização**: Mensagens de sinalização não autenticadas são sumariamente rejeitadas com `AUTH_FAILED`.
- **Sanitização de Entradas**: Prevenção contra injeção de HTML e ataques XSS ao manipular dados do usuário (`escapeHtml`).
- **Prevenção de Directory Traversal**: O servidor de arquivos estáticos valida e normaliza caminhos contra leitura indevida de arquivos do sistema.
- **Cabeçalhos de Segurança HTTP**:
  - `Content-Security-Policy (CSP)`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- **Privacidade de Mídia**: O servidor atua estritamente como roteador de sinalização (metadados SDP e ICE) e **nunca** armazena, grava ou intercepta o tráfego de áudio/vídeo, que trafega de ponta a ponta criptografado (SRTP/DTLS) entre os pares WebRTC.

---

## 🌐 Checklist de Deploy Seguro em Produção

Para publicar esta aplicação em produção:

- [ ] **HTTPS / WSS Obrigatório**: Configure um proxy reverso (como Nginx, Caddy ou Cloudflare) com certificado SSL/TLS válido para servir a aplicação sob `https://` e `wss://`.
- [ ] **Servidor TURN (Coturn)**: A configuração padrão utiliza servidores STUN públicos do Google (`stun:stun.l.google.com:19302`), adequados para redes domésticas e conexões diretas. Para garantir conectividade através de firewalls restritivos e redes corporativas complexas (Symmetric NAT), adicione credenciais efêmeras de um servidor TURN (ex: Coturn) no array `iceServers` em `public/js/webrtc.js`.
- [ ] **Variáveis de Ambiente**:
  - `PORT`: Porta de execução (padrão `3000`).
  - `HOST`: Interface de rede (padrão `0.0.0.0`).
- [ ] **Rate Limiting e Proteção contra DoS**: Configure limites de conexões simultâneas por IP no proxy reverso ou no servidor Node.js.

---

## 🧪 Estrutura de Testes e Limitações

A suíte de testes automatizada (`npm test`) cobre:
- **Autenticação e Senha Fixa**: Validação de aceitação da senha `1015`, rejeição de senhas incorretas e garantia de não vazamento da credencial.
- **Regras de Sala e Capacidade**: Admissão de exatamente 2 participantes e rejeição estrita do 3º participante com `ROOM_FULL`.
- **Roteamento de Sinalização**: Troca correta de `offer`, `answer` e `ice_candidate` entre os pares.
- **Ciclo de Vida e Limpeza**: Notificação de saída (`peer_left`) e liberação de memória em salas vazias.
- **Servidor HTTP e Segurança**: Verificação de cabeçalhos de segurança, health check, proteção contra traversal e entrega de estáticos.
- **Utilitários**: Sanitização XSS e formatação de tempos.

> **Limitação dos Testes em CI/Headless**: O streaming real de áudio/vídeo e captura de tela física dependem de dispositivos de hardware e APIs interativas do navegador (`getUserMedia`, `getDisplayMedia`, `RTCPeerConnection` com codecs nativos), os quais não possuem dispositivos físicos de captura em ambientes headless de CI. A lógica de sinalização, gerenciamento de estado e protocolos de rede foram extensivamente testados com mocks e sockets reais.

---

## 📁 Estrutura do Projeto

```
ssdsss/
├── public/
│   ├── css/
│   │   └── style.css          # Estilos modernos, responsivos e acessíveis
│   ├── js/
│   │   ├── app.js             # Controlador da UI, eventos e ciclo de vida
│   │   ├── signaling.js       # Cliente WebSocket de sinalização
│   │   ├── utils.js           # Utilitários de sanitização, formatação e constraints
│   │   └── webrtc.js          # Gerenciador WebRTC, P2P, áudio/vídeo e compartilhamento de tela
│   └── index.html             # Interface com tela de senha e tela de chamada
├── src/
│   ├── roomManager.js         # Lógica de salas, capacidade (2 peers) e autenticação
│   └── server.js              # Servidor HTTP estático e WebSocket Server
├── test/
│   ├── roomManager.test.js    # Testes unitários de regras de sala e sinalização
│   ├── server.test.js         # Testes de integração HTTP e WebSocket
│   └── utils.test.js          # Testes de utilitários e constraints
├── package.json
└── README.md
```
