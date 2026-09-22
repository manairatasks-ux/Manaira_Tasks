# V33 - Correção do cartaz grande na impressão A4

## Problema observado
Na impressão A4 horizontal o cartaz grande era rotacionado diretamente dentro de um frame estreito. No Chromium/Chrome, o cálculo do box transformado podia deslocar a arte lateralmente e o `overflow: hidden` cortava parte do cartaz.

## Correção
- O cartão grande continua ocupando aproximadamente **13,17 cm x 20 cm** na folha.
- A rotação agora é aplicada ao **frame de 20 cm x 13,17 cm**, centralizado por `left:50%`, `top:50%` e `translate(-50%, -50%)`.
- A arte interna deixa de ser rotacionada e ocupa 100% do frame.
- Na mídia de impressão as medidas são fixadas em **200 mm x 131,7 mm**.
- A mudança vale tanto para o preview da montagem quanto para a impressão.

Objetivo: eliminar o recorte/deslocamento lateral do cartaz grande sem alterar as plaquinhas pequenas nem a composição 2 pequenas + 1 grande.
