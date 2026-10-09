# V32 — correção da impressão A4 dos cartazes

## Problema encontrado
A composição na tela estava correta em A4 horizontal (29,7 × 21 cm), mas o Chrome/Edge abria a impressão como **Retrato**. Com isso, a folha horizontal era reduzida para caber nos 21 cm de largura do papel retrato, ocupando apenas a parte superior da página e deixando uma grande área em branco.

A causa principal era o uso exclusivo de uma `@page` **nomeada** (`cartaz-a4`). O navegador não aplicava essa orientação de forma confiável à janela de impressão.

## Ajustes
- a impressão dos cartazes agora injeta temporariamente `@page { size: 297mm 210mm; margin: 0; }`;
- a regra existe apenas durante a impressão do módulo Cartazes, sem alterar os relatórios de outros módulos;
- a saída deixou de usar posicionamento absoluto;
- cada folha é travada em 297 × 210 mm;
- grade interna travada em 140 mm + 140 mm, com 7 mm de intervalo e 5 mm de margem;
- plaquinha pequena travada em 140 × 92,2 mm;
- plaquinha grande travada em 131,7 × 200 mm;
- mantida quebra exata de uma composição por folha.

## Configuração do navegador
O site consegue solicitar o A4 horizontal e tamanho físico pelo CSS. **Cabeçalhos e rodapés do navegador (data, título, URL e número da página) não podem ser desligados por JavaScript/CSS.** Para uma impressão limpa, em **Mais definições**, desative **Cabeçalhos e rodapés**. Use escala 100% quando essa opção estiver disponível.
