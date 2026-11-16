# Manaíra Board V74.28 — correção de classificação Scanntech

Base: V74.27. Alteração restrita a `public/js/scanntech-parser.js`.

- "Levando 1 unidade" é promoção **Normal**, mesmo com múltiplos EANs participantes.
- Condições "LEVE N" ou "Levando N unidades" com N >= 2 continuam como **Leve Pague**.
- Títulos "POR R$ 2,09 ..." agora são reconhecidos.
- Preço antigo, novo, desconto e reembolso são mantidos por unidade quando a modalidade é Normal.

Validação local: `node --check` e testes do parser com oferta Normal de uma unidade e ofertas Leve Pague de seis unidades. Não houve teste de integração com GZ/PostgreSQL ou navegador de produção.
