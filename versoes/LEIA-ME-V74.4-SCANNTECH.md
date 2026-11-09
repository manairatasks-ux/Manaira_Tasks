# Manaíra Board V74.4 — Importação inteligente Scanntech

- Em Scanntech > Nova promoção, cole o texto completo copiado do portal. Clique em **Identificar dados**; revise a prévia e clique em **Preencher cadastro**.
- Preenchimento assistido de código, marca, título, preços, reembolso, limite por rede, vigência e produtos. Campos não identificados permanecem editáveis.
- **Desconto** calculado automaticamente de preço antigo menos preço novo; **ganho mínimo padrão** de 20%, editável.
- O limite por rede fica armazenado em coluna própria no PostgreSQL, com migração não destrutiva.
- A consulta ao GZ, ganho sobre custo e aprovação seletiva mantêm os comportamentos anteriores.
- A leitura é heurística: confira o texto identificado, principalmente quando o portal alterar sua formatação.
- Não aceita automaticamente promoções no portal Scanntech.
