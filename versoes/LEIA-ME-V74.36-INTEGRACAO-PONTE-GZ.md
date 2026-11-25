# Manaíra Board V74.36 — Compatibilidade conservadora com a Ponte GZ

Base: V74.35, preservados os demais módulos.

- Cada nota com metadados ou XML integral inválido é rejeitada individualmente, com motivo no retorno (`rejeitadas`, `erros`); notas válidas do mesmo lote continuam sincronizando. O contrato HMAC permanece idêntico.
- XML integral modelo 55 é conferido contra chave, fornecedor, destinatário, série, número e valor. Nenhum desvio de CNPJ é aceito.
- NF-e de devolução (finalidade 4), ajuste (3), complementar (2) ou natureza especial recebe sinalização de conferência, sem recebimento em lote nem lançamento automático após 12 horas.
- Notas sem XML integral preservam o fluxo anterior; quando a Ponte sinaliza explicitamente operação especial, ficam em conferência até a sincronização integral.
- Na tela Recebimento e CPD, documentos especiais aparecem identificados e ficam bloqueados para ação em lote; o XML/DANFE continua consultável quando disponível.
- Os inventários completos e relatórios parciais mantêm as regras da V74.35. A sinalização fiscal especial não modifica presença ou ausência; apenas impede movimentação automática.

## Instalação e verificação

1. Faça backup do PostgreSQL e da instalação anterior.
2. Mantenha as variáveis `XML_SYNC_SECRET` e `XML_DEST_CNPJ`.
3. A inicialização aplica as três colunas aditivas do `xml-sync.schema.sql`. Registros históricos mantêm o fluxo anterior; uma nova sincronização integral pode identificá-los como especiais.
4. Confirme no painel as notas especiais; encaminhe as informações de `erros` da sincronização à Ponte para tratar documentos inválidos sem bloquear o lote.
5. Faça testes de ponta a ponta com a Ponte GZ em ambiente supervisionado. Esta entrega não altera o software da Ponte nem valida seu contrato atual exato, pois seu ZIP não foi anexado nesta etapa.

**Atenção:** Bloquear o recebimento em lote das notas especiais é uma decisão conservadora de segurança; o tratamento operacional destas notas deverá ser definido com a equipe fiscal.
