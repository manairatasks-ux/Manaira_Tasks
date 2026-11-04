# Manaíra Board V73.1 — Correção de acessos da Produtividade E-commerce

**Correção:** o código `ecommerce_produtividade` já existia no catálogo de módulos (src/init-db.js), mas não constava do conjunto `CODIGOS_VALIDOS` em `src/modules/modulos/modulo.service.js`. Na gravação das permissões de um usuário, a validação descartava silenciosamente esse código.

O novo código está autorizado na validação do serviço de permissões. Não é necessário recriar o banco ou refazer as importações VIP.

## Testar
1. Copie o `.env` do projeto anterior.
2. Execute `npm install` (se necessário) e `node .`.
3. Acesse Administração → Acessos aos módulos, selecione um funcionário com nível hierárquico inferior ao seu, marque **Produtividade E-commerce** e clique em **Salvar acessos**.
4. Reabra os acessos e confirme que a caixa continua marcada. Faça login com o usuário para testar o módulo.

**Observação:** perfis não podem editar acesso de usuários do mesmo nível ou superior, conforme regra geral existente. O administrador principal já possui acesso a todos os módulos ativos.
