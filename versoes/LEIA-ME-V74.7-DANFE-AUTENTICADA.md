# Manaíra Board V74.7 — DANFE e XML autenticados

## Correção

A tela Recebimento e CPD > Notas disponíveis (XML) abria o endereço `/api/recebimento/xml-pendentes/:chave/pdf` ou `/xml` diretamente em uma nova aba. Como o servidor exige `Authorization: Bearer <token>`, isso resultava em `Token não informado.`.

Agora os botões solicitam os arquivos com o token da sessão atual, sem colocar o token em parâmetros de URL. A DANFE abre em uma nova aba usando URL de objeto local; se a abertura for bloqueada, o PDF é baixado. O XML é baixado com seu nome fiscal correspondente. Erros de sessão e de geração são mostrados na própria tela.

## Teste

1. Entrar na Manaíra Board usando uma conta autorizada para Recebimento e CPD.
2. Abrir Notas disponíveis (XML), localizar uma nota cujo XML integral já tenha sido sincronizado.
3. Clicar em Visualizar DANFE e depois em Baixar XML.
4. Conferir a abertura do PDF no navegador e a integridade do XML baixado.

A Ponte GZ e o PostgreSQL não precisam de mudanças para esta correção. A função ainda exige XML integral disponível para cada nota. O leiaute e as informações fiscais da DANFE precisam ser conferidos com notas reais antes do uso oficial.
