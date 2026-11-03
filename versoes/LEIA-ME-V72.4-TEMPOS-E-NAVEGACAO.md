# Manaíra Board V72.4 — Etapas e tempos de entrega

Base: V72.3 — Excluir Pedidos. Mantém módulos anteriores e integração Geoapify.

## Fluxo do entregador

1. **Iniciar viagem** na tela Minhas entregas.
2. Selecione Google Maps, Waze ou Apple Maps e clique **Navegar e iniciar deslocamento**. Isso registra `deslocamento_iniciado_em`. Reabrir a navegação não reinicia o horário.
3. Ao chegar ao endereço, volte à Manaíra Board e clique **Cheguei · Aguardando cliente**. Isso registra `chegada_em` e muda a parada para `aguardando_cliente`.
4. Depois de entregar, clique **Confirmar entrega**, registrando `concluida_em`. Pode registrar **Não entregue** com motivo após iniciar o deslocamento, mesmo se não houve contato com o cliente.
5. Acesse Central de viagens > Ver viagem para consultar horários e tempos de deslocamento, espera e total por parada.

Os tempos são calculados no servidor a partir dos timestamps do banco PostgreSQL, sem exigir que a tela permaneça aberta. São tempos entre cliques do colaborador, não chegada GPS detectada automaticamente.

## Compatibilidade

A migração em `src/modules/manaira-rotas/schema.sql` adiciona colunas e atualiza a restrição de status, sem apagar linhas históricas. O `src/server.js` executa `initDb()` ao iniciar. Registros antigos sem horários específicos exibem `—`.

## Navegação

Google Maps, Waze e Apple Maps abrem via links; não exigem a API paga do Google. O aplicativo efetivamente aberto depende do dispositivo e das configurações do celular. Se Waze não estiver instalado, o navegador pode abrir o site do Waze. A preferência é guardada no navegador do dispositivo.

## Segurança e validação

O servidor valida que a viagem está ativa, que o usuário controla a viagem e que as etapas ocorram na ordem correta. Testar em ambiente de homologação com PostgreSQL antes de produção.
