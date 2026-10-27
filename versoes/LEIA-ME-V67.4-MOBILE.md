# Plataforma Manaíra V67.4 — Recebimento mobile

Base: V67.3. Mudanças restritas aos arquivos `public/js/recebimento.js` e `public/css/recebimento.css` e à versão do package.json.

- A listagem vira cartões no celular.
- Pop-up de detalhes ocupa a tela do celular, com rolagem interna.
- Duas opções independentes para anexos: Escolher arquivo (galeria/PDF) e Tirar foto (solicita câmera traseira, conforme suporte do navegador).
- Prévia da foto, nome/tamanho, validação de JPG/PNG/WebP/PDF e limite de 8 MB.
- Envio usa a mesma rota e as mesmas permissões/cloudinary da V67.3.
- No computador o botão Tirar foto pode abrir um seletor de arquivo/câmera, conforme o navegador.
- Acesso à câmera depende de suporte e permissões do navegador; normalmente exige HTTPS em acesso remoto pelo celular.

Instalação: copiar .env da V67.3, npm install, npm start; forçar atualização do navegador. Nenhuma migração do banco é necessária.

Atenção: cadastro de notas, operações do CPD, auditoria e armazenamento permanecem como na V67.3. Testar com câmera real e Cloudinary configurado antes de produção.
