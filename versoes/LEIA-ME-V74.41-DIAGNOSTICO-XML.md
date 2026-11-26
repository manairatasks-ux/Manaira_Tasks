# Manaíra Board V74.41 — Diagnóstico XML fora da tela operacional

Base: V74.40.

- **Notas disponíveis (XML)**: removidos resumo técnico de sincronização, inventário, relatório parcial, histórico de verificações e nota técnica de cautela. Permanecem abas, filtros, botões de recebimento, documentos, listagem e paginação.
- **CPD / PIN**: incluído o botão **Abrir diagnóstico** para perfis identificados pelo servidor como `administrador`. Ao clicar, exibe resumo PostgreSQL, último inventário completo, último parcial, histórico e observação de segurança. A consulta é feita somente quando o diagnóstico é aberto.
- Layout das ações e abas de XML adaptado para celular.
- Nenhuma regra de negócio, rota, esquema PostgreSQL, periodicidade da Ponte ou lógica de 12 horas foi alterada.
- A visibilidade administrativa usa `perfil.administrador` da rota CPD/PIN existente. O controle de autorização das APIs segue inalterado.

Antes de instalar: faça backup e teste a interface com usuário comum e administrador; a consulta efetiva à rede e ao banco depende do ambiente da loja.
