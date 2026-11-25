# Manaíra Board V74.38 — Contratos comerciais

Base: V74.37 do usuário. Alteração restrita ao módulo Pontos Extras.

- Terceira seção Contratos comerciais, preservando individuais e pacotes.
- Fornecedor, número opcional, descrição, período, valor total, forma de pagamento, observações e anexo.
- Associação opcional a um ponto cadastrado. A associação não ocupa nem bloqueia o ponto.
- Contratos comerciais participam de cobrança, programação de parcelas e relatórios através do identificador de contrato existente.
- Migração aditiva executada pelo inicializador: novas colunas tipo/descricao/numero, ponto_id passa a admitir NULL.
- Mantenha backup do PostgreSQL antes de iniciar a nova versão. Não execute versões antigas após a migração sem planejar rollback.
- A integração Ponte GZ não foi alterada.
- Teste no ambiente real com banco PostgreSQL e anexo Cloudinary é necessário.
