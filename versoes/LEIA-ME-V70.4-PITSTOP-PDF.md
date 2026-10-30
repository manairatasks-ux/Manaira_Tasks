# Manaíra Board V70.4 — Relatórios PDF Pit Stop

Base: V70.3 (sem alterações intencionais na operação do módulo).

## Melhorias
- Logo oficial Pit Stop Manaíra recortada das margens excessivas e aplicada nos dois modelos de PDF.
- Novo cabeçalho com identificação da unidade e do relatório.
- Resumo visual do abastecimento/período.
- Linhas e cartões de produtos mais legíveis, com comprovantes fotográficos.
- Rodapé com paginação e identidade visual padronizada.
- Formato A4, cores moderadas (azul, amarelo, branco e cinza).

## Arquivos alterados/adicionados
- `src/modules/pitstop/pitstop.routes.js`: somente os endpoints de PDF passam a chamar o novo gerador.
- `src/modules/pitstop/pitstop.pdf.js`: novo gerador visual dos dois relatórios.
- `public/img/pitstop-logo.jpg`: logo tratada, com as bordas brancas reduzidas.

## Implantação
Preserve sua V70.3 e copie seu `.env` para esta pasta. Instale dependências conforme `package.json` (`npm install`) e inicie como de costume (`npm start`). Não é necessário executar `init-db` nem migrar o banco de dados.

## Validação
Sintaxe JavaScript e integridade do ZIP verificadas. A geração renderizada e os dados/arquivos de imagens reais devem ser testados no ambiente com `pdfkit`, PostgreSQL e Cloudinary funcionando.
