# Manaíra Board V74.15 — Controle entre Prevenção e Avaria

Versão experimental do módulo **Prevenção e Avaria** sobre o pacote V74.14, mantendo as demais páginas e módulos.

## Ativação e permissões

1. Suba os arquivos no mesmo serviço Node.js/PostgreSQL usado pelo Manaíra Board.
2. Na inicialização o `src/init-db.js` cria as quatro tabelas independentes `ta_*` e cadastra o módulo `transferencias_avaria`.
3. No módulo Administração do Board, conceda a permissão **Transferências Prevenção e Avaria** aos usuários que precisam abrir a tela. Administrador principal tem acesso geral ao módulo.
4. Na nova tela **Acessos e PIN**, a gerência atribui os setores **Prevenção**, **Avaria** ou **Ambos**. Um usuário sem setor atribuído consegue apenas consultar as remessas, se já tiver acesso ao módulo.
5. Cada operador configura seu próprio PIN numérico de 4 a 8 dígitos. Para alterar o PIN, é preciso informar o PIN atual.

## Fluxo operacional

- **Prevenção:** Nova remessa → cadastrar/salvar os produtos e quantidades → confirmar envio com PIN.
- **Avaria:** Abrir uma remessa enviada → digitar a contagem física de todos os itens → confirmar recebimento com PIN.
- **Resultado:** Se todas as quantidades coincidirem, a remessa fica **Conferida**. Se alguma divergir, fica **Com divergência** e a diferença aparece na tela.
- **Gerência:** pode encerrar uma divergência, obrigatoriamente com justificativa e PIN. As quantidades originais não são alteradas.
- **Auditoria:** eventos e responsáveis ficam gravados no PostgreSQL, com horários do servidor.

## Regras de segurança e integridade

- Não é possível editar os itens depois do envio.
- Quem enviou não pode realizar o recebimento da mesma remessa, mesmo tendo acesso aos dois setores.
- Os PINs são armazenados como hashes bcrypt, não em texto simples.
- APIs exigem autenticação do Board e permissão específica para o módulo; cada etapa valida o setor do operador e o estado atual da remessa.
- Recebimento e envio usam transações com travamento da remessa para evitar confirmações concorrentes.
- As tabelas existentes e módulos anteriores não foram modificados além do cadastro do novo módulo.

## Limitações desta versão piloto

- Não há leitura direta de balanços, integração automática com o GZ, importação por planilhas ou ajuste de estoque: os produtos são cadastrados manualmente.
- Não há função de redefinição administrativa do PIN esquecido. É necessário procedimento de recuperação seguro antes de disponibilizar isso na operação.
- O painel carrega as últimas 250 remessas; ainda não possui paginação e relatórios de exportação.
- O histórico não registra a atribuição de permissões como evento de remessa; alterações de acesso são efetuadas pela gerência.
- Não foi executado teste integrado com o PostgreSQL de produção. Testar em ambiente de homologação com dois usuários distintos antes de colocar em uso.
