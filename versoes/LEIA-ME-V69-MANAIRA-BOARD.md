# Manaíra Board — V69

Esta versão atualiza somente a identidade visual da V68.5.

- Nome de exibição: Manaíra Board (login, menu, início e aba do navegador).
- Tema global em `public/css/manaira-board-v69.css`, carregado após as folhas existentes.
- Menu azul escuro, conteúdo claro, botões azuis e detalhes amarelos/vermelhos discretos.
- Logotipo existente reutilizado do arquivo `public/img/favicon.png`.
- Nenhuma migração de banco de dados ou alteração em cálculos, APIs, histórico e PDFs.
- Razão social nos documentos fiscais/comerciais permanece inalterada.

## Instalação
1. Guarde V68.5 e faça backup de seus dados.
2. Extraia V69 em uma nova pasta.
3. Copie seu `.env` para a raiz da V69. Nunca publique `.env`.
4. Execute `npm install` e `npm start`. Não precisa executar `init-db` por causa do tema.
5. No navegador, atualize com Ctrl+F5 para invalidar estilos anteriores.

## Testes sugeridos
Valide login, central, menus, orçamentos, galpão, almoxarifado, recebimento e versões mobile.
Esta entrega contém validação estática; a experiência com o banco real depende do seu ambiente.
