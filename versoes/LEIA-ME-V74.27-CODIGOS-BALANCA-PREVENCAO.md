# Manaíra Board V74.27 — Códigos de balança na Prevenção

Base: V74.26.

- Cadastro por bipagem/digitação permite códigos numéricos de 1 a 14 dígitos, inclusive códigos internos de 4 dígitos usados na balança.
- Códigos com menos de 8 dígitos são consultados como `codigoInterno` na Ponte GZ, não como EAN.
- De 8 a 14 dígitos, permanece a consulta por código de barras.
- Para código interno curto, o sistema confere o código retornado pelo GZ antes de aceitar o produto, evitando associações equivocadas.
- Foto, motivo, setor, remessas, conferência, PIN e relatórios foram preservados.
- Nenhuma migração de banco necessária nesta versão.

Validação sugerida: testar códigos internos de balança com e sem zeros à esquerda, além de EAN-8/EAN-13.
