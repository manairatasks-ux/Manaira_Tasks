# Plataforma Manaíra V13 — Arquitetura

A V13 reorganiza o backend para reduzir o acoplamento do antigo `server.js` e preparar a plataforma para novos módulos.

## Fluxo

`Route -> Controller -> Service -> Model -> PostgreSQL`

- **Routes**: mapeiam URL e middleware.
- **Controllers**: recebem HTTP e entregam a resposta.
- **Services**: regras de negócio, permissões e validações.
- **Models**: acesso ao PostgreSQL.
- **Middlewares**: autenticação e controles transversais.
- **Shared**: utilitários e regras reutilizadas entre módulos.

## Estrutura

```text
src/
├── app.js
├── server.js
├── config/
│   ├── database.js
│   └── env.js
├── middlewares/
│   └── auth.middleware.js
├── shared/
│   ├── profile.service.js
│   └── utils.js
└── modules/
    ├── auth/
    ├── usuarios/
    ├── atividades/
    └── os/
```

### Observação importante
Autenticação e Usuários já estão separados integralmente em Controller/Service/Model. Atividades e OS foram isolados por domínio e já possuem Model e Service próprios; os controllers preservam parte do código legado de relatórios/PDF para reduzir risco de regressão nesta versão. Nas próximas versões esses blocos podem ser extraídos gradualmente para services especializados sem alterar as rotas públicas.
