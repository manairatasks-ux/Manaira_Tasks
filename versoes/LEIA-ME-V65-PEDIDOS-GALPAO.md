# V65 — Pedidos ao Galpão: sincronização automática GZ

## Funcionamento

- Sincronização em segundo plano entre 06:00 e 22:00 (horário `America/Fortaleza` / Brasília), em cada hora do relógio. Fora dessa janela, apenas via botão manual.
- O processo no servidor, e não o navegador, executa consultas GZ. A página carrega imediatamente o último snapshot completo, com data e situação, e consulta os saldos do Galpão atualizados.
- O snapshot GZ e o progresso ficam no PostgreSQL na tabela `pedidos_galpao_sync`, criada automaticamente ao iniciar o servidor.
- O relatório anterior é mantido caso ocorram falhas GZ; novas atualizações completas só são publicadas quando todas as consultas terminarem sem erro de transporte. Produtos não encontrados e sem saldo GZ continuam identificados.
- Um advisory lock PostgreSQL impede sincronizações simultâneas inclusive com várias instâncias do servidor. O progresso da execução pode ser consultado por qualquer instância.
- Não faz entradas, saídas, transferências ou baixas do estoque.

## Instalação

1. Guarde a V64 e faça backup do banco.
2. Copie o seu `.env` para a pasta nova.
3. Execute `npm install`, `npm start` (ou `npm run init-db` previamente).
4. Abra Pedidos ao Galpão. Se o servidor iniciar dentro da janela e não houver sincronização dessa hora, iniciará a primeira consulta automaticamente. Até terminar, será mostrado o estado sem snapshot e o progresso.
5. Teste o botão **Sincronizar agora** e confira se o último relatório continua disponível durante a atualização.
6. Teste que uma entrada/saída no Galpão atualiza a comparação sem exigir nova consulta GZ (a tela consulta o saldo Galpão a cada 30 s quando aberta).

## Observações

- O agendamento depende de pelo menos uma instância do servidor estar ativa; em serviços com suspensão automática, configure hospedagem que permaneça ligada no horário de operação.
- Sincronização iniciada às 22:00 pode terminar após 22:00; nenhuma nova execução automática começa fora do horário.
- As datas de sincronização correspondem à conclusão bem-sucedida da leitura GZ; o saldo Galpão é recalculado ao carregar a tela.
- Caso o GZ falhe para qualquer produto, a tentativa falha e preserva o snapshot. Os registros da tentativa continuam disponíveis como erro no painel.
- O código foi validado sintaticamente; **teste funcional com banco de homologação** antes de usar em produção.
