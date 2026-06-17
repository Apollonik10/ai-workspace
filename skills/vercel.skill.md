# Vercel Skill

## Conceitos

### Deploy
- Deploy automático via git
- Preview Deployments
- Production Deployments
- Rollback

### Configuração
```json
{
  "version": 2,
  "builds": [...],
  "routes": [...]
}
```

## Comandos

### CLI
```bash
vercel              # Deploy preview
vercel --prod       # Deploy produção
vercel env          # Gerenciar variáveis
vercel domains      # Gerenciar domínios
```

### Git Integration
- Push para branch → Preview
- Merge para main → Production
- Comentário no PR com URL

## Padrões

### Projeto Estático
```
/
├── index.html
├── vercel.json
└── public/
```

### Projeto com Functions
```
/
├── api/
│   └── index.js
├── vercel.json
└── package.json
```

## Variáveis de Ambiente

- Definir no painel Vercel
- Usar .env.local para desenvolvimento
- Nunca commitar secrets

## Performance

- CDN automático
- Edge Functions
- ISR (Incremental Static Regeneration)
- Image Optimization