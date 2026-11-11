# Manaíra Board V74.26 — Relatórios de Avarias por fornecedor

Base: V74.25 Prevenção/Avaria. As outras áreas do Board permanecem inalteradas.

## Recursos
- Menu **Relatórios de Avaria** com filtro por período, fornecedor (incluindo Sem fornecedor), setor e motivo; detalhamento, resumo, CSV e impressão.
- Cadastro e edição gerencial de fornecedores, associação manual código interno de produto → código fornecedor e importação TXT/CSV de três colunas.
- 19.967 vínculos únicos e 747 fornecedores diferentes provenientes do material fornecido (1.154 linhas idênticas repetidas descartadas).
- Importação inicial é executada na inicialização apenas se `ta_fornecedor_produtos` estiver vazia; mudanças feitas na interface não são sobrescritas.
- **Código de produto da lista é código interno do GZ, não EAN**. Para novas bipagens, a API de produto guarda também o código interno. Para registros antigos, a consulta do relatório tenta associar via `gz_catalogo_produtos` usando EAN; sem confirmação mantém `Sem fornecedor`.
- Os relatórios são de **remessas de Prevenção → Avaria**, não das baixas do sistema Controle de Avarias independente. O relatório de quantidades não significa baixa efetivada de estoque.
- Administradores/gerentes podem cadastrar fornecedores e importar planilha. Relatórios exigem acesso ao setor Avaria.

## Implantação
É necessário executar a inicialização/migração do PostgreSQL (`npm run init-db`, conforme seu processo de deploy) para criar as novas tabelas. Faça backup do banco antes. A carga inicial importa a lista de 19.967 associações somente se a tabela de vínculos estiver vazia.

## Formato importação
Arquivo UTF-8 `.txt` separado por TAB ou `.csv` separado por ponto-e-vírgula: `codigo_fornecedor;nome_fornecedor;codigo_interno_produto`.

## Importante
Fotos e demais comportamentos V74.25 preservados. A consulta de catálogo para itens antigos depende da disponibilidade de `gz_catalogo_produtos` e pode mostrar Sem fornecedor para produtos não encontrados. Relatórios limitados a 15.000 itens por consulta (reduza período para conjuntos maiores). Teste integração em ambiente de homologação antes de operar.
