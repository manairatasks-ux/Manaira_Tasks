# Plataforma Manaíra V68 — Orçamentos

## Instalação

1. Faça backup do PostgreSQL e preserve a V67.7.
2. Copie seu `.env` para esta versão (não coloque o `.env` no GitHub).
3. Execute `npm install`, `npm run init-db` e `npm start`.
4. Em Administração > Acessos aos módulos, habilite **Orçamentos** para os usuários autorizados.
5. Acesse o módulo pela Central de Módulos.

## Fluxo

- Pesquise por nome, código interno ou código de barras. A consulta é enviada para a Ponte GZ.
- Adicione produtos e quantidades à lista.
- Descontos por item e geral (percentual ou valor) somente são aceitos pelo servidor para perfis gerente/administrador.
- Salvar faz uma **nova conferência de preço** de todos os produtos no GZ. Isso pode levar alguns segundos em orçamentos longos. Se o GZ estiver indisponível, o salvamento será bloqueado para não emitir preços não verificados.
- A emissão cria registro imutável de preço e descontos no PostgreSQL; numeração `ORC-ANO-ID`.
- O histórico disponibiliza PDF e CSV com separador `;` e BOM UTF-8 para abrir no Excel. CSV não é `.xlsx` nativo.
- Orçamento não reserva estoque e não altera dados no GZ.

## Regra de preços

O módulo considera `precoVenda` e promoção/especial (`precoEspecial` ou `precoPromocao`) somente quando as datas de início/fim indicam vigência, seguindo a lógica já usada nos cartazes. Confirme com testes reais na Ponte GZ se esses campos correspondem ao preço **de terminal** da sua loja; não usar em produção antes desta validação.

## Segurança e testes

Não foram apagadas ou migradas tabelas anteriores. O `init-db` adiciona `orcamentos` e `orcamento_itens`, e registra o novo módulo de acesso. A conferência de descontos é realizada também no servidor.

Testar em cópia do banco: pesquisa e preços, salvar sem desconto, salvar com desconto como gerente, rejeitar desconto sem permissão, PDF, CSV e reinício do servidor. Não testado contra GZ/PostgreSQL reais neste ambiente.
