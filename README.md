# Manaíra Board V2 - PostgreSQL Render

Sistema estilo Monday para gestão de setores, grupos e tarefas do Supermercado Manaíra.

## Recursos desta versão

- Node.js + Express
- PostgreSQL usando `DATABASE_URL` do Render
- Login com JWT
- Criação de setores/quadros
- Grupos livres, sem pendente/concluído fixo
- Tarefas com responsável, status, prioridade, prazo, cronograma e observações
- Comentários por tarefa
- Seed inicial automático

## Como rodar local usando banco do Render

1. Instale as dependências:

```bash
npm install
```

2. Copie o arquivo de ambiente:

```bash
copy .env.example .env
```

No Linux/Mac:

```bash
cp .env.example .env
```

3. No `.env`, cole a **External Database URL** do PostgreSQL do Render:

```env
DATABASE_URL=postgresql://usuario:senha@host.render.com:5432/banco
DB_SSL=true
JWT_SECRET=uma_chave_grande_e_segura
PORT=3000
```

4. Rode o projeto:

```bash
npm run dev
```

5. Acesse:

```txt
http://localhost:3000
```

## Login inicial

```txt
Email: admin@manaira.com
Senha: admin123
```

## Como hospedar no Render

Crie um Web Service no Render apontando para o repositório.

### Build Command

```bash
npm install
```

### Start Command

```bash
npm start
```

### Environment Variables

Configure no Render:

```env
DATABASE_URL=sua_internal_ou_external_database_url_do_render
DB_SSL=true
JWT_SECRET=uma_chave_grande_e_segura
PORT=3000
```

> Observação: para o Web Service do Render falando com o PostgreSQL do próprio Render, geralmente a Internal Database URL também funciona. Se usar External Database URL, deixe `DB_SSL=true`.

## Teste rápido de banco

Depois de rodar, abra:

```txt
http://localhost:3000/api/health
```

Se estiver tudo certo, deve retornar:

```json
{"ok":true,"database":"connected"}
```

## Atualização v2.1 - Performance

Esta versão adiciona otimizações para o sistema ficar mais leve no uso local:

- cache temporário de Dashboard e Quadros por 60 segundos;
- carregamento sob demanda ao trocar de tela;
- indicador de carregamento;
- renderização com `requestAnimationFrame`;
- busca com debounce para evitar redesenhar a tela a cada tecla;
- invalidação automática do cache ao criar/editar/excluir setores, grupos ou tarefas.

O `.env` não deve ser enviado para GitHub. Use `.env.example` como base.
