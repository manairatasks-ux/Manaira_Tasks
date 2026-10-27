# V67.5 — Quadro de notas fiscais

Base: V67.4. Alterações limitadas ao módulo Recebimento/CPD, interface, CSS e rota de listagem.

- Quatro grupos: Recebidas, No CPD, Pendências (inclui divergências) e Lançadas.
- Filtro padrão: notas recebidas hoje, horário America/Fortaleza.
- Período personalizado usa a data de registro no Recebimento (não a data da última mudança de status).
- Busca por fornecedor, código ou número, feita no servidor.
- Oito notas por página, paginação independente por grupo.
- Contadores por grupo para o período filtrado.
- Responsivo (quatro colunas em monitores amplos, duas em tablets e uma no celular).
- Popup, anexo de foto/câmera, ações do CPD e histórico mantidos.

Não precisa executar `init-db`, nenhuma tabela foi alterada. Copie o .env da instalação atual e rode `npm install` e `npm start`.

Atenção: o filtro por data considera a data de recebimento no mercado, mesmo se a nota for lançada posteriormente.
