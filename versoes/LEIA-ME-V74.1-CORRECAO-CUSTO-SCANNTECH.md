# Manaíra Board V74.1 — Correção de custo Scanntech

Esta versão corrige somente o mapeamento do custo de aquisição no módulo Scanntech.

- A Consulta em Lote utiliza `valorCustoAquisicao` na resposta do GZ.
- A V74 estava procurando `custoAquisicao`, deixando custos e margens em branco.
- A V74.1 passa a priorizar `valorCustoAquisicao`, mantendo `custoAquisicao` como compatibilidade.
- Não há migração de banco de dados nem alteração na Ponte GZ ou no módulo Consulta em Lote.

## Teste recomendado

1. Execute a aplicação V74.1 e abra Scanntech > Nova promoção.
2. Cole os códigos `7891024030820` e `7509546651040` e consulte novamente.
3. Verifique se os custos são R$ 9,44 e R$ 11,38 (sujeitos a mudanças no GZ).
4. Confira os cálculos de margem.

**Observação**: campanhas já salvas como rascunho com custo vazio não são atualizadas retroativamente. É necessário refazer a consulta antes de salvar uma nova campanha.
