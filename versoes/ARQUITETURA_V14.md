# Arquitetura V14 — acesso por módulo

A V14 mantém a arquitetura modular da V13 e adiciona uma camada de autorização acima de cada domínio.

```text
Requisição
  ↓
auth.middleware
  ↓
module-access.middleware
  ↓
Route / Controller
  ↓
Service
  ↓
Model
  ↓
PostgreSQL
```

## Novas tabelas

- `modulos`: catálogo dos módulos disponíveis na plataforma.
- `usuario_modulos`: relação entre usuário e módulos que ele pode acessar.

## Novo módulo de backend

```text
src/modules/modulos/
├── modulo.routes.js
├── modulo.controller.js
├── modulo.service.js
└── modulo.model.js
```

## Regras principais

1. O Administrador Principal sempre possui acesso a todos os módulos ativos.
2. A Home mostra somente os módulos permitidos ao usuário.
3. O backend também valida o módulo; esconder o card não é considerado segurança.
4. A hierarquia continua valendo: só é possível alterar usuários de nível inferior.
5. Somente o Administrador Principal altera a permissão do módulo Administração.
6. O acesso ao módulo não substitui permissões internas de setor, tarefa ou hierarquia; ele funciona como a porta de entrada do domínio.

## Expansão futura

Para adicionar um novo módulo, cadastre-o na tabela `modulos`, crie sua pasta em `src/modules/` e proteja as rotas com `requireModuleAccess('codigo_do_modulo')`.
