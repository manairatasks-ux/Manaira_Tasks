# Manaíra Board V73.6 — DANFE a partir do XML integral

## Instalação
1. Extraia em pasta NOVA, preserve o .env da V73.5.
2. `npm install` (inclui fast-xml-parser); em seguida `node .` ou faça deploy no Render.
3. Depois da implantação no Render, atualize a Ponte GZ para a V4.2. Preserve o .env da Ponte e configure `XML_SEND_FULL_XML=true`.
4. Confirme que `XML_SYNC_SECRET` e `XML_DEST_CNPJ` são os mesmos nos dois sistemas.
5. Sincronize um XML de teste (pasta limitada), confira a lista em Recebimento → Notas disponíveis (XML), abra **Visualizar DANFE** e **Baixar XML**. Só depois libere sincronização automática.

## Regras
- O XML integral é guardado em `receb_xml_pendentes.xml_original` (TEXT) no PostgreSQL.
- Em sincronizações repetidas, a chave de acesso é única, o XML é atualizado e o recebimento físico/CPD não é refeito.
- XML recebido deve corresponder à chave, número, série, CNPJ do emitente e destinatário e valor do resumo assinado.
- A visualização é uma DANFE no padrão convencional **gerada a partir do XML**, não uma cópia pixel-a-pixel da impressão particular do fornecedor. O documento fiscal eletrônico é o XML autorizado.
- PDFs completos não podem ser reconstruídos de notas antigas cujo XML integral desapareceu da rede antes desta versão.
- A rota de PDF e o download XML exigem login e permissão `recebimento_cpd`.
- A Ponte não altera ou apaga arquivos na pasta de origem.

## Importante
Compare uma nota de vários itens com a impressão do fornecedor. O layout do DANFE pode exigir refinamentos para modalidades específicas de operação, campos fiscais excepcionais ou notas com informações longas. Não use este PDF como substituto da DANFE fiscal sem validação do setor fiscal.
