# Manaíra Board V74.20 — Etiquetas Zebra (ajuste visual)

Esta versão revisa o módulo **Cartazes → Etiquetas Zebra** com foco em aproximar a etiqueta impressa do modelo físico real enviado em foto.

## Ajustes desta versão

- Recalibração do layout **normal**.
- Recalibração do layout **promocional**.
- Pré-visualização mais fiel ao padrão real.
- Ajustes no ZPL do agente Windows para aproximar:
  - descrição no topo,
  - código de barras e EAN à esquerda,
  - “R$” separado no modelo normal,
  - “De:” e “Por:” no modelo promocional,
  - preço grande deslocado para a direita,
  - reserva da área do logo pré-impresso.

## Observação importante

Mesmo com a recalibração, a etiqueta pode ainda exigir microajustes em campo, porque a impressão real depende de:

- bobina/etiqueta exata,
- densidade configurada na Zebra,
- calibragem da mídia,
- driver ZDesigner,
- velocidade e escuridão da impressora.

Use os campos de **Ajuste X** e **Ajuste Y** para os acertos finos.

## Arquivos principais alterados

- `public/js/etiquetas-zebra.js`
- `public/css/etiquetas-zebra.css`
- `AGENTE-ZEBRA-WINDOWS/agente_zebra.py`

## Recomendação de teste

1. Execute o agente Windows atualizado.
2. Acesse `Cartazes → Etiquetas Zebra`.
3. Faça um teste com uma etiqueta **normal**.
4. Faça outro teste com uma etiqueta **promocional**.
5. Se necessário, ajuste X/Y e repita.

## Base

Versão derivada da V74.19, sem remover as funcionalidades já adicionadas.
