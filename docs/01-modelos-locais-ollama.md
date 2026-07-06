# Modelos Locais (Ollama) no AI Workspace

> Documento de referência — registra tudo que foi decidido, testado e implementado
> sobre rodar modelos de IA localmente no celular (Termux) e integrá-los ao `ai-workspace`.
> Última atualização: baseado na sessão de configuração do Ollama local.

---

## 1. Hardware e limite real do aparelho

| Especificação | Valor |
|---|---|
| Chip | Snapdragon 8 Gen 1 |
| RAM anunciada | 16GB |
| RAM real disponível (confirmada via `free -h`) | **~11GB** (o resto é RAM virtual/estendida do Android, que vira swap em disco) |
| Swap | 5.5GB (usa storage, muito mais lento que RAM) |
| Inferência | 100% CPU — Ollama no Termux **não usa GPU/NPU** |

**Conclusão de hardware:** a velocidade de geração de texto (tokens/s) é limitada por **banda de memória**, não por número de núcleos. Isso foi confirmado experimentalmente: mudar `OLLAMA_NUM_THREAD` de 1 para 8 não alterou o resultado de forma significativa.

---

## 2. Onde tudo está instalado

### Ollama nativo (Termux) — **caminho recomendado, em uso**
```
Binário:        $PREFIX/bin/ollama
Modelos:        ~/.ollama/models/  (blobs + manifests)
Servidor:       http://127.0.0.1:11434
```

### llama.cpp + modelos extras (dentro do proot-distro Debian) — **testado, descartado por ora**
```
Container:      /data/data/com.termux/files/usr/var/lib/proot-distro/containers/debian/rootfs/
Modelos extras: .../rootfs/root/AI/models/{qwen3,gemma3,deepseek-r1}/*.gguf
```
Esses 3 arquivos (Qwen3 4B, Gemma3 4B, DeepSeek-R1-Distill-Qwen 7B) já estavam baixados antes desse projeto. Foram testados via importação no Ollama nativo (ver seção 5) — mantidos no disco, mas **não integrados** ao Workspace por não compensarem o custo/benefício no hardware atual.

---

## 3. Modelos validados e em uso ativo

| Modelo | Tamanho | Papel | Eval rate medido |
|---|---|---|---|
| `qwen2.5:0.5b-instruct-q4_K_M` | 397 MB | **Roteador / triagem** — perguntas curtas, decisões rápidas, tool-calling simples | ~15 tokens/s |
| `qwen2.5-coder:1.5b-instruct-q4_K_M` | 986 MB | **Coder** — geração/edição de código real | ~5 tokens/s |

Comandos de instalação (já executados):
```bash
ollama pull qwen2.5:0.5b-instruct-q4_K_M
ollama pull qwen2.5-coder:1.5b-instruct-q4_K_M
```

---

## 4. Diagnóstico de performance — o que foi descartado e por quê

Testes feitos ao longo da sessão, na ordem:

1. **Threads (`OLLAMA_NUM_THREAD`)** — sem efeito relevante (5.65 → 5.09 t/s). Confirma gargalo de banda de memória, não de paralelismo.
2. **Fechar apps em background / medir com `top`/`free -h`** — revelou RAM real ~11GB (não 16GB) e uso de swap (~2.8GB) mesmo em repouso.
3. **Modelo ainda menor (0.5B)** — ganho real e proporcional ao tamanho: **14.92 t/s**, ~2.8x mais rápido que o 1.5B. Essa foi a mudança que trouxe ganho de verdade.
4. **Modelos maiores do proot (Qwen3 4B)** — importado com sucesso após dois bugs de ambiente (seção 5), mas rendeu **4.79-5.32 t/s**, igual ou pior que o 1.5B já validado, e ainda por cima é um modelo de "raciocínio" (gera um bloco `Thinking...` longo antes de responder). **Removido** (`ollama rm qwen3-4b-local`).
5. **Gemma3 4B e DeepSeek-R1 7B** — não integrados. DeepSeek-R1 é reasoning model e maior (7B); a expectativa (~1-3 t/s + overhead de raciocínio) não compensa o risco de OOM.

**Regra prática validada:** no Snapdragon 8 Gen 1 com Ollama/Termux, o tempo de resposta escala quase linearmente com o tamanho do modelo. Modelos "de raciocínio" (thinking/R1-style) multiplicam o problema, porque geram tokens extras de raciocínio antes da resposta final.

---

## 5. Bugs de ambiente resolvidos (guarde isso — vai se repetir)

### 5.1 — `/tmp` não existe no Termux puro
Termux não tem o `/tmp` da raiz do Android. Use `~` (home) ou `$PREFIX/tmp` em qualquer script que crie arquivos temporários (Modelfile, etc).

### 5.2 — `CANNOT LINK EXECUTABLE ... library not found`
Ao importar um `.gguf` externo via `ollama create`, o binário interno `llama-quantize` não encontra sua própria `.so` ao lado dele — comportamento do linker do Android, não bug do arquivo. Correção:
```bash
export LD_LIBRARY_PATH=/data/data/com.termux/files/usr/lib/ollama:$LD_LIBRARY_PATH
```
Tornar permanente:
```bash
echo 'export LD_LIBRARY_PATH=/data/data/com.termux/files/usr/lib/ollama:$LD_LIBRARY_PATH' >> ~/.bashrc
```

### 5.3 — Caminho do proot-distro
O rootfs do Debian fica em (repare no `rootfs/` no meio do caminho, fácil de esquecer):
```
$PREFIX/var/lib/proot-distro/containers/debian/rootfs/root/...
```

### 5.4 — Importar um `.gguf` externo pro Ollama (sem duplicar espaço)
```bash
printf 'FROM %s\n' "/caminho/completo/para/o/arquivo.gguf" > ~/Modelfile.nome
ollama create nome-do-modelo -f ~/Modelfile.nome
```

---

## 6. Integração no `ai-workspace`

### 6.1 — `models/providers.json`
Novo provider `local`, com os dois modelos catalogados (`auto`, `qwen2.5:0.5b-instruct-q4_K_M`, `qwen2.5-coder:1.5b-instruct-q4_K_M`).

### 6.2 — `models/client.js`
- `pickLocalModel(prompt)` — roteamento automático: prompts curtos e sem termos de código → 0.5B; prompts longos ou com palavras-chave de código (função, componente, bug, api, css, etc.) → 1.5B coder.
- `callOllamaLocal(prompt, options)` — chama `POST /api/chat` no Ollama local.
- `checkLocalOllama()` — verifica se o `ollama serve` está de pé e lista modelos instalados.
- `ensureOllamaRunning()` — **sobe o `ollama serve` automaticamente** em background se estiver offline, antes de qualquer chamada local.
- O roteador **Mimo** agora usa o modelo local como **fallback real** quando nenhuma API de nuvem está configurada no `.env` (antes retornava um texto fixo/falso).

### 6.3 — `multiagent/pipeline.json`
Novo preset `"local"` — pipeline 100% offline, sem custo, mas lento (recomendado só para tarefas simples/teste de fluxo, não para o pipeline completo de 6 agentes).

### 6.4 — `configs/workspace.json`
`local` adicionado à lista de providers disponíveis.

### 6.5 — `workspace-cli/index.js`
Novo comando `workspace local`:
```bash
workspace local status            # verifica Ollama + modelos instalados (sobe o serve sozinho se preciso)
workspace local ask "<mensagem>"  # roteamento automático entre os 2 modelos
workspace local router "<msg>"    # mostra qual modelo seria escolhido, sem executar
```

---

## 7. Comando global do Workspace

O `workspace-cli/package.json` já tinha `"bin": {"workspace": "./index.js"}`. Ativado com:
```bash
cd ~/ai-workspace/workspace-cli
npm link
```
A partir daí, `workspace <comando>` funciona em qualquer pasta do sistema (o bin global do npm no Termux já cai no `$PATH`). **Importante:** isso ativa só a CLI — o `ollama serve` continua sendo um processo separado, mas agora o comando `workspace local` sobe ele sozinho se estiver offline (seção 6.2 — `ensureOllamaRunning`).

---

## 8. Recomendação de uso, hoje

| Cenário | Use |
|---|---|
| Triagem, perguntas rápidas, decisões simples | `workspace local ask "..."` (roteia pro 0.5B) |
| Gerar/editar código pontual | `workspace local ask "..."` (roteia pro 1.5B) — ou force com `--model qwen2.5-coder:1.5b-instruct-q4_K_M` |
| Pipeline completo (Planner→Frontend→Backend→Review→Fix→Deploy) do Flor de Lótus ou outro projeto sério | `mimo` (cloud) — os modelos locais são bons para tarefas pontuais, não para o pipeline de 6 agentes |
| Sem internet / sem créditos de API | `mimo` cai automaticamente no `local` como fallback |

## 9. Próximo passo natural
Ver o documento `02-chat-ui-plano.md` — plano de UI/UX para a Fase 11 do roadmap (Interface PWA), pensado para usar esses mesmos modelos locais com uma experiência de chat.
