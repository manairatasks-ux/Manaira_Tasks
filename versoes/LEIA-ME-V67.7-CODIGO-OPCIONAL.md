# V67.7 — Recebimento/CPD: código do fornecedor opcional

O campo **Código fornecedor** pode ficar vazio; **Fornecedor**, **Número NF** e **Valor** continuam obrigatórios.

## Banco
Execute `npm run init-db` uma vez antes de iniciar esta versão para aplicar a mudança da regra de duplicidade no PostgreSQL. O banco existente e os históricos são preservados.

- Com código informado, bloqueia nota com o mesmo código, número e série.
- Sem código, bloqueia nota com o mesmo nome de fornecedor (ignorando caixa e espaços externos), número e série.
- Fornecedores distintos sem código podem possuir o mesmo número de nota.

A integração com o Cloudinary, o painel por etapas, PIN e caminhões não foram alterados.

## Instalação
1. Faça backup do banco PostgreSQL e guarde a V67.6.
2. Extraia a V67.7 em pasta nova, copie o `.env` anterior.
3. Execute `npm install`, `npm run init-db` e `npm start`.
4. Cadastre uma nota sem código de fornecedor para validar.

Se já existirem registros sem código com fornecedor/número/série duplicados, a criação do índice recusará a migração; nesse caso, revise os registros antes de executar novamente.
