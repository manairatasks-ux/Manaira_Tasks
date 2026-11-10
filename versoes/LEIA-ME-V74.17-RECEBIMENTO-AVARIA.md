# V74.17 — Recebimento físico na Avaria

1. A Prevenção cadastra e envia a remessa normalmente.
2. A Avaria acessa **Avaria**, abre a remessa **Aguardando Avaria** e clica **Iniciar conferência da remessa**.
3. A remessa passa a **Em conferência** e fica atribuída ao usuário que iniciou.
4. O conferente pode localizar pelo EAN, digitar a quantidade efetivamente encontrada (inclusive zero) e salvar parcialmente. Ao reabrir a remessa, as quantidades salvas retornam.
5. Somente com todos os itens conferidos é possível finalizar com PIN individual. Diferenças são registradas e disponibilizadas à gerência.
6. Para produtos inesperados, a interface alerta para separá-los e comunicar a ocorrência à gerência; inclusão de itens extras na remessa fechada ainda não foi implementada.

## Atenção

- Execute a inicialização/migração `src/init-db.js` antes de usar a nova versão.
- Conferência parcial usa salvamento explícito; sair sem salvar perde os dados ainda não salvos.
- A remessa em andamento pertence ao conferente que iniciou. Reatribuição administrativa ainda não implementada.
- Teste com banco real e dois usuários antes de usar em produção.
