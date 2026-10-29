# Manaíra Board V69.2 — Padronização de paleta

Base: V69.1. Alteração restrita à camada visual do projeto.

- Azul Manaíra nos botões, controles, títulos e indicadores sem semântica operacional.
- Recebimento/CPD: menu, modal, quadros e tabelas com azul. Status de lançado (verde) e pendência (amarelo) preservados.
- Orçamentos: remoção de verde estrutural, preservando o destaque verde da promoção e os alertas em vermelho.
- Pedidos ao Galpão: cabeçalho, botões, barra de progresso e controles em azul; alertas continuam semanticamente diferenciados.
- Cartazes: apenas controles; não altera impressão de cartazes ou modelos PDF.
- Paleta global e legibilidade da V69.1 preservadas.

## Instalação
Copie o `.env` da instalação anterior. `npm install` se necessário, depois `npm start`. Não é necessário `init-db`: nenhum esquema ou lógica foi alterado. Force atualização de cache com Ctrl+F5.

## Validação
Conferência estática de inclusão do CSS e do pacote. Não substitui inspeção visual nos navegadores e telas reais. Compare especialmente Orçamentos, Recebimento/CPD, Pedidos ao Galpão, Galpão, Cartazes e os estados de alerta.
