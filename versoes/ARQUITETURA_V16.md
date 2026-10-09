# Plataforma Manaíra V16

## Módulo Galpão

Fluxo web:

`public/js/app.js -> /api/galpao -> galpao.routes -> galpao.controller -> galpao.service -> galpao.model -> PostgreSQL`

O módulo segue o padrão modular adotado nas versões anteriores.

### Entidades

**galpao_produtos**
Produto mestre identificado por código de barras.

**galpao_estoque**
Saldo por lote. A chave lógica é:
`produto_id + validade + unidades_por_embalagem`.

**galpao_movimentacoes**
Histórico unificado de ENTRADA e SAIDA. Movimentos novos guardam saldo anterior e posterior. Movimentos importados do sistema Python mantêm `origem = SQLITE` e não tentam reconstruir saldos históricos que não existiam no banco antigo.

**galpao_importacoes**
Auditoria das migrações do arquivo SQLite.

### Importador legado

O navegador envia `controle_estoque.db` via multipart/form-data. O backend usa `sql.js` em memória para validar e ler as tabelas `produtos`, `estoque`, `entradas` e `saidas`. A migração para PostgreSQL ocorre em uma única transação.

O estoque atual do SQLite é copiado como fotografia oficial do saldo. Entradas e saídas antigas são importadas apenas como histórico, evitando alterar o saldo atual durante a migração.
