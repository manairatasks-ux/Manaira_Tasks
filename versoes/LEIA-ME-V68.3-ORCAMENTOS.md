# Plataforma Manaíra V68.3 — Orçamentos

## Alterações
- Dois layouts de PDF (empresa: inspirado no PDF fornecido; cliente: campos simplificados), com até 24 itens por página e paginação automática.
- Valores unitários, subtotal e total com desconto por item na tela.
- Edição de orçamento (dados do destinatário, quantidades, descontos, itens e observações).
- Cancelamento lógico pelo histórico, com motivo obrigatório e auditoria; não apaga registros.
- A edição preserva o preço originalmente emitido dos itens já existentes. Produtos novos precisam ser consultados novamente pelo GZ.
- Documentos cancelados ficam identificados no PDF.

## Atualização
1. Faça backup do PostgreSQL e mantenha a V68.2 arquivada.
2. Extraia a V68.3 em **nova pasta**. Copie o `.env` com cuidado.
3. Execute `npm install`, `npm run init-db` e `npm start`.
4. Use o Histórico para editar, cancelar, obter PDF ou CSV.

## Restrições e testes pendentes
- Autorização de desconto: gerente/administrador; cancelamento: gerente/administrador; edição sem desconto: autor ou gerente/administrador.
- O cadastro do CPF é opcional; CNPJ para empresa é obrigatório nesta versão, sem validação algorítmica.
- As alterações são não destrutivas no schema, mas **a aplicação com PostgreSQL real e a geração visual do PDF não foram testadas neste ambiente**.
- O PDF empresarial reproduz a identidade/estrutura do documento de referência, não é um preenchimento pixel a pixel da folha original.
- O CSV continua sendo o formato de exportação para Excel.
- Testar em homologação antes de utilizar no supermercado.
