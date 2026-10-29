# Manaíra Board V70.1 — Pit Stop mais ágil

- Redução de consultas repetidas ao GZ no mesmo lançamento (cache em memória por EAN, 5 minutos).
- Foto otimizada no navegador, respeitando orientação e até 1600 px na maior dimensão; preserva arquivo original quando otimização não ajuda ou não é suportada.
- Mensagens claras durante identificação, preparação da foto e salvamento, protegendo contra cliques duplicados.
- Próxima bipagem liberada somente depois da resposta de sucesso do servidor.
- Mantidos sessão, foto obrigatória, histórico, auditoria, permissões e PDFs.

## Instalação
Use uma nova pasta e seu `.env` atual. `npm install` e `npm start`. Não execute init-db.

## Validação
Sintaxe JS verificada. Testar com PostgreSQL, GZ e Cloudinary reais no ambiente antes de uso em produção.
