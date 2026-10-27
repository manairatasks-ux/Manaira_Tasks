# V67.2 — Correção do botão Abrir no Recebimento e CPD

- Exibe os detalhes da nota acima da tabela, com rolagem automática.
- Mostra erros de carregamento de detalhes, eventos ou anexos.
- Desabilita temporariamente o botão durante a abertura.
- Mantém PostgreSQL, notas, duplicatas, PIN e demais módulos sem mudança.

## Instalar

Extraia em uma pasta nova, copie seu `.env` da V67.1 e execute `npm install` e `npm start`. Nenhuma migração de banco é necessária nesta atualização. Faça backup antes de atualizar produção.

## Testar

Em Recebimento e CPD > Notas fiscais, clique em Abrir. Os detalhes devem aparecer acima da tabela. Se ocorrer erro, uma mensagem ficará visível acima.
