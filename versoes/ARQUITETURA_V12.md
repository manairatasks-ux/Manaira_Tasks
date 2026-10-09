# Plataforma Manaíra V12 — Arquitetura modular

## Fluxo
1. Login único da plataforma.
2. Hub inicial de módulos.
3. Entrada explícita em Atividades, Ordem de Serviço ou Administração.
4. O menu lateral mostra apenas as funções do módulo atual.
5. "Início" retorna ao Hub sem encerrar a sessão.

## Módulos
### Atividades
Mantém setores, compartilhamentos, grupos, tarefas, comentários, dashboard e relatórios.

### Ordem de Serviço
Mantém dashboard de OS, fluxo operacional, relatórios e portal público de solicitação.

### Administração
Mantém usuários, hierarquia, proprietários de setores e permissões.

## Núcleo compartilhado
Autenticação JWT, usuário logado, PostgreSQL, hierarquia e regras de acesso continuam compartilhados. Isso evita duplicar regras críticas entre módulos.

## Regra para V13+
Novas funcionalidades devem entrar em um módulo existente ou em um novo módulo do Hub. Evitar adicionar novas áreas diretamente ao menu global.

## Próxima etapa técnica recomendada
A V12 separa a navegação e os domínios sem alterar contratos da API. Em uma versão posterior, o `src/server.js` pode ser dividido fisicamente em routers (`modules/atividades`, `modules/os`, `modules/admin`) mantendo as mesmas URLs, reduzindo o risco de uma migração grande de uma só vez.
