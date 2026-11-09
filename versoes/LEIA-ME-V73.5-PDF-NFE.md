# Manaíra Board V73.5 — Data de emissão e prévia PDF de NF-e

A tela **Recebimento → Notas disponíveis (XML)** agora exibe a **data de emissão** e o botão **Visualizar PDF**.

## ATENÇÃO

O PDF é um **espelho de conferência interna** reconstruído a partir dos dados do XML. Não é um DANFE oficial e não substitui o arquivo fiscal original.

A V73.4 recebia só metadados. Para disponibilizar os detalhes e os produtos, a **Ponte GZ V4.1** envia um resumo adicional nas próximas sincronizações. É necessário atualizar a Ponte e executar uma nova leitura. Os registros já recebidos, CPD e histórico são preservados.

O endpoint de PDF exige usuário autenticado com acesso ao módulo Recebimento/CPD. O XML original não é movido nem alterado.

É necessário executar `npm install` e iniciar a V73.5. A migração adiciona uma coluna JSONB à tabela existente sem excluir notas.
