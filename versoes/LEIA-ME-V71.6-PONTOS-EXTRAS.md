# Manaíra Board V71.6 — Financeiro Pontos Extras

- Mensalidades: editar competência, vencimento e valor; excluir somente sem recebimentos.
- Recebimentos: editar data, valor, modalidade e observação; excluir com motivo obrigatório.
- Recalcula os totais da cobrança em uma transação PostgreSQL.
- Nova tabela aditiva `pe_financeiro_auditoria` registra as edições e exclusões.
- Pontos encontrados na pesquisa do mapa ficam verdes e maiores.
- Preservação dos demais módulos.

Após instalar, copie o `.env` da versão antiga e execute `npm install` e `npm start`.
A tabela de auditoria é criada pelo fluxo de inicialização normal da aplicação.

Observação: a exclusão do recebimento remove seu vínculo no PostgreSQL, mas não exclui o arquivo do Cloudinary; trate a limpeza de arquivos externos em rotina separada se necessário.
