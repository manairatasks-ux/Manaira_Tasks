# Manaíra Board V74.3 — Ganho percentual sobre custo (markup)

Atualização apenas do módulo Scanntech.

**Ganho anterior:** `(preco_gz / custo_gz - 1) * 100`.
**Ganho na promoção:** `(preco_promocional / (custo_gz - reembolso) - 1) * 100`.

O custo ajustado deve ser maior que zero, caso contrário o produto não pode ser ativado automaticamente.
O ganho mínimo inicial dos novos cadastros é **30%**, editável no formulário. Campanhas já salvas preservam o valor de referência gravado no banco.

A análise no navegador e o filtro de elegibilidade no servidor usam a mesma metodologia.
As notas e a consulta ao GZ não foram modificadas. As campanhas antigas conservam suas inclusões gravadas; os valores de ganho na visualização são recalculados segundo a nova fórmula.

O ganho comercial não equivale a lucro líquido e presume reembolso integral das unidades elegíveis.
