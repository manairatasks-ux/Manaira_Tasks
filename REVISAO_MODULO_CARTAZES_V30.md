# Revisão técnica do módulo Cartazes - V30

## Problemas encontrados na V29

### 1. Funções duplicadas no JavaScript
Existiam duas declarações de `cartazAjustarDescricao()` e duas de `habilitarDragCartaz()`.
A última declaração substituía a anterior. Na prática, a primeira versão chamava o ajuste completo de descrição + preço, enquanto a segunda chamava apenas o ajuste da descrição.
Isso explica por que alterações nos valores `tamanho = ...` do preço podiam não produzir efeito no preview.

### 2. HTML da arte incompleto
A montagem do preview abria elementos de preço sem fechar todas as `div`s. No cartaz de oferta isso podia fazer o preço POR ser interpretado como filho do preço DE pelo navegador, alterando a referência de posicionamento absoluto.

### 3. CSS histórico concorrendo
O mesmo seletor era definido em blocos V24, V25 e V27. Algumas regras antigas ainda miravam `strong`, enquanto o preview já havia mudado para `.cartaz-preco`. O resultado dependia da ordem do CSS e dificultava saber qual regra estava valendo.

### 4. Preview e impressão diferentes
O preview usava `.cartaz-preco`, mas a impressão ainda reconstruía preços com `<strong>`. Isso criava dois motores visuais diferentes para a mesma plaquinha.

### 5. Pixels fixos no preview versus medidas relativas na impressão
O preview ajustava preços em px; depois a fila convertia o tamanho calculado para percentual e a impressão usava outra estrutura CSS. Isso gerava diferença entre o que era aprovado na tela e o que saía na folha.

### 6. Impressão grande dependente de deslocamentos manuais
A V29 corrigiu a rotação, mas dependia de valores fixos de `left/top` para recentralizar a arte rotacionada. A V30 centraliza a arte no frame e aplica apenas a rotação.

### 7. @page global
A regra `@page { size: A4 landscape; }` ficava carregada para toda a Plataforma Manaíra. A V30 usa uma página nomeada aplicada apenas às folhas de cartazes.

### 8. Persistência sem proteção
`JSON.parse(localStorage...)` era executado diretamente na criação do estado. Um valor local corrompido poderia impedir todo o `app.js` de iniciar.

## Estratégia adotada na V30
- Um único componente de arte serve preview e impressão.
- Uma única estrutura de preço, sem `<strong>`.
- Posições e dimensões em percentual.
- Fontes em `cqw`, relativas à própria largura da arte.
- Ajuste automático com limite de encaixe.
- Ajuste fino por slider na interface.
- Drag e teclado atualizam o mesmo objeto de layout que vai para fila e impressão.
- CSS do módulo isolado em `cartazes.css`.
- Migração de itens antigos da fila quando possível.

## Regra que não foi alterada sem confirmação
A função antiga acrescentava um dia ao `dataTerminoPromocao` para formar a validade impressa. A V30 preserva essa regra. Se a regra correta for imprimir exatamente a data final retornada pela GZ, alterar isso deve ser uma decisão funcional separada.
