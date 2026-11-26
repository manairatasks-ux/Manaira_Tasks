# Manaíra Board V74.40 — CPD / XML

- Três abas: Pendentes (padrão), Sob observação, Todas as notas.
- Pendentes: chaves presentes no último inventário completo aceito, sem classificação de lançamento no Board e sem sinalização de erro.
- Sob observação: tipos especiais, não autorizadas, reaparecimento após classificação automática, divergência ou produtos para cadastrar.
- Todas as notas: histórico paginado, filtrado inicialmente pelo mês de emissão atual, com seletor de mês.
- Busca e paginação no PostgreSQL (50 linhas por página).
- O recebimento físico continua manual e protegido pelas mesmas validações.
- Não há alteração na Ponte GZ V5.2 nem na regra de 12 horas.

**Limitação fiscal relevante:** a regra existente das 12 horas classifica a nota como LANCADA no Board; NÃO registra operação no GZ nem comprova seu lançamento fiscal. Para esconder notas por lançamento efetivo no GZ, será preciso integrar uma fonte autoritativa de lançamentos do GZ.

**Observação:** Presença representa o último inventário completo aceito, não consulta em tempo real. XML rejeitado antes de ser persistido não é listado nesta aba; ele consta no diagnóstico de sincronização da Ponte.

Instalação: faça backup, atualize o Board e reinicie. Não requer migração de schema.
