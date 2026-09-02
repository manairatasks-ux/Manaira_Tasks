# Plataforma Manaíra V15 — Módulo Almoxarifado

A V15 mantém a arquitetura modular criada nas versões anteriores e adiciona o domínio `almoxarifado` seguindo o fluxo:

`Route -> Controller -> Service -> Model -> PostgreSQL`

## Estrutura

```text
src/modules/almoxarifado/
├── almoxarifado.routes.js
├── almoxarifado.controller.js
├── almoxarifado.service.js
└── almoxarifado.model.js
```

## Responsabilidades

- **Routes:** endpoints e proteção por autenticação/permissão de módulo.
- **Controller:** recebe a requisição e transforma o resultado em resposta HTTP.
- **Service:** valida campos e regras, como quantidade positiva e destino/responsável em saídas.
- **Model:** executa SQL e transações de estoque.

## Regra central de estoque

O saldo de um item nunca é editado diretamente. Toda alteração de quantidade passa por uma movimentação de `ENTRADA` ou `SAIDA`. A movimentação grava saldo anterior e saldo posterior, permitindo auditoria simples.

## Tabelas

### almox_itens
Cadastro do material e saldo atual.

### almox_movimentacoes
Histórico imutável de entradas e saídas, com usuário responsável pelo lançamento.
