# Manaíra Board V73.2 — Gestão de Funcionários e Ranking para TV

## Novidades

### Funcionários da VIP
- Filtro **Ativos / Arquivados / Todos**.
- Ação **Retirar do ranking / Incluir no ranking** para participantes configuráveis.
- **Arquivar / Restaurar** sem remover métricas: arquivados não participam dos indicadores atuais.
- **Excluir definitivamente**, restrito a gestores e com confirmação por ID VIP. Exclui os registros de métricas desse funcionário. Essa ação não pode ser desfeita e afeta os indicadores históricos; utilize Arquivar para ex-funcionários sempre que possível.
- **IDs 9 e 52** permanecem protegidos da exclusão, não podem ser incluídos no ranking e continuam fora dos indicadores.
- Reimportar um relatório VIP contendo funcionário excluído poderá recriar seu cadastro; para evitar, arquive-o em vez de excluir.

### Painel TV
1. Abra **Produtividade E-commerce → Painel TV**.
2. Escolha o período de referência e clique em **Publicar na TV**. Apenas os relatórios integralmente contidos no período entram nos cálculos; não há soma dupla de relatórios sobrepostos.
3. Clique em **Gerar link da TV** e copie o endereço completo para a televisão. O endereço contém um segredo aleatório no fragmento (`#chave=...`); não divulgue.
4. Abra o link no navegador da televisão. O painel mostra 4 indicadores (compras, itens, usuários, tempo médio por compra), top 3 ampliado à direita e classificação dos demais à esquerda.
5. A TV consulta atualizações a cada 60 segundos. Os dados somente mudam depois de **Publicar na TV** novamente.
6. **Renovar link da TV** revoga o link anterior. O segredo só aparece no momento de sua geração. Se perder, gere um novo.

O link é somente leitura. A página não expõe menu ou funções administrativas. Mantenha os links somente com usuários autorizados; como qualquer credencial de acesso por link, quem o possuir poderá visualizar o ranking até que seja revogado. Use conexão HTTPS.

## Instalação
- Extraia a nova versão em pasta própria, preserve o `.env` anterior.
- Execute `npm install` e `node .`.
- A inicialização executa a migração **idempotente** das tabelas `ep_usuarios` (campo `arquivado`) e `ep_tv_config` (configuração e publicação). Nenhuma tabela preexistente é apagada.
- Conceda a permissão **Produtividade E-commerce** aos usuários responsáveis.
- O link da TV funciona após implantar a V73.2 no mesmo endereço do servidor; não funciona apontando para versões anteriores.

## Regras de indicadores
- Classificação: total de **itens separados** (maior primeiro).
- Média por compra = segundos totais ÷ compras, do mesmo conjunto de usuários considerados.
- A publicação representa um **snapshot** dos dados e elegibilidades no momento da publicação; mudanças de funcionários/importações não alteram a TV até republicar.
- O ranking representa volume, não necessariamente eficiência ajustada por jornada ou dificuldade.

## Validação pendente
Testes estáticos de sintaxe e integridade são executados na criação do ZIP. Testes de integração com seu PostgreSQL real, autenticação e navegador da TV ainda precisam ser feitos no ambiente local/produção.
