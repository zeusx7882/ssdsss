# Videoconferência P2P para 2 Pessoas (WebRTC)

Aplicação web moderna, responsiva, acessível e funcional de videoconferência ponto a ponto (P2P) projetada para chamadas privadas de exatamente **duas pessoas** via WebRTC, com compartilhamento de tela em alta qualidade, sinalização via WebSocket e controle de acesso protegido por senha.

---

## 🚀 Funcionalidades

- 🔒 **Acesso Protegido (apenas para teste)**: Entrada protegida pela senha fixa `1015`, solicitada antes de liberar a tela da chamada. Veja o aviso em [Segurança](#️-segurança-e-limitações-da-senha-fixa): **isso não é autenticação de produção**.
- 🙋 **Nome de Usuário**: Cada participante escolhe um nome obrigatório antes de conectar. O nome é validado, limitado a 24 caracteres e sanitizado no cliente **e** no servidor, sendo exibido nos cards de vídeo e no chat.
- 💬 **Chat Durante a Chamada**: Painel de chat responsivo (desktop e mobile) usando o mesmo WebSocket de sinalização, com autor, horário e estado de envio/recebimento. As mensagens **não são persistidas** no servidor.
- ⛶ **Tela Cheia**: Botão dedicado para quem assiste abrir o vídeo remoto ou a tela compartilhada em tela cheia (Fullscreen API), com saída de tela cheia e aviso quando a API não está disponível.
- 🔊 **Ativar Áudio**: Botão exibido automaticamente quando o navegador bloqueia a reprodução automática (autoplay) do áudio remoto.
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

## 🔐 HTTPS e WSS

Câmera, microfone e compartilhamento de tela só funcionam em **contexto seguro**: `http://localhost`, `http://127.0.0.1` ou `https://`.

- O cliente escolhe o protocolo do WebSocket automaticamente a partir da página:
  - Página em `http://` → sinalização em `ws://<host>/ws`
  - Página em `https://` → sinalização em `wss://<host>/ws`
- Em produção, coloque a aplicação atrás de um proxy reverso com TLS (Nginx, Caddy, Traefik, Cloudflare) e **encaminhe o caminho `/ws`** com upgrade de WebSocket. Sem isso, a negociação WebRTC nunca se completa e o vídeo aparece preto e sem som.
- Use a variável de ambiente `PORT` fornecida pela hospedagem (o servidor já lê `process.env.PORT`).

Exemplo mínimo de proxy no Nginx:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
}
```

---

## 🩺 Correções de Áudio, Vídeo e Negociação

Problemas corrigidos nesta versão:

- **Negociação antes da mídia estar pronta**: todos os caminhos de sinalização (`peer_joined`, `offer`, `answer`, `ice_candidate`) aguardam a promessa `mediaReady`, resolvida quando `getUserMedia()` termina — com ou sem dispositivos. Isso elimina a condição de corrida que causava tela preta e ausência de voz.
- **Ordem de entrada dos participantes**: a negociação usa o padrão *perfect negotiation* (`isPolite`, rollback em colisão de ofertas), evitando falhas quando os participantes entram em ordens diferentes.
- **Stream remota duplicada**: uma única `MediaStream` remota é criada por conexão e as faixas são adicionadas sem duplicação (verificação por `track.id`).
- **Áudio remoto não reproduzido**: `muted = false`, `volume = 1` e chamada explícita a `play()`, com botão **Ativar áudio** quando o autoplay é bloqueado.
- **Áudio e vídeo sempre negociados**: transceivers `sendrecv` de áudio e vídeo são criados sempre, mesmo sem câmera; as faixas disponíveis são aplicadas com `replaceTrack`.
- **Troca de faixa no compartilhamento**: o `RTCRtpSender` de vídeo é localizado mesmo sem faixa ativa, e a câmera é restaurada ao encerrar (inclusive pelo botão nativo do navegador).
- **Constraints de áudio com fallback**: `echoCancellation`, `noiseSuppression` e `autoGainControl` são mantidos; `sampleRate`/`channelCount` têm fallback para dispositivos e navegadores que não os aceitam.
- **Estados de conexão e ICE**: estados `connecting`, `connected`, `disconnected` e `failed` são refletidos na interface, com tentativa automática de reinício de ICE (`restartIce`) e aviso de que uma rede restrita pode exigir TURN.

---

## 🔑 Acesso e Uso

1. Abra [http://localhost:3000](http://localhost:3000) no seu navegador.
2. Digite o **Seu Nome de Usuário** (obrigatório, até 24 caracteres).
3. Digite o **Identificador da Sala** (por padrão `sala-principal`).
4. Digite a senha de acesso: `1015`.
5. Clique em **Entrar na Chamada** e conceda as permissões de câmera e microfone solicitadas pelo navegador.
6. Abra uma segunda aba (ou envie o link para outro participante) e repita o processo com a **mesma sala e senha**, usando um nome diferente.
7. A chamada P2P se conectará automaticamente.

### Teste com Duas Abas ou Dois Dispositivos

- **Duas abas no mesmo computador**: use uma aba normal e outra anônima/de outro perfil, para que o navegador peça permissões separadamente. Silencie o microfone de uma das abas para evitar microfonia (eco).
- **Dois dispositivos**: os dois precisam abrir o **mesmo endereço** (`https://seu-dominio` ou `http://<ip-da-máquina>:3000` na mesma rede). Fora de `localhost`, o acesso a câmera/microfone exige HTTPS.
- Confirme em `https://seu-dominio/health` que o servidor responde `{"status":"ok"}`.

### Permissões do Navegador

- Clique no cadeado ao lado do endereço e verifique se **Câmera** e **Microfone** estão como "Permitir".
- Se o acesso for negado, a aplicação exibe o modal **Permissão Negada** com instruções.
- Se a câmera estiver ocupada por outro aplicativo (`NotReadableError`), a aplicação avisa e mantém a chamada apenas com áudio.
- Sem câmera disponível, o áudio continua sendo enviado normalmente (transceivers de áudio e vídeo são sempre criados).

---

## 💬 Chat da Chamada

- Abra e feche o painel pelo botão **Chat** na barra de controles (ou pela tecla `Esc` dentro do painel).
- Mensagens são limitadas a **500 caracteres**, validadas e sanitizadas no cliente e no servidor.
- O conteúdo é inserido no DOM apenas via `textContent` (nunca `innerHTML`), evitando XSS.
- O servidor encaminha cada mensagem **somente** para o outro participante da mesma sala e responde `chat_delivered` ao remetente; nada é persistido ou registrado em log.
- Situações tratadas: sala cheia, participante desconectado (`NO_PEER`) e WebSocket indisponível.
- Um contador de mensagens não lidas aparece no botão de chat quando o painel está fechado.

---

## 🖥️ Tela Cheia e Compartilhamento de Tela

- Quem assiste pode usar o botão **Tela cheia** sobre o vídeo remoto para ampliar tanto a câmera quanto a tela compartilhada.
- Quando a Fullscreen API não está disponível (ou é bloqueada por política de permissões/iframe), a aplicação mostra um aviso claro em vez de falhar silenciosamente.
- O botão atualiza `aria-label`, `aria-pressed`, o ícone e o texto ao entrar e sair da tela cheia.
- Quando o outro participante compartilha a tela, o card remoto recebe destaque visual e o selo **Compartilhando tela**. Esse aviso trafega por um `RTCDataChannel` de metadados (`meta`), sem novos tipos de mensagem no servidor de sinalização.
- O preview local passa a mostrar a tela compartilhada, e a câmera é restaurada automaticamente ao encerrar — inclusive quando o usuário clica em **Parar compartilhamento** no seletor nativo do navegador.
- O microfone continua ativo durante o compartilhamento. Se o navegador permitir compartilhar o áudio do sistema, ele é **mixado** com o microfone via Web Audio API; se a mixagem não for possível, apenas o microfone é enviado.

### Limitações de Autoplay

Navegadores modernos bloqueiam a reprodução de áudio sem interação do usuário. A aplicação:

- Configura o vídeo remoto com `autoplay`, `playsinline`, `muted = false` e `volume = 1`.
- Chama `play()` explicitamente quando o stream remoto chega.
- Se o `play()` for rejeitado (autoplay bloqueado), exibe o botão **Ativar áudio** sobre o vídeo remoto e uma notificação orientando o clique.

---

## 🛡️ Segurança e Limitações da Senha Fixa

### ⚠️ Aviso de Segurança
- **A senha fixa `1015` existe apenas para teste e demonstração. Ela NÃO é um mecanismo de autenticação de produção.**
- A senha é digitada no navegador e comparada no servidor de sinalização; qualquer pessoa com acesso ao endereço pode tentar adivinhá-la e não há proteção contra tentativas repetidas.
- Não use esta aplicação como está para conversas sensíveis em ambiente público sem substituir a senha fixa por autenticação real.
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
  - `Permissions-Policy: camera=(self), microphone=(self), display-capture=(self), fullscreen=(self)` — libera explicitamente câmera, microfone, captura de tela e Fullscreen API na própria origem.
- **Validação Estrita de Mensagens WebSocket**:
  - Somente os tipos `join`, `offer`, `answer`, `ice_candidate`, `chat`, `leave` e `ping` são aceitos; qualquer outro tipo recebe `UNKNOWN_TYPE`.
  - Limite de 64 KB por mensagem bruta (também aplicado via `maxPayload` no servidor WebSocket) para evitar abuso de memória.
  - SDP limitado a 32 KB, candidatos ICE a 2 KB, nome de usuário a 24 caracteres e chat a 500 caracteres.
  - Apenas campos validados são reencaminhados: dados arbitrários enviados junto com o SDP ou o candidato **não** são refletidos ao outro participante.
  - Chat e sinalização são entregues exclusivamente ao outro participante da **mesma sala**, com limite estrito de 2 participantes.
- **Privacidade de Mídia**: O servidor atua estritamente como roteador de sinalização (metadados SDP e ICE) e **nunca** armazena, grava ou intercepta o tráfego de áudio/vídeo, que trafega de ponta a ponta criptografado (SRTP/DTLS) entre os pares WebRTC.

---

## 🌐 Checklist de Deploy Seguro em Produção

Para publicar esta aplicação em produção:

- [ ] **HTTPS / WSS Obrigatório**: Configure um proxy reverso (como Nginx, Caddy ou Cloudflare) com certificado SSL/TLS válido para servir a aplicação sob `https://` e `wss://`.
- [ ] **Encaminhamento de `/ws`**: O proxy reverso precisa encaminhar o caminho `/ws` para o servidor Node.js com upgrade de WebSocket habilitado (`Upgrade` / `Connection: upgrade`). Sem isso, a sinalização nunca completa e a chamada fica preta e sem som.
- [ ] **Servidor TURN (Coturn) — pode ser necessário**: A configuração padrão usa apenas servidores STUN públicos do Google (`stun:stun.l.google.com:19302`), suficientes para muitas redes domésticas e conexões diretas. Em **redes restritas** (corporativas, algumas operadoras móveis, Symmetric NAT ou firewalls que bloqueiam UDP), a conexão pode falhar mesmo com a sinalização funcionando — nesse caso é necessário um servidor **TURN** para retransmitir a mídia. Adicione as credenciais efêmeras do seu TURN no array `iceServers` em `public/js/webrtc.js`:

  ```javascript
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: 'turn:seu-turn.exemplo.com:3478',
        username: 'usuario-efemero',
        credential: 'credencial-efemera'
      }
    ],
    iceCandidatePoolSize: 10
  };
  ```

  > Nenhum serviço TURN pago é obrigatório nesta aplicação: você pode hospedar o seu próprio (Coturn é open source). **Nunca** comite credenciais reais no repositório; gere-as no backend com validade curta.
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
- **Nome de Usuário**: Sanitização, limite de tamanho, valor padrão e propagação dos nomes em `joined`, `peer_joined` e `peer_left`.
- **Chat**: Roteamento apenas para o outro participante da mesma sala, confirmação `chat_delivered`, limite de 500 caracteres, rejeição de mensagens vazias/inválidas e de envio fora de sala.
- **Validação de Mensagens**: Lista estrita de tipos permitidos, limite de tamanho bruto, rejeição de SDP e candidatos ICE inválidos e ausência de reflexão de campos arbitrários.
- **Utilitários**: Sanitização XSS, sanitização de nome/chat, formatação de tempos e fallback de constraints de áudio.

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
