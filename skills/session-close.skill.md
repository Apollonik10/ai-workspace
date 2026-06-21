# Session Close Skill

## Responsabilidade
Procedimento padronizado de encerramento de sessão de trabalho para garantir que o Workspace permaneça sincronizado, atualizado e com histórico consistente.

## Fluxo de Encerramento (Checklist)

### 1. Verificação de Tarefas
- [ ] Listar todas as tarefas iniciadas na sessão atual.
- [ ] Identificar o status de cada uma (Concluído, Em Andamento, Impedido).

### 2. Atualização do Roadmap (`docs/roadmap.md`)
- [ ] Marcar com `[x]` as tarefas concluídas.
- [ ] Se aplicável, ajustar a porcentagem de progresso ou atualizar notas de versão/status das fases.

### 3. Atualização de Metadados (`projects/catalog.json`)
- [ ] Atualizar o campo `updated_at` do projeto modificado para a data atual (YYYY-MM-DD).
- [ ] Caso o status do projeto tenha mudado, atualizar o campo `status` (ex: de `active` para `completed`).

### 4. Resumo da Sessão
- [ ] Escrever um sumário executivo conciso contendo:
  - **O que foi feito**: Principais alterações, arquivos modificados ou novos arquivos.
  - **O que ficou pendente**: Tarefas que não foram finalizadas.
  - **Desafios/Impedimentos**: Qualquer problema técnico encontrado.

### 5. Definição dos Próximos Passos
- [ ] Listar as prioridades imediatas para a próxima sessão de desenvolvimento de forma clara e acionável.

### 6. Sincronização de Código (Git)
- [ ] Executar `git status` para verificar arquivos alterados, novos e deletados.
- [ ] Sugerir uma mensagem de commit clara seguindo a convenção definida na `git.skill.md`.
- [ ] Se explicitamente instruído, adicionar e realizar o commit.

## Boas Práticas
- Nunca feche uma sessão sem atualizar o `roadmap.md` ou os metadados do projeto.
- Garanta que as mensagens de commit sugeridas sejam precisas e explicativas sobre o "porquê" das alterações.
- Mantenha o resumo da sessão sucinto e focado em fatos acionáveis.
