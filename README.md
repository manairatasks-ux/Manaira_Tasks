# Manaíra Board V9

Versão V9 com separação entre gestão de tarefas e OS, cadastro de usuários, permissões básicas e responsáveis vinculados por usuário.

## Rodar local

```bash
npm install
npm start
```

## Login inicial

- Email: `admin@manaira.com`
- Senha: `admin123`

## Novidades da V9

- Cadastro de usuários no painel de Configurações.
- Usuários podem ser habilitados para receber tarefas e/ou OS.
- Responsável de tarefas agora é selecionado por lista de usuários cadastrados.
- Responsável principal de OS agora é selecionado por lista de usuários cadastrados.
- Página "Minhas tarefas/OS" para colaboradores acompanharem o que foi atribuído a eles.
- Colaboradores/encarregados iniciam na própria área.
- Estrutura preparada para permissões por perfil.
- Mantém portal público protegido de solicitação de OS.

## Variáveis de ambiente

Use `.env.example` como base para criar `.env`.
