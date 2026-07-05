# Frontend Skill

## Tecnologias

### Fundamentos
- HTML5 semântico
- CSS3 (Flexbox, Grid, Custom Properties)
- JavaScript ES6+ (ES Modules)

### Frameworks
- React (quando aplicável)
- PWA (Service Workers, Manifest)

## Padrões

### Estrutura de Projeto
```
src/
├── components/
├── pages/
├── services/
├── utils/
└── styles/
```

### Componentes
- Componentes pequenos e focados
- Props claras e documentadas
- Estado local quando possível
- CSS Modules ou Styled Components

### Performance
- Lazy loading
- Code splitting
- Otimização de imagens
- Cache de assets

## SOLID no Frontend

- **S**: Componentes com responsabilidade única
- **O**: Extensível via props/slots
- **L**: Componentes intercambiáveis
- **I**: Interfaces pequenas
- **D**: Depender de abstrações (services, não implementações)

## Acessibilidade

- Semântica HTML
- ARIA labels
- Contraste adequado
- Navegação por teclado