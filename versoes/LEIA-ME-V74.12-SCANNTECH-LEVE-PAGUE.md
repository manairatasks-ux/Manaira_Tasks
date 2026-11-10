# Manaíra Board V74.12 — Scanntech: Normal e Leve Pague

## Alteração
Somente o módulo Scanntech foi alterado. O cadastro normal permanece com o fluxo anterior.

**Normal:** comportamento anterior, com preços e reembolsos unitários.

**Leve Pague:** aba específica para campanhas por quantidade mínima (ex.: 6 unidades por R$ 11,46), com:
- quantidade mínima;
- preço antigo e preço promocional totais do conjunto;
- reembolso total do conjunto;
- conversão para preços/reembolso por unidade na consulta de custo e na análise GZ;
- reconhecimento automático de título `LEVE N ...`, trecho `Levando N unidades`, valores totais, reembolso fixo por unidade e EAN-8/EAN-13;
- registro da modalidade e dos totais no PostgreSQL sem alterar campanhas antigas;
- condição de quantidade na visualização da campanha e nos relatórios de placas.

## Exemplo conferido com o leitor
Campanha #4603735: Leve 6 KUAT PET 250ML; preço total antigo R$ 11,94, novo R$ 11,46; unitários R$ 1,99 e R$ 1,91; reembolso total R$ 0,42 e unitário R$ 0,07; EAN-8 78912946; vigência de 01/11/2026 a 15/11/2026.

## Operação
Abra Scanntech > Nova promoção, selecione **Leve Pague**, cole o conteúdo do portal, identifique, revise e preencha, consulte o GZ e salve. A aba Normal permanece disponível.

## Compatibilidade e validação
O schema é atualizado pelo `src/init-db.js` na inicialização, com migrações `ADD COLUMN IF NOT EXISTS`. Não é preciso limpar o banco. Proteções de autenticação, permissões, validação de margens e campanhas conflitantes permanecem.

Testes efetuados: sintaxe JS dos três scripts alterados, parser de Leve Pague (Kuat e segundo conjunto), parser Normal, integridade do ZIP. **Não foi realizado teste integrado com o PostgreSQL e a API GZ de produção**, portanto recomenda-se testar o fluxo completo em um rascunho antes de ativar uma campanha real.

**Atenção:** o preço promocional é condicionado à compra da quantidade mínima. O Manaíra Board faz o controle interno; não altera automaticamente a oferta no portal Scanntech nem na frente de caixa.
