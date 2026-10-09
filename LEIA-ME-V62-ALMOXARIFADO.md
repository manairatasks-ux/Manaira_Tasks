# V62 — Almoxarifado com produtos e variações

## O que mudou
- Estoque: um produto principal por linha, expansível para ver tamanhos, condições e saldos.
- Cadastro: o botão **+ Novo produto** permite cadastrar um produto uma vez com uma ou várias variações; produto simples recebe a variação `Padrão`.
- Entrada e saída: variações selecionadas por grupos, sem mudar os IDs das movimentações.
- Banco: tabelas `almox_produtos` e `almox_variacoes`. O saldo permanece em `almox_itens` e o histórico em `almox_movimentacoes`. Não existe cópia de saldo.
- Produtos desativados como os IDs 29 e 18 **não** são migrados, permanecendo preservados no banco.

## Implantação segura (na ordem)
1. **Faça e TESTE um backup PostgreSQL completo** antes de qualquer migração. Separe um ambiente de homologação com cópia dos dados.
2. Mantenha o sistema em manutenção (sem entradas/saídas durante a migração).
3. No diretório principal, configure seu `.env` existente e execute `npm install`, se necessário.
4. Execute `npm run init-db` para criar as novas tabelas via `schema.sql` (ele também executa as rotinas de inicialização existentes da V61; revise essas rotinas primeiro).
5. Execute a simulação: `npm run almox:simular`. Inspecione `scripts/relatorio_almox_v62_simulacao.json` e confira, especialmente, os agrupamentos e saldos. **A simulação não altera os dados.**
6. Se estiver tudo correto, no ambiente de homologação e com o sistema parado: `npm run almox:migrar -- --confirmar=MIGRAR_V62`.
7. Confira o estoque, as entradas/saídas e o histórico. Só então repita o processo na produção com backup validado e janela de manutenção.

## Segurança e limitações
- A migração é transacional. Vincula os itens existentes, sem duplicar quantidades ou reescrever movimentações. Uma execução posterior vincula apenas itens ainda não migrados.
- Nunca apague `almox_itens` ou `almox_movimentacoes`: o sistema continua usando os registros originais.
- Revisar o JSON da simulação é obrigatório: nomes semelhantes podem significar produtos diferentes. Em caso de dúvida, corrija o plano/cadastros antes de aplicar.
- Reversão: volte ao código V61 e restaure o backup anterior à migração caso precise desfazer todas as alterações. Não elimine as tabelas V62 indiscriminadamente depois de criar novos produtos.
- A interface de edição de produto altera os metadados atuais das variações, preservando o vínculo por IDs do histórico. Para alterações de nomes com efeitos legais de auditoria, considere registrar um histórico descritivo adicional.
- Este pacote foi verificado sintaticamente, mas **não conectado ao seu PostgreSQL real**. Faça a homologação antes de usar em produção.
