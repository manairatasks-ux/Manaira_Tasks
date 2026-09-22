# Revisão do módulo Cartazes — V31

## Objetivo
Estabilizar o ajuste de tamanho dos textos/preços e revisar o fluxo do módulo sem alterar a integração GZ nem a lógica da fila/impressão A4.

## Erro principal encontrado
Na V30, os sliders alteravam `layout.scale`, mas o autoajuste do preview gravava o tamanho calculado novamente em `layout.fontCqw`. Como `fontCqw` tinha prioridade sobre `scale`, ao mexer em outro controle ou redesenhar o preview o tamanho anterior podia parecer voltar/resetar.

## Correção estrutural
- `scale`: passa a representar somente o valor escolhido pelo usuário.
- `fitCqw`: passa a guardar somente o tamanho final que coube na área do cartaz.
- O preview sempre parte de `scale`, calcula o encaixe e grava o resultado em `fitCqw`.
- A fila e a impressão usam `fitCqw`, preservando o aspecto visto no preview.
- Cartazes antigos com `fontCqw` são migrados automaticamente para `fitCqw`.

## Interface
- Sliders removidos.
- Campos numéricos em porcentagem:
  - Descrição: 50% a 250%
  - Preço DE: 50% a 250%
  - Preço principal/POR: 50% a 300%
- Enter ou saída do campo aplica a alteração.
- 100% é o tamanho padrão.

## Outros pontos revisados
- Mantida uma única marcação de arte para preview e impressão.
- Mantidos inteiro, vírgula e centavos no mesmo tamanho.
- Simplificada a troca Normal/Oferta, removendo condição redundante.
- Leitura de localStorage continua protegida contra JSON inválido.
- Não há funções nomeadas duplicadas no `public/js/app.js`.
- CSS do módulo permanece isolado em `public/css/cartazes.css`.

## Validações executadas
- `node --check` em todos os arquivos JavaScript do projeto: OK.
- Verificação de funções duplicadas em `public/js/app.js`: OK.
- Verificação de chaves do `public/css/cartazes.css`: OK.
- Verificação de remoção dos controles `range` do ajuste de tamanho: OK.

## Testes manuais recomendados
1. Normal com 5,99 / 9,99 / 19,99 / 129,99.
2. Alternar várias vezes entre tamanho da descrição e do preço e confirmar que nenhum valor volta sozinho.
3. Oferta: testar preço DE e POR separadamente.
4. Arrastar descrição e preço, depois alterar tamanho numérico.
5. Enviar para fila e confirmar que o visual é mantido.
6. Impressão: 4 pequenas, 2 grandes e composição mista.
7. Impressão física em 100% / tamanho real.
