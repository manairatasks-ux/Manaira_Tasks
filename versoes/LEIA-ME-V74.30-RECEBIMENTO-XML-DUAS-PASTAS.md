# Manaíra Board V74.30 — Recebimento e CPD: Ponte GZ com duas pastas

## Compatibilidade confirmada com Ponte GZ V4.3

A Ponte GZ V4.3 mantém exatamente o envio `POST /api/recebimento/xml-sync` usado pela V4.2: `notas` com dados da NF-e e, opcionalmente, `xml_original`, com HMAC nos cabeçalhos. O Board já valida esse contrato e agrupa as NF-e pela chave de 44 dígitos (`ON CONFLICT (chave)`). Por isso, **não é necessária migração de tabelas nem alteração do webhook** para receber XMLs das duas pastas.

## Ajuste pontual desta versão

- Novo `GET /api/recebimento/xml-sync/resumo`, protegido pelas mesmas permissões do módulo, informa quantidade de NF-e únicas, XMLs integrais, pendências e horário do último XML sincronizado.
- A aba **Notas disponíveis (XML)** passa a exibir o último XML sincronizado e a quantidade total de NF-e únicas no banco, sem alterar a consulta existente de notas, DANFE ou confirmação física.
- O resumo NÃO afirma que as duas pastas estão disponíveis: é uma visão do banco e não substitui o status de cada origem fornecido pela Ponte V4.3.
- Os demais módulos e tabelas foram mantidos.

## Ordem recomendada de publicação

1. Publicar o Board V74.30 no Render e verificar o funcionamento atual do Recebimento e CPD.
2. Manter a Ponte V4.2 em execução até essa verificação terminar.
3. Preparar a Ponte V4.3 em pasta separada, preservando as configurações de `.env` e verificando `XML_SEND_FULL_XML=true` para gerar DANFE.
4. Parar a V4.2 e iniciar a V4.3 usando a conta Windows que tenha acesso a `\\10.111.155.106\Arquivos\XMLS`.
5. Na aba de XML do Board, confirmar a atualização da data e a presença de notas da nova origem. Conferir também o status individual das origens na ponte.

**Nota:** a V4.3 não inclui o identificador da pasta de origem no payload das notas; o Board não consegue distinguir a origem de uma NF-e individual. A chave fiscal já elimina duplicatas.
