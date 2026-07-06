# Plano: Chat Web para o AI Workspace (Fase 11 do Roadmap)

> Este documento cobre o UI/UX, a arquitetura técnica e as referências de mercado
> pesquisadas para o chat que vai rodar em cima dos modelos locais (Ollama) e do
> roteador Mimo já implementados no Workspace.

---

## 1. Onde isso entra no seu roadmap

O seu `docs/roadmap.md` já previa isso:
```
## Fase 11 — Interface PWA
- [ ] Dashboard
- [ ] Projetos
- [ ] Agentes
- [ ] Loops
- [ ] Logs
- [ ] Configurações
```
Este plano propõe que o **Chat** seja o ponto de entrada dessa fase — é a peça que mais valor entrega primeiro (conversar com os modelos locais e com o Mimo direto de uma interface, sem depender do terminal), e as outras telas (Dashboard, Projetos, Agentes...) se conectam a ela depois, reaproveitando o mesmo layout base.

---

## 2. Pesquisa de mercado — o que já existe para Ollama

Antes de desenhar do zero, é importante saber o que outras pessoas já resolveram bem (e mal) nesse mesmo problema.

### 2.1 — Open WebUI (a referência mais completa)
É a interface mais rica do ecossistema Ollama hoje: <cite index="18-1">interface de IA extensível, rica em recursos e amigável, autohospedada, feita para operar totalmente offline, com suporte a Ollama e APIs compatíveis com OpenAI, além de um motor de RAG embutido</cite>. O ponto fraco pro seu caso: <cite index="5-1">o requisito de Docker adiciona um overhead de configuração, e o próprio projeto recomenda pelo menos 12GB de RAM</cite> — exatamente o recurso que seu aparelho não tem sobrando. **Não é viável no seu hardware.**

### 2.2 — Hollama (a referência de simplicidade)
Um projeto que mira o oposto do Open WebUI: <cite index="12-1">uma interface web minimalista para conversar com servidores Ollama, com campos de prompt grandes, renderização de Markdown com destaque de sintaxe, recursos de editor de código, prompts de sistema personalizáveis e temas claro/escuro</cite>. Notável: <cite index="12-1">a saída é separada em bloco de código e bloco de Markdown, facilitando copiar cada parte separadamente</cite>. Boa inspiração de **organização de tela**, mas ainda é um app à parte (Svelte/TypeScript), não algo embutido no seu próprio Workspace.

### 2.3 — ollama-html-ui (a referência de stack — a mais próxima do seu caso)
Esse é o mais relevante tecnicamente: <cite index="19-1">uma UI HTML mínima e responsiva para Ollama, pensada tanto para mobile quanto desktop, com suporte cross-browser</cite>, <cite index="19-1">construída em HTML, CSS e JavaScript puros, sem dependências, com menos de 20KB comprimido</cite>. As funcionalidades cobertas incluem <cite index="19-1">criar/editar/apagar conversas, baixar conversa, rolar para o topo/fim, copiar para a área de transferência, marcar mensagens como boas/ruins, buscar conversas, histórico e exportação</cite>. Isso confirma: dá pra ter uma experiência completa de chat **sem framework nenhum** — exatamente seu stack (vanilla JS + `live-server`).

### 2.4 — Chatbot Ollama (referências de interação durante a resposta)
Focado em polimento de streaming: <cite index="6-1">tema azul reformulado para modo claro e escuro, com barras laterais, cabeçalhos e sobreposições consistentes</cite>, e nos blocos de código: <cite index="6-1">botão de copiar, indicador da linguagem, numeração de linha opcional, alternância de quebra de linha e opção de baixar como arquivo</cite>, além de <cite index="6-1">um botão de parar geração e um toggle de auto-scroll que pausa quando o usuário rola pra cima</cite>. Esses dois últimos detalhes (parar geração, pausar auto-scroll) são particularmente importantes pro **seu caso**, porque suas respostas locais levam 1-1.5 min — o usuário vai querer cancelar ou ler enquanto gera.

### 2.5 — Conclusão da pesquisa
Não existe (nem faz sentido usar) uma ferramenta "pronta" pro seu caso: as robustas (Open WebUI) pesam demais pro hardware; as leves (Hollama) são apps isolados, não plugam no seu `models/client.js` nem no seu roteamento Mimo/local. O caminho certo é um **chat vanilla JS construído por você**, pegando emprestado os padrões de UX que essas ferramentas já validaram: bloco de código separado e copiável (Hollama), zero dependências e leveza (ollama-html-ui), e feedback de streaming com botão de parar (Chatbot Ollama).

---

## 3. Arquitetura técnica

```
ai-workspace/
└── ui/
    ├── index.html          # shell da página (mobile-first)
    ├── styles.css           # design tokens + layout responsivo
    ├── app.js               # lógica de chat, histórico, streaming
    └── server.js            # pequeno servidor Node (Express-like, sem framework)
```

### 3.1 — Por que um `server.js` próprio, e não só `live-server`
O `live-server` serve arquivos estáticos, mas não fala com o `models/client.js` (que é código Node do seu projeto, não pode rodar no navegador). A solução: um servidor Node bem pequeno (só `http` nativo, sem Express) que:
1. Serve os arquivos estáticos de `ui/`
2. Expõe uma rota `POST /api/send` que importa e chama `generateText()` do seu `models/client.js` já existente
3. Devolve a resposta via **streaming** (Server-Sent Events ou `chunked transfer`), pra você ver o texto aparecendo token a token — igual ao padrão que o Chatbot Ollama usa.

Isso reaproveita 100% do roteamento que já construímos (Mimo, local, fallback automático) — o chat não reimplementa nada, só consome.

```bash
# rodar localmente, no padrão que você já usa
cd ai-workspace/ui
node server.js
# depois abre no navegador do celular: http://localhost:3333
```

### 3.2 — Fluxo de dados
```
[app.js no navegador]
      │  POST /api/send { prompt, provider }
      ▼
[server.js — Node puro]
      │  import { generateText } from '../models/client.js'
      ▼
[models/client.js]  ──►  local (Ollama) OU mimo (cloud)
      │
      ▼
[stream de volta pro navegador]
```

---

## 4. UI/UX — proposta visual

### 4.1 — Princípios (mobile-first, mão única)
- **Bottom-anchored**: campo de mensagem sempre fixo embaixo (`position: sticky` ou `fixed`), fácil de alcançar com o polegar.
- **Sem hover**: todo elemento interativo depende de `:active`/toque, nunca de `:hover` — controles com no mínimo 44×44px de área de toque.
- **Bolhas de mensagem** separando usuário (direita, cor de destaque) e modelo (esquerda, neutro) — padrão consolidado, reduz carga cognitiva.
- **Indicador de qual "cérebro" respondeu**: uma tag pequena acima da resposta (`● local · 0.5B` / `● local · 1.5B` / `● mimo · gemini`) — dado que seu roteamento troca de modelo, o usuário precisa saber quem respondeu, sem ambiguidade.

### 4.2 — Tela única com 3 estados
1. **Vazio** — campo de prompt centralizado, sugestões rápidas (chips): "Explicar código", "Gerar função", "Revisar trecho".
2. **Conversando** — histórico rolável, bolhas, indicador de "digitando..." enquanto o streaming chega.
3. **Gerando (modelo local lento)** — barra de progresso indeterminada + **botão "Parar"** sempre visível (essencial, dado que respostas locais levam mais de 1 minuto) + tempo decorrido em tempo real, pra gerenciar expectativa (ex: "42s — modelo local, aguarde").

### 4.3 — Paleta e tipografia
Dado o tema do seu ecossistema (AI Workspace + Flor de Lótus, ambos com identidade própria), sugiro:
- **Modo escuro como padrão** (reduz consumo de bateria em telas AMOLED, comum em Android; também é a preferência natural pra uso noturno de terminal/código).
- Fonte monoespaçada para blocos de código (`ui-monospace, "SF Mono", monospace`), fonte de sistema para o resto (`-apple-system, "Segoe UI", sans-serif` — carrega instantâneo, sem fetch de fonte externa).
- Cor de destaque única (accent) reutilizada em: bolha do usuário, botão enviar, tag do modelo ativo — cria identidade visual coesa sem precisar de muitas cores.

### 4.4 — Blocos de código (inspirado no Hollama + Chatbot Ollama)
- Bloco visualmente separado do texto (fundo diferente, borda sutil).
- Botão de copiar sempre visível no canto superior do bloco (toque único).
- Label da linguagem detectada (```js, ```bash, etc.) discreta no topo do bloco.

### 4.5 — Seletor de modelo/provider
Um menu simples (bottom sheet, não dropdown — melhor pra toque) com:
```
● Auto (recomendado)
○ Local — rápido (0.5B)
○ Local — coder (1.5B)
○ Nuvem (Mimo)
```
"Auto" usa o `pickLocalModel()` que já existe; as outras opções forçam.

---

## 5. Funcionalidades por prioridade (para não travar na primeira versão)

### v1 — essencial
- [ ] Enviar mensagem e receber resposta (streaming)
- [ ] Indicador de qual modelo respondeu
- [ ] Botão de parar geração
- [ ] Bloco de código com botão copiar
- [ ] Histórico da sessão atual (em memória, sem persistência ainda)

### v2 — conforto
- [ ] Histórico persistente (salvo em arquivo JSON local, reaproveitando o padrão que `multiagent/sessions/` já usa)
- [ ] Seletor de modelo (bottom sheet)
- [ ] Tempo decorrido + tokens/s exibido discretamente (você já mede isso — só expor na UI)

### v3 — avançado
- [ ] Múltiplas conversas (como abas/lista, estilo Hollama)
- [ ] Atalho para rodar o pipeline multiagente direto do chat (`/pipeline <tarefa>`)
- [ ] Exportar conversa (Markdown)

---

## 6. Próximo passo

Se topar, a v1 (seção 5) dá pra entregar como um único `ui/index.html` + `ui/app.js` + `ui/server.js`, já plugados no `models/client.js` existente — sem quebrar nada do que já funciona no CLI. É só confirmar e eu já monto o código completo, pronto pra rodar com `node ui/server.js` e abrir no navegador do celular.
