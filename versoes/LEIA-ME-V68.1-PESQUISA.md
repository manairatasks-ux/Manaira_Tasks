# V68.1 — Pesquisa de Orçamentos

- Adicionar produto limpa campo e resultados apenas após inclusão bem-sucedida.
- Produto já presente gera aviso e não altera sua quantidade.
- Resultados compactos horizontais, com status, estoque, preço normal, promoção vigente e validade quando disponibilizados pela Ponte GZ.
- Status explicitamente INATIVO bloqueia inclusão. Status não informado aparece como desconhecido.
- Saldo GZ é informativo e não reserva estoque.
- A situação cadastral pode usar o último catálogo sincronizado quando a Ponte GZ não retornar status; verifique a data desse catálogo antes de uso operacional.
- Sem alteração de esquema PostgreSQL ou dos demais módulos.

Instalação: copie .env da versão anterior, execute npm install e npm start. Não é necessário init-db.
Valide preços, validade e estoque contra o GZ em ambiente de teste.
