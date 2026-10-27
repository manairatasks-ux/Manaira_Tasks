# V67.6 — Carregamento rápido do Recebimento e CPD

- Quadro: uma consulta de contadores e até quatro consultas paralelas, limitadas a 8 notas por coluna.
- Não carrega duplicatas nem dados de anexos na listagem; detalhes são consultados ao clicar em Abrir nota.
- Consultas de eventos, anexos, PIN e detalhes executadas em paralelo ao abrir uma nota.
- Filtro de data usa limites de timestamp, evitando conversão na coluna e permitindo uso de índice de recebimento.
- Mantidos status, filtros, paginação, PIN, documentos, Cloudinary e controle de caminhões.

## Instalar

1. Faça cópia da V67.5 e backup do banco.
2. Extraia a V67.6 em uma pasta diferente e copie seu .env (não publique o .env).
3. Execute `npm install` e `npm start`.
4. Atualize o navegador com Ctrl+F5 e teste as quatro colunas, Abrir nota, anexos, PIN e filtros.

Não precisa executar init-db: esta atualização não cria nem modifica tabelas.
A velocidade final depende também do PostgreSQL e da rede; não foi possível medir contra o banco real.
