# Manaíra Board V71.12 — Correção de criação de pacotes

## Problema
Na rota `POST /api/pontos-extras/pacotes`, a instrução SQL para vincular pontos a um pacote especificava 7 colunas, mas fornecia 8 valores (incluindo uma constante zero e um parâmetro de posição a mais). O PostgreSQL rejeitava a transação com erro SQL, exibido na interface como "Falha ao processar operação de Pontos Extras".

## Correção
O `INSERT INTO pe_contratos` agora tem exatamente 7 valores para as 7 colunas. `valor=0` permanece como no projeto original, porque o valor negociado pertence ao pacote. A operação continua transacional: todos os pontos são vinculados ou o processo todo é revertido.

## Escopo
Somente `src/modules/pontos-extras/pontos-extras.routes.js` foi alterado. Nenhuma tabela, dado ou outro módulo foi modificado. Derivado da V71.11.

## Teste recomendado
Cadastre um pacote com 2 ou mais pontos livres no período. Confirme que ele aparece na lista e que seus pontos ficam vinculados. Tente também incluir um ponto ocupado no mesmo período; a operação deve ser rejeitada com mensagem de conflito identificando o ponto.
