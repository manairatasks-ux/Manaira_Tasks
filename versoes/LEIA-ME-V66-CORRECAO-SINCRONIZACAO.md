# V66 — Correção da sincronização Pedidos ao Galpão

## Por que a V65 não atualizava

A V65 rejeitava toda a atualização ao receber qualquer erro de consulta à Ponte GZ. Com 5 ou 36 erros em um universo de 1.021 produtos, ela descartava os demais resultados; antes da primeira execução 100% bem-sucedida, nada aparecia na coluna GZ.

## O que mudou

- Consulta automática de hora em hora das 06:00 às 22:00, horário America/Fortaleza, mantida.
- A consulta manual continua disponível inclusive fora do horário.
- Com pelo menos um resultado confiável, o servidor publica atomicamente um snapshot com os retornos válidos e identifica os códigos que falharam como `erro_consulta_gz`, sem inventar valores.
- Os produtos com erro não participam da sugestão de reposição; produtos com retorno válido sim.
- O painel mostra `Concluído com pendências` quando houver falhas e continua exibindo o número de erros.
- Se absolutamente nenhuma consulta retornar de forma confiável, o snapshot anterior é preservado.
- Reduzi a simultaneidade da Ponte GZ para uma requisição por vez e aumentei as pausas entre retentativas (tenta até quatro vezes por código) para reduzir falhas transitórias e limites de requisição.
- O saldo do Galpão segue consultado em tempo real, sem alterar estoques.

## Instalação e verificação

1. Faça backup do banco e mantenha a V65 salva.
2. Copie `.env` da instalação atual para esta versão V66.
3. Execute `npm install` e `npm start`. Nenhuma migração adicional de tabela é necessária.
4. Use `Sincronizar agora`; acompanhe progresso e aguarde a conclusão.
5. Quando acabar, valide que a data da consulta foi preenchida e que produtos com retorno GZ têm saldos numéricos; os produtos com falha mostrarão valores `—` e status pendente.
6. Se persistirem falhas, verifique logs/limites e acessibilidade da Ponte GZ. Esse patch tolera erros parciais, mas não consegue recuperar valores que a Ponte não forneceu.

## Nota de confiabilidade

Não consideramos o relatório integralmente atualizado quando há falhas. Os registros pendentes ficam sem cálculo para evitar sugestões equivocadas. Esta versão passou nos testes de sintaxe e precisa de verificação conectada à sua Ponte GZ e ao PostgreSQL.
