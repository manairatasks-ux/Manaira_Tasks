# Plataforma Manaíra V63 — Ajuste de estoque do Almoxarifado

Esta versão adiciona **Almoxarifado → Ajustes** sem alterar saldos durante a inicialização.

## Instalação

1. Faça backup do PostgreSQL.
2. Extraia o projeto e configure o `.env` da instalação anterior.
3. Execute `npm install` e `npm run init-db` para criar a nova tabela `almox_ajustes`.
4. Inicie `npm start`, entre com usuário autorizado ao módulo Almoxarifado e abra a quinta etapa **Ajustes**.
5. Faça um ajuste de teste em ambiente de homologação e confira o histórico e a listagem de estoque.

## Regras

- A contagem física substitui apenas a quantidade da **variação** selecionada.
- Motivo e observação (mínimo 10 caracteres) são obrigatórios.
- O banco confere o saldo anterior e bloqueia ajuste baseado em saldo desatualizado (HTTP 409).
- A atualização do item e a gravação de auditoria ocorrem na mesma transação.
- Histórico de entradas e saídas permanece intocado; o histórico de ajustes fica separado.
- Ajuste não é entrada ou saída; não incrementa os indicadores dessas operações.
- O script não modifica produtos, variações ou histórico durante inicialização.

**Importante:** ainda não há ferramenta de editar/desativar cadastros nesta tela; esta entrega trata especificamente **ajuste de quantidade física** no padrão do Galpão.
