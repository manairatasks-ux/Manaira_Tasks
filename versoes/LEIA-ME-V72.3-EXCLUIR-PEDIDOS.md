# Manaíra Board V72.3 — Excluir pedidos do Manaíra Rotas

Nova opção **Excluir** na lista lateral do mapa, no popup do marcador e na tela Pedidos. Solicita confirmação antes de excluir definitivamente.

- Aceita exclusão somente de pedidos em preparação, prontos ou cancelados **que nunca foram vinculados a uma viagem**.
- Pedidos despachados, entregues, não entregues ou vinculados a paradas/viagens não podem ser excluídos para preservar o histórico.
- Exclusão registrada em `mr_eventos`, preservando identificador e número do pedido.
- Não há alteração de schema ou perda de dados dos demais módulos.
- Após excluir, lista, mapa, indicadores e seleções são atualizados.

Teste: crie um pedido de teste, localize-o, clique em Excluir e confirme; ele deve desaparecer do mapa. Tente excluir um pedido já em viagem: o servidor deve impedir.

Instalação: manter o `.env` existente e substituir o projeto pelo ZIP completo. Banco PostgreSQL e configuração Geoapify são preservados.
