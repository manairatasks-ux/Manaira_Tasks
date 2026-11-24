# Manaíra Board V74.31 — ausência de XML por 12 horas

**Usar juntamente com Ponte GZ V4.4, entregue separadamente.** A V4.3 não produz inventários completos e, portanto, a automação não funcionará com ela.

1. Iniciar Board V74.31 primeiro. O `src/init-db.js` aplica migrações aditivas (sem excluir notas ou XMLs).
2. Só depois instalar/iniciar Ponte GZ V4.4, mantendo a configuração `.env` da ponte anterior.
3. A Ponte V4.4 sincroniza as NF-e e envia inventário de ambas as pastas **somente** quando a varredura e todos os envios terminarem sem falha, sem arquivos em escrita e sem limite de leitura atingido.
4. Cada inventário completo registra presença em cada pasta. Para iniciar a contagem, o XML já precisa ter sido visto pelo menos uma vez em inventário completo, na nova versão.
5. Se o XML desaparecer de ambas, a contagem inicia; se reaparecer, reinicia. Se os inventários estiverem separados por mais de 30 minutos, reinicia por segurança. Com menos de 12h, nada é lançado.
6. Após 12h de ausência comprovada por inventários consecutivos, somente a nota vinculada ao recebimento físico, confirmada no CPD, status `RECEBIDA_CPD`, sem pendências, sem lançamento prévio, é classificada `LANCADA` com `lancamento_origem=AUTOMATICO`.
7. Isso **não lança uma NF-e no sistema fiscal GZ**; somente atualiza o acompanhamento no Manaíra Board. Notas pendentes/sem confirmação CPD permanecem sem lançamento automático.
8. A ação manual `LANCAR` registra `lancamento_origem=MANUAL`. Eventos do sistema possuem `usuario_id=NULL`, distinto de colaboradores.
9. Em caso de reaparecimento de XML depois do lançamento automático, o Board assinala `reapareceu_apos_auto`, sem apagar histórico nem reverter sozinho o lançamento.
10. Não marcar chegada física por XML; as confirmações e os PINs são preservados.

**Importante:** a primeira varredura V4.4 faz o reconhecimento; não inicia contagem retroativa sobre XMLs antigos que nunca tenham sido observados em um inventário completo.

**Limitação de cobertura:** apenas pastas base e subpastas `MMAAAA` dentro da janela `XML_SYNC_MONTHS`. Não usar para afirmar ausência de documentos fora desse escopo. Caso haja mais de 3000 arquivos, arquivo inválido/em gravação ou fonte inacessível, o ciclo não confirma ausência e não gera lançamento automático.
