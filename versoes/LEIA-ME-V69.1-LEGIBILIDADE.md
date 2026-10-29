# Manaíra Board V69.1 — revisão de legibilidade

Base: V69 enviada pelo usuário. Atualização de aparência; nenhuma mudança nas APIs, no PostgreSQL, em JavaScript, nos PDFs ou na lógica dos módulos.

## Alterações
- Tipografia e contraste reforçados nos elementos compartilhados (títulos, labels, campos, dicas, tabelas e navegação).
- Orçamentos: resultados GZ, preços, etiquetas, itens e histórico legíveis sem abandonar a disposição horizontal.
- Recebimento/CPD: cartões das quatro colunas, números, descrições, status, paginação e detalhes de notas.
- Pedidos ao Galpão: tabelas, descrições auxiliares e controles de consulta.
- Galpão: legendas de validade e lote.
- Consulta de Produtos, Almoxarifado, RH e demais telas: ajustes compartilhados de contraste, tabelas e formulários.
- Adicionada `public/css/manaira-board-v69-1-legibilidade.css` como última folha de estilo no `public/index.html`.

## Como testar
1. Extraia em uma nova pasta e copie somente o `.env` da versão atual.
2. `npm install` (caso faltem dependências) e `npm start`.
3. No navegador, faça `Ctrl+F5` para forçar a atualização dos estilos.
4. Confira Consulta de Produtos, Recebimento/CPD, Orçamentos, Galpão, Almoxarifado e telas de celular.

Não é preciso `init-db`. Nenhum arquivo existente de histórico, backup ou cadastro foi removido.

## Limitações
Revisão realizada por inspeção de código e CSS, sem renderização completa com banco GZ/PostgreSQL e telas reais. Ajustes finos ainda podem ser necessários em componentes que são desenhados dinamicamente. O CSS de impressão e a produção de PDFs foram preservados.
