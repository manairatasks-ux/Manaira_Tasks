# V67.3 — Detalhes de notas em modal

A tela **Recebimento e CPD** agora abre o detalhe da nota em uma janela centralizada (modal), mantendo a lista ao fundo.

- Fecha pelo X, tecla Esc e clique fora da janela.
- Rola apenas o conteúdo do detalhe, sem deslocar a lista.
- Mantém duplicatas, anexos, PIN, operações e histórico.
- Não modifica o banco de dados nem os demais módulos.

## Execução

Copie o `.env` da instalação anterior (não coloque credenciais no ZIP), execute `npm install` se necessário e depois `npm start`. Atualize o navegador com Ctrl+F5.

## Testes

Abra uma nota; confira o modal e feche pelas três maneiras. Reabra, envie anexo de teste e confira o histórico. Teste as ações do CPD com conta autorizada no banco de homologação.

Os arquivos JavaScript foram validados quanto à sintaxe; não foram realizados testes integrados no PostgreSQL/Cloudinary.
