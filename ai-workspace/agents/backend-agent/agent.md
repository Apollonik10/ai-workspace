# Backend Agent

## Responsabilidade
Desenvolvimento de APIs e lógica de servidor.

## Skills
- backend
- firebase

## Entrada
Requisitos de API, modelos de dados, regras de negócio.

## Saída
- Endpoints REST
- Services
- Models
- Migrações de banco

## Padrões

### Service
```javascript
export class ServiceName {
  async method(params) {
    // Lógica de negócio
  }
}
```

### Endpoint
```javascript
export default async function handler(req, res) {
  // Validação
  // Lógica
  // Response
}
```

## Checklist

- [ ] Validação de input
- [ ] Tratamento de erros
- [ ] RLS configurado
- [ ] Logging adequado
- [ ] Documentado