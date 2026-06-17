# Git Skill

## Comandos Essenciais

### Inicialização
```bash
git init
git remote add origin <url>
```

### Fluxo Diário
```bash
git status
git add <files>
git commit -m "mensagem"
git push origin <branch>
```

### Branches
```bash
git branch <nome>
git checkout <branch>
git merge <branch>
git branch -d <branch>
```

### Histórico
```bash
git log --oneline
git diff
git stash
git stash pop
```

## Convenções

### Mensagens de Commit
- `feat:` nova funcionalidade
- `fix:` correção de bug
- `docs:` documentação
- `refactor:` refatoração
- `test:` testes
- `chore:` manutenção

### Branches
- `main` / `master` - produção
- `develop` - desenvolvimento
- `feature/<nome>` - funcionalidades
- `fix/<nome>` - correções

## Boas Práticas

- Commit pequeno e frequente
- Mensagens claras e descritivas
- Nunca commitar secrets
- Revisar antes de merge