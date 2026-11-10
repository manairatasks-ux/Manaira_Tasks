# Manaíra Board V74.19 — Etiquetas Zebra (versão piloto)

## Novidade
No módulo **Cartazes**, a navegação agora contém **Etiquetas Zebra**. A consulta já existente `/api/cartazes/consulta` é reutilizada (mesma lógica de preço normal e promoção ativa com vigência, sem deduzir promoções apenas do valor).

## Instalação na estação Windows (cada usuário/computador)
1. Acesse o Board atualizado e entre em **Cartazes > Etiquetas Zebra**.
2. No Windows do operador, instale **Python 3** (habilitando Python/`py` no PATH) e o driver Zebra ZDesigner para a ZD230.
3. Abra `AGENTE-ZEBRA-WINDOWS/INICIAR-IMPRESSAO-ZEBRA.bat` no computador em que o navegador é usado. O agente não precisa instalar bibliotecas extras.
4. Copie o **código de pareamento** mostrado na janela preta para o campo da tela do Board.
5. Clique **Buscar impressoras**. A lista é consultada no Windows local, não no computador onde está hospedado o Board.
6. Escolha a **ZDesigner ZD230-203dpi ZPL** (ou a fila compartilhada equivalente) e clique **Salvar configuração**.
7. **Desmarque impressão automática no primeiro teste**, bipa um produto conhecido, confira preço/descrição, imprima uma etiqueta. Depois habilite automático.

**Importante:** a impressora deverá estar instalada e acessível pelo Windows do computador do operador. Impressora compartilhada (`\\cpdpreco\\NomeDaFila`) precisa estar adicionada à lista de impressoras Windows desse usuário. Cada estação deve executar seu agente local se desejar imprimir localmente.

## Parâmetros e limitações da versão de teste
- Dimensão inicial *estimada* pela fotografia: **110 × 35 mm**. Meça a largura/altura reais da bobina, incluindo espaçamento, e ajuste antes de testar. O alinhamento exato exige calibração física com 1 ou 2 etiquetas; a fotografia não permite identificar os milímetros reais nem a posição exata do começo da etiqueta.
- O fundo amarelo e o logotipo colorido devem vir **pré-impressos** na bobina. A Zebra imprime ZPL preto; esta versão reserva a área direita para a logo sem enviá-la para a impressora. Se a bobina não for pré-impressa, haverá necessidade de revisar material/gráfica ou o layout.
- O layout é uma **primeira reprodução**: descrição em cima, código de barras à esquerda e preço à direita, com `De/Por` em promoção. O ajuste fino da tipografia e dimensões depende da impressão física.
- A seleção da impressora, pareamento, cópias e posição são salvos em `localStorage` **do navegador/perfil Windows**. Não é um controle centralizado em PostgreSQL e não acompanha automaticamente o usuário em outro computador.
- Histórico no navegador local; tarefas enviadas ao *spooler* não garantem que a etiqueta saiu fisicamente da máquina.
- Não imprime quando a GZ não traz um produto **único**, preço válido ou código de barras. Não inventa preços, não considera como promoção períodos fora de vigência e não faz impressão automática de códigos avulsos sem produto cadastrado.
- A impressão automática tem trava temporária contra duplicação acidental (<1,2 segundo entre o mesmo código).
- O código de pareamento é temporário e muda quando o agente é reiniciado. Não compartilhe esse código.
- A integração com localhost utiliza `http://127.0.0.1:18719`. Alguns navegadores corporativos, políticas HTTPS/Private Network Access ou antivírus podem bloquear acesso web ao agente local; valide nessa estação e navegador. O agente só escuta `127.0.0.1` e exige o token nas operações.

## Segurança e operação
- O agente executa no computador do operador, acessível apenas por loopback e protegido por token temporário; oferece listagem de impressoras e impressão RAW ZPL com itens gerados pelo agente, não aceita código ZPL livre do navegador.
- A GZ é consultada pelo backend autenticado e com permissão `cartazes`.
- Para operação em produção, avaliar assinatura/configuração centralizada do agente, trilha de auditoria no servidor, política de autorização de impressão e tratamento de falhas do spooler.

## Testes de homologação
1. Testar uma etiqueta normal.
2. Testar uma promoção GZ vigente e conferir `De/Por`.
3. Testar promoção expirada (deve gerar etiqueta normal).
4. Testar EAN desconhecido (não deve imprimir).
5. Testar duas estações com impressoras diferentes.
6. Verificar leitura pelo leitor USB em modo teclado, EAN preservado, qualidade/posição do código e legibilidade do preço.

**Não foi realizada impressão física em uma Zebra ZD230 nem teste com o GZ real neste ambiente.**
