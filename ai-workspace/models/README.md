# Modelos de IA — Fase 9

Módulo de integração unificada com múltiplos provedores de IA.

## Arquitetura

```
models/
├── client.js       # Cliente unificado (funções exportadas)
├── providers.json  # Catálogo completo de provedores e modelos
└── README.md       # Este documento
```

## Provedores Suportados

| Provedor     | Env Key            | Modelo Padrão                           | Tipo          |
|--------------|--------------------|-----------------------------------------|---------------|
| `mimo`       | *(automático)*     | auto (roteador)                         | Router        |
| `gemini`     | `gemini_api`       | `gemini-2.0-flash`                      | Cloud (Google)|
| `openrouter` | `aider_key`        | `meta-llama/llama-3.1-8b-instruct:free` | Aggregator    |
| `openai`     | `gpt_api`          | `gpt-4o-mini`                           | Cloud (OpenAI)|
| `deepseek`   | `deepseek_api_key` | `deepseek-chat`                         | Cloud (CN)    |
| `grok`       | `grok_api`         | `grok-beta`                             | Cloud (xAI)   |
| `nvidia-nim` | `nvidia_api_key`   | `meta/llama3-70b-instruct`              | Cloud (NVIDIA)|

## Mimo — Roteamento Inteligente

O provedor `mimo` detecta automaticamente qual API está configurada no `.env`
e roteia para o melhor provedor disponível, seguindo esta ordem de prioridade:

```
openrouter → gemini → deepseek → grok → openai → nvidia-nim → [fallback local]
```

## Funções Exportadas

### `generateText(provider, prompt, options?)`
Gera texto com o provedor especificado.
```js
import { generateText } from './models/client.js';

const resposta = await generateText('gemini', 'Explique RAG em 2 linhas', {
  model: 'gemini-1.5-pro',
  systemInstruction: 'Responda de forma concisa.'
});
```

### `listModels()`
Retorna o catálogo completo de provedores e modelos do `providers.json`.
```js
import { listModels } from './models/client.js';
const catalogo = listModels();
```

### `testProvider(provider)`
Testa a conectividade de um provedor com um prompt simples.
```js
import { testProvider } from './models/client.js';
const result = await testProvider('gemini');
// { ok: true, provider: 'gemini', latencyMs: 342, response: 'OK' }
```

### `detectAvailableProviders()`
Detecta quais provedores estão configurados no `.env`.
```js
import { detectAvailableProviders } from './models/client.js';
const available = detectAvailableProviders();
// ['mimo', 'gemini', 'openrouter', 'deepseek', 'grok']
```

## CLI

```bash
workspace models           # Lista todos os provedores e modelos
workspace models available # Mostra apenas provedores configurados no .env
workspace models test      # Testa todos os provedores disponíveis
workspace models test gemini  # Testa um provedor específico
```

## Configuração `.env`

```env
gemini_api=SUA_CHAVE_AQUI
aider_key=SUA_CHAVE_OPENROUTER
gpt_api=SUA_CHAVE_OPENAI
deepseek_api_key=SUA_CHAVE_DEEPSEEK
grok_api=SUA_CHAVE_XAI
nvidia_api_key=SUA_CHAVE_NVIDIA
```