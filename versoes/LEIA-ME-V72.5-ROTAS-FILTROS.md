# Manaíra Board V72.5 — Rotas por período e mapa limpo

Atualização baseada no ZIP V72.4 fornecido. Preserve o `.env` e o PostgreSQL existente.

## Alterações

- Pedidos e seleção agora aparecem **abaixo do mapa**; formulário de CEPs e criação de viagens permanecem na lateral.
- Viagens confirmadas aparecem abaixo da lista de pedidos, com filtros **De / Até / Situação**; também disponíveis na Central e no Histórico. Datas baseadas no dia de criação da viagem, fuso de Fortaleza.
- Botão **Cancelar rota** nas viagens planejadas/em andamento (gestor): registra cancelamento, remove GPS, preserva histórico e entregas concluídas, libera pedidos pendentes para nova viagem. A viagem fica arquivada por padrão, mas consultável no Histórico.
- **Arquivar/Restaurar** viagens concluídas e canceladas sem apagar paradas. Marcador Mostrar arquivadas na Central/mapa.
- Pedidos entregues, não entregues e cancelados ficam **ocultos no mapa por padrão**, sem exclusão. Marque Mostrar pedidos finalizados para consultá-los. Responsáveis podem arquivar/restaurar pedidos finalizados; dados históricos são preservados.
- Exclusão definitiva de pedido continua possível **somente quando não houver histórico de viagem**, seguindo regra da versão anterior.

## Instalação

1. Descompacte em nova pasta e copie o `.env` da versão anterior. Não inclua as chaves no GitHub.
2. Execute `npm install` e `npm start`. Na inicialização, `initDb()` aplica automaticamente a migração aditiva em `src/modules/manaira-rotas/schema.sql`.
3. Confirme as permissões do usuário e abra Manaíra Rotas.
4. Faça testes antes do uso comercial: rota planejada > cancelar > pedido volta a Pronto; viagem com uma entrega concluída > cancelar > pedido concluído continua entregue e apenas pendentes retornam; filtros de data; mapa sem pedidos entregues; arquivamento.

## Limitações

- Filtros da Central/mapa/histórico funcionam sobre as últimas **1.000 viagens carregadas**. Não constituem busca histórica irrestrita no banco.
- Botões de cancelamento/arquivo exigem perfil administrativo/gerência.
- Cancelar não apaga dados: é a opção segura para viagens confirmadas.
- Testes de sintaxe/estrutura foram feitos, mas esta entrega não foi testada contra o PostgreSQL de produção.
