# Manaíra Board V74.8 — Correção de paginação da DANFE

Base: V74.7 enviada pelo usuário.

- Reorganiza a primeira página em A4 com quadros fiscais mais compactos.
- Mostra o cabeçalho fiscal completo apenas na primeira folha; páginas seguintes têm identificação resumida da NF-e e tabela de continuação.
- Reserva a margem inferior para o rodapé; numeração `Folha N/Total` sem criar páginas adicionais.
- Mantém a leitura do XML integral, a autenticação de acesso e as rotas existentes (`/api/recebimento/xml-pendentes/:chave/pdf` e `/xml`).
- Produtos, impostos e informações adicionais continuam a ser extraídos do XML, sem alteração na Ponte GZ ou no banco.

**Verificação necessária no ambiente real:** compare a NF-e 934313 (Pau Brasil) e outras NF-e com muitos itens/observações com uma DANFE do emissor. A impressão oficial pode variar de emissor para emissor; este gerador não promete identidade visual pixel a pixel.
