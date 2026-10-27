# Plataforma Manaíra V67 — Recebimento e CPD (primeira versão para teste)

## Preparação
1. Guarde a V66 e um backup do banco PostgreSQL. Extraia a V67 em outra pasta.
2. Copie somente o `.env` da V66 para a V67. Nunca publique `.env` no Git.
3. Configure no `.env` (ou no painel do Render):
   CLOUDINARY_CLOUD_NAME=...
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
4. Execute `npm install`, `npm run init-db` e `npm start`.
5. No módulo Administração, conceda acesso `Recebimento e CPD` aos colaboradores designados.
6. Como administrador, abra o módulo > CPD / PIN, escolha a Cibele (usuário previamente cadastrado) e crie um PIN de 6 a 10 dígitos. Apenas o usuário escolhido pode confirmar notas com seu PIN.

## Fluxo de teste
1. Crie uma nota com código do fornecedor, fornecedor, número, valor, origem (papel ou mensagem), duplicatas e vencimentos.
2. Abra a nota e adicione fotos ou PDF. A ausência das credenciais Cloudinary gera erro controlado, sem gravar anexo local.
3. No login da Cibele, confirme o recebimento com PIN. Depois marque pendente ou lançada.
4. Confira históricos e registros de caminhões.

## Proteção de dados
- Upload autenticado do Cloudinary, sem URL pública permanente, de até 8 MB por arquivo.
- PostgreSQL armazena metadados, não o conteúdo da imagem.
- Para produção, teste manualmente a entrega de arquivos autenticados, especialmente PDF, e revise regras de retenção e custos de Cloudinary.
- A confirmação é feita por PIN + sessão autenticada, não por uma senha compartilhada.

## Limitações desta versão
- Não há integração com Compras nem leitura automática de XML.
- Não há edição ou cancelamento de notas já registradas.
- O controle de caminhões usa lançamentos por categoria; registre cada caminhão apenas uma vez.
- Não há restauração automatizada de anexos que falharam no upload.
- As tabelas são criadas de forma aditiva; o banco existente não é apagado.
- Validação feita por análise e sintaxe, ainda sem teste de integração real com PostgreSQL e Cloudinary.
