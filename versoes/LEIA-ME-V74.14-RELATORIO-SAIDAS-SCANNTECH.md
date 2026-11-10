# Manaíra Board V74.14 — Relatórios Scanntech para retirada de placas

## Alteração aplicada
O relatório de saídas/retiradas de placas ficou mais próximo do modelo operacional enviado pelo usuário, com apresentação organizada para consulta e impressão A4 paisagem.

- Ordem: **data final (saída)** → **fornecedor/marca** → **descrição alfabética**, com EAN como desempate.
- Seções separadas por dia, com totais de produtos e fornecedores.
- Faixas de fornecedor e contagem de produtos em cada faixa.
- Todas as linhas mantêm EAN, descrição, início, término, preço antigo e preço promocional, além da condição de Leve Pague quando aplicável.
- Datas de início e de fim destacadas discretamente em verde e laranja.
- CSV exportado na mesma ordem do relatório na tela.
- Relatório de entrada também utiliza a ordenação cronológica por início, fornecedor e descrição, preservando as mesmas informações.

## Não alterado
Cadastro de campanhas, importação, análise de custos, margens, confirmação de placas, regras de ativação, PostgreSQL, integração GZ e todos os outros módulos.

## Testes
- Sintaxe dos arquivos JS validada com `node --check`.
- Agrupamento testado com 94 produtos simulados (três datas e nove grupos de fornecedores).
- Integridade do arquivo ZIP verificada.
- **Pendente**: inspeção visual da impressão no navegador conectado ao sistema real. A tentativa de impressão automática via Chromium não terminou no ambiente de teste.
