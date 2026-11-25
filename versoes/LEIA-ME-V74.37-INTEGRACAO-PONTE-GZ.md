# Manaíra Board V74.37 - Integração Ponte GZ V5.1

- Nova rota autenticada `POST /api/recebimento/xml-sync/ocorrencias` para eventos cancelados e NF-e avulsas CPF.
- Os eventos são armazenados em `receb_xml_ocorrencias_especiais` pelo `initDb()` ao iniciar o Board.
- Não marca recebimento físico nem faz lançamento no GZ. Cancelamento detectado em nota já presente bloqueia o lançamento automático e sinaliza conferência fiscal.
- Configure o MESMO `XML_SYNC_SECRET` (mínimo 24 caracteres) e `XML_DEST_CNPJ` nos dois aplicativos.
- Recomenda-se backup do PostgreSQL antes da atualização. Reinicie o Board antes da Ponte.
- O HTTP 401 pode indicar HMAC/chave distinta, timestamp incorreto ou uma instância antiga do Board. Verifique a rota e as configurações em execução.
- O inventário só é concluído quando **as duas origens e todas suas subpastas** são lidas sem inconsistências. Não alteramos nem relaxamos o limite protetivo de 3.000 XMLs por origem.
- Não validado no servidor Windows, compartilhamento SMB ou PostgreSQL de produção.
