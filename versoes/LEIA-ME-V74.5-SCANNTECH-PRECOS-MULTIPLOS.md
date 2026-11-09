# Manaíra Board V74.5 — Scanntech / preços antigos múltiplos

Base: V74.4 fornecida pelo usuário. Os outros módulos foram preservados.

## Funcionamento

1. Em Scanntech > Nova promoção, cole o texto completo copiado do portal.
2. Clique em **Identificar dados do texto** e confira a prévia. Listas como `[R$ 25,99, R$ 27,99]` passam a ser reconhecidas, assim como os descontos individuais.
3. Clique em **Preencher cadastro com esses dados**.
4. Se houver múltiplos preços antigos, o sistema mostra **Campanha com múltiplos preços antigos — revisão recomendada**. O registro como ativada fica bloqueado por padrão; ainda é possível salvar rascunho.
5. Clique em **Consultar produtos no GZ**. O preço normal individual é lido da consulta; um preço que não corresponde às opções divulgadas é sinalizado para conferência.
6. Se decidir aderir, assinale **Analisei os preços e autorizo...** e registre os produtos aptos. A autorização também é verificada pelo backend. Os produtos sem cadastro ativo, sem custo válido ou abaixo do ganho mínimo continuam fora da campanha ativada.
7. Em rascunhos com múltiplos preços, a ativação posterior também exige confirmação adicional.

## Relatórios

Para campanhas novas com preços antigos múltiplos, o relatório de colocação/retirada usa o preço normal do GZ registrado individualmente na análise (em vez do primeiro preço do portal para todos os códigos). É importante revisar divergências antes da ativação. A ordem dos preços no texto da Scanntech não implica correspondência com a ordem dos produtos.

## Banco

O schema acrescenta colunas com `ADD COLUMN IF NOT EXISTS`:
- `st_campanhas.precos_antigos` (JSONB)
- `st_campanhas.descontos_scanntech` (JSONB)
- `st_campanhas.multiplos_precos_autorizados` (BOOLEAN)
- `st_itens.preco_antigo_item` (NUMERIC)

Nenhum registro existente é removido; novas colunas recebem valores padrão quando aplicável. A migração é executada pelo mecanismo de inicialização existente.

## Validação realizada

- Sintaxe JS: `node --check` dos 3 arquivos alterados
- Parsing de exemplos com preço único e com múltiplos preços e descontos
- Validação estática da regra de autorização no servidor e consulta SQL de relatório
- Arquivo ZIP testado quanto à integridade

**Pendente:** teste ponta a ponta com o PostgreSQL real e API do GZ. A ativação na Manaíra Board não executa a ativação no portal Scanntech. O reembolso está sujeito às regras da campanha.
