# Plataforma Manaíra V68.2 — Pesquisa GZ

Atualização pontual do módulo Orçamentos.

- `feijao`: descrição começa com feijao (ignorando acentos e maiúsculas).
- `%feijao`: contém feijao em qualquer posição.
- `%feijao %branco`: contém ambos os termos em qualquer ordem.
- `%arroz %branco %5kg`: contém os três termos.
- Código interno e EAN numéricos: mantêm a consulta original.

O servidor repassa a expressão para a Ponte GZ e filtra os produtos retornados. A cobertura dos resultados depende da interpretação de `%` e dos limites da Ponte GZ; o filtro não consegue recuperar itens que a ponte não retornou. Retorna até 40 produtos.

Sem alterações no banco de dados, nas permissões, nos descontos ou na emissão de documentos.

Instalação: copiar .env da V68.1 e executar `npm install` e `npm start`.

Teste sugerido: comparar `feijao`, `%feijao` e `%feijao %branco` com os mesmos termos na consulta GZ.
