# Firebase Skill

## Serviços

### Firestore
- Banco NoSQL
- Realtime listeners
- Offline support
- Regras de segurança

### Authentication
- Email/Password
- Google Auth
- Anonymous Auth
- Custom Claims

### Hosting
- Deploy estático
- SSL automático
- CDN global
- Rewrites/Redirects

### Cloud Functions
- Serverless
- Triggers
- HTTP functions
- Scheduled functions

## Padrões

### Estrutura
```
functions/
├── src/
│   ├── index.js
│   └── services/
├── package.json
└── .env
```

### Regras de Segurança
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Boas Práticas

- Índices adequados
- Regras granulares
- Estrutura denormalizada quando necessário
- Validação no client e server