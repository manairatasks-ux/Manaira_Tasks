# Manaíra Board V74.25 — Prevenção e Avaria

Base: Manaira_Board_V74_24(2).zip. Alterações restritas ao módulo Prevenção/Avaria.

## Implementado
- Cadastro de cada produto com setor de origem, motivo padronizado e foto obrigatórios.
- Motivos: Produto avariado; Degustação de cliente; Fermentado; Vencido; Próximo do vencimento; Furado; Bichado; Microfuro; Outros.
- Campo de explicação obrigatório ao selecionar Outros.
- No celular: botões separados para fotografar pela câmera ou selecionar da galeria.
- Fotos JPG/PNG/WEBP até 8MB, upload para Cloudinary autenticado (já usado no Board), imagem vinculada à remessa no PostgreSQL.
- Visualização da foto, do setor e do motivo pela equipe da Avaria na conferência e nos itens conferidos.
- Validação no servidor e na interface; não é possível confirmar envio com produtos incompletos ou alterações locais não salvas.
- Histórico de alteração de itens com valores anteriores e novos (incluindo referências das fotos), sem permitir edição após envio.
- Remessas antigas continuam legíveis mesmo sem foto/motivo/setor. Rascunhos antigos precisarão ser completados para envio.

## Ativação
O `npm start` executa `initDb()` que atualiza automaticamente o banco (schema.sql do módulo). O serviço Cloudinary deve estar configurado com `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET`, como nos demais módulos com fotos.

## Escopo
Esta entrega incorpora os campos pedidos. Não muda as regras de conferência cega, reatribuição de conferente, produtos extras ou relatórios avançados, que foram levantados como melhorias adicionais ainda não implementadas.

## Validação
Arquivos JS validados por `node --check`. É necessário testar integração com PostgreSQL, Cloudinary e câmera no ambiente real antes da produção.
