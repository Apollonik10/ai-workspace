# Backend Skill

## Tecnologias

### APIs
- REST
- GraphQL (quando aplicável)
- Edge Functions (Deno)

### Bancos de Dados
- PostgreSQL (Supabase)
- Firestore
- Redis (cache)

### Autenticação
- Supabase Auth
- JWT
- OAuth

## Padrões

### Estrutura de Projeto
```
src/
├── routes/
├── controllers/
├── services/
├── models/
├── middleware/
└── utils/
```

### Services
- Um service por domínio
- Lógica de negócio isolada
- Testável independentemente

### Segurança
- Validação de input
- Rate limiting
- RLS (Row Level Security)
- HTTPS obrigatório

## SOLID no Backend

- **S**: Services com responsabilidade única
- **O**: Extensível via interfaces
- **L**: Services intercambiáveis
- **I**: Interfaces pequenas
- **D**: Depender de abstrações

## Boas Práticas

- Logging estruturado
- Tratamento de erros
- Validação em todos os limits
- Documentação de endpoints