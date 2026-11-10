# Manaíra Board V74.24 — Etiquetas sem negrito

Esta atualização parte da V74.23 e altera exclusivamente a tipografia do módulo Cartazes → Etiquetas Zebra.

- Preço grande (normal e promocional): fonte Arial regular, sem Impact ou Arial Black.
- Descrição, De, Por e R$: permanecem em fonte regular.
- Textos simulados da logo na prévia: peso regular (a logo física pré-impressa não é modificada).
- ZPL da Zebra: larguras de caracteres reduzidas no preço, De/Por e R$, mantendo o tamanho vertical e as posições da versão anterior. A fonte ^A0 não oferece uma opção explícita de negrito, então usamos caracteres mais estreitos para uma aparência mais leve.
- Dimensões: 105 × 30 mm, inalteradas.

Reinicie o agente local e teste uma etiqueta normal e outra promocional antes de reativar a impressão automática. A saída física depende da fonte interna e da configuração de densidade da Zebra.
