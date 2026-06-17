# MCP - Model Context Protocol

## Visão Geral

Conexão com ferramentas externas via protocolo MCP.

## Integrações Previstas

### GitHub
- Repositórios
- Issues
- Pull Requests
- Actions

### Vercel
- Deploys
- Projetos
- Domínios
- Environment Variables

### Firebase
- Firestore
- Authentication
- Hosting
- Cloud Functions

### APIs Externas
- Supabase
- OpenAI
- Outros serviços

## Fluxo

```
Agente → MCP Client → MCP Server → Ferramenta Externa → Resultado
```

## Segurança

- Credenciais em .env (gitignored)
- Tokens com escopo mínimo
- Validação de input/output