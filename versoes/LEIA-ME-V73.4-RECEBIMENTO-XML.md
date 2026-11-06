# Manaíra Board V73.4 — Recebimento XML via Ponte GZ V4

Esta versão adiciona uma aba **Notas disponíveis (XML)** ao módulo Recebimento e CPD.

## 1. Configurar Board

No `.env` local ou no painel Environment do Render:

```env
XML_DEST_CNPJ=09143892000154
XML_SYNC_SECRET=O_MESMO_SEGREDO_DA_PONTE_GZ_COM_24_OU_MAIS_CARACTERES
```

Reinicie o servidor após adicionar as variáveis. O segredo deve ser diferente da senha do GZ, de qualquer PIN ou de `BRIDGE_API_KEY`. Não publique o `.env`.

## 2. Configurar Ponte GZ

Use a **Ponte GZ V4** disponibilizada separadamente, de preferência no computador que já consegue abrir o compartilhamento XML. Ajuste `XML_FOLDER` e execute `npm install` e `node server.js`.

O envio é periódico e autenticado. O serviço no Render não lê arquivos SMB diretamente da rede do supermercado.

## 3. Uso na operação

1. Abra Recebimento e CPD → **Notas disponíveis (XML)**.
2. Pesquise fornecedor ou número da nota.
3. Confira os documentos **fisicamente recebidos**.
4. Marque várias notas, escolha origem (papel/mensagem), clique em **Confirmar recebimento físico das selecionadas**.
5. Acompanhe as notas no quadro atual de Recebimento/CPD, onde as ações individuais continuam disponíveis.

XMLs disponíveis não significam mercadoria recebida. As duplicatas não são inventadas: os dados bancários/vencimentos devem ser conferidos pelo CPD com a documentação fiscal.

## Importante

- Não altera nem remove dados do Banco PostgreSQL existente.
- Notas duplicadas ou já recebidas não são registradas novamente automaticamente.
- Notas sem protocolo reconhecido ficam para conferência.
- Ainda **não trata automaticamente XML de cancelamento** e não integra o status de lançamento real no GZ. Não utilizar a lista como prova de validade fiscal ou lançamento.
- A listagem é limitada a 400 documentos mais recentes por consulta; filtre por fornecedor/nota para localizar documentos.
- Testes de sintaxe foram feitos; teste a ponte, a rede e o PostgreSQL no seu ambiente antes de implantar em produção.

## Primeiro teste controlado

- Não ative `XML_SYNC_ENABLED=true` na Ponte durante o teste inicial.
- Verifique que o Board V73.4 está executando e com `XML_SYNC_SECRET` e `XML_DEST_CNPJ` corretos.
- A chamada manual `/xml-sync/run` da Ponte V4 **não limita a cinco notas**: ela pode sincronizar todas as notas das competências configuradas. Não execute até planejar o lote de teste.
- A sincronização grava somente uma lista de notas disponíveis, **não confirma a chegada física**, não altera arquivos compartilhados e não lança no GZ.
- A chave XML deve ter pelo menos 24 caracteres e ser idêntica na Ponte e no Board.
