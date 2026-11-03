# Manaíra Board V71.13 — Código nas plaquinhas

Adicionado `COD: <código>` em posição fixa discreta, logo abaixo da divisória superior e à esquerda, nos cartazes normal e oferta. O valor vem prioritariamente do código interno GZ (`codigo`), com fallback para EAN se não houver código interno.

A informação aparece na prévia, na fila (ao armazenar o cartão) e na impressão A4, utilizando a mesma função de arte. Plaquinhas já salvas na fila usam o EAN armazenado caso não tenham o campo `codigo`.

Arquivos alterados: `public/js/app.js` e `public/css/cartazes.css`. Não há alteração de banco de dados, preço, validade ou tamanho de impressão.
