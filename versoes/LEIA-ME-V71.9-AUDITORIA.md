# Manaíra Board V71.9 — Auditoria de Pontos Extras

- Novo item **Auditoria** no menu principal do módulo Pontos Extras.
- Histórico de inclusões, alterações, exclusões, reposicionamento, anexos, fotos e recebimentos efetuados pelo módulo.
- Consulta paginada com filtros por área, ação, período e pesquisa.
- Visualização dos estados antes/depois (limitada aos campos de negócio, sem conteúdo binário de anexos).
- Preservação dos registros de auditoria financeira já existentes na V71.8; evita exibição duplicada quando houver registro equivalente recente.
- Tabela nova `pe_auditoria_geral` criada por migração aditiva no arranque normal.

**Limitações:** os eventos anteriores à instalação só estarão disponíveis se já tiverem sido auditados no sistema anterior. A captura da auditoria geral ocorre após a resposta de uma operação bem-sucedida: falhas de escrita no log são apontadas no servidor, não revertendo a operação original. Nenhum outro módulo foi alterado.
