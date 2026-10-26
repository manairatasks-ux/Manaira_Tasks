# V64 — Desativação de variações sem saldo

No Almoxarifado > Estoque atual, expanda um produto. Variações com saldo **0** mostram **Desativar**. Após confirmação e motivo obrigatório, o item sai das listagens e dos totais; movimentações e ajustes permanecem preservados. Se era a última variação ativa, o produto também é desativado.

## Instalação
1. Faça backup do banco de dados e mantenha a pasta V63 como cópia.
2. Copie o `.env` para esta versão.
3. Rode `npm install`, `npm run init-db` e `npm start`.
4. Teste primeiro num banco de homologação com um item sem saldo.

Não há `DELETE` físico. Os IDs continuam ocupados e não podem ser reutilizados. Reativação não está nesta versão; para desfazer, restaure com procedimento administrativo validado. Se uma variação antiga estiver inativa, seu rótulo continua reservado pela restrição única `(produto_id, rotulo)` do PostgreSQL.
