# Plataforma Manaíra V16

A V16 adiciona o módulo **Galpão**, migrando a lógica do antigo projeto Python/Tkinter para a plataforma web. O estoque continua separado por produto, validade e unidades por embalagem e há um importador do `controle_estoque.db` legado.

> Antes de iniciar após atualizar para a V16, execute `npm install` para instalar a dependência `sql.js`.


## V15 — Módulo Almoxarifado

A V15 adiciona um módulo operacional simples de Almoxarifado, integrado ao controle de acesso por módulos. O foco é substituir a planilha do dia a dia sem criar complexidade desnecessária: cadastro de itens, estoque atual, entradas, saídas e histórico.

## Base arquitetural V14

Versão modular da Plataforma Manaíra com backend organizado por domínio e camadas **Route → Controller → Service → Model**, além de controle de acesso por módulo.

## Rodar local

```bash
npm install
npm start
```

Na inicialização, o sistema executa as migrações de `schema.sql` e cria/atualiza o catálogo de módulos automaticamente.

## Módulos atuais

- Atividades
- Ordem de Serviço
- Administração
- Almoxarifado
- Galpão

O Administrador Principal possui acesso permanente a todos. Os demais usuários enxergam na Central de Módulos somente os módulos liberados para sua conta.

## Gerenciar acessos

Entre em **Administração → Acessos aos módulos**. A hierarquia continua sendo respeitada: um usuário só pode alterar pessoas de nível inferior. O acesso ao módulo Administração só pode ser concedido ou removido pelo Administrador Principal.

## Estrutura principal

```text
src/
├── app.js
├── server.js
├── config/
├── middlewares/
│   ├── auth.middleware.js
│   └── module-access.middleware.js
└── modules/
    ├── auth/
    ├── usuarios/
    ├── atividades/
    ├── almoxarifado/
    ├── galpao/
    ├── os/
    └── modulos/
```

Consulte `ARQUITETURA_V14.md` e `VERSION_V14_NOTAS.txt` para os detalhes desta versão.
