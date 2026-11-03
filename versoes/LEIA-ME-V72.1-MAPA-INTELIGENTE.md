# Manaíra Board V72.1 — Manaíra Rotas: Mapa Inteligente

## Novidade
- Apenas cinco opções no menu do Manaíra Rotas: **Mapa de entregas** (principal), Viagens em andamento, Minhas entregas, Histórico e Configurar base.
- Entrada de **até 40 CEPs por lote**, um por linha; opcional: `CEP;número;pedido;cliente`.
- Todos os pedidos localizados aparecem sobre **um mapa único**, com lista pesquisável visualmente.
- Clicar num pedido ou marcador permite **confirmar o endereço**; pontos conferidos e prontos podem ser selecionados.
- Botão **Sugerir melhor rota** agrupa os pedidos, desenha as viagens com **retorno ao supermercado** e permite escolher entregadores.
- Confirmação de viagens, GPS e conclusão individual das entregas utilizam as rotas já existentes da V72.
- Quando a Google Routes API retorna a polilinha, o mapa mostra o trajeto pelas ruas; sem ela, mostra **linhas tracejadas aproximadas**.

## Atenção importante: CEP não identifica a casa
O endereço do CEP, por si, não identifica o número do imóvel. Para evitar entregas erradas:
- o cadastro por CEP entra como **Separando** e com a localização **a conferir**;
- com `GOOGLE_MAPS_API_KEY` configurada, uma marcação **aproximada** por CEP pode aparecer no mapa (laranja), mas ainda é necessário confirmar rua, número e posição;
- sem chave de geocodificação, o CEP é reconhecido e entra na lista, mas **não cria pino automaticamente**. Clique em **Endereço**, complete o número e marque o local exato no mapa;
- depois de confirmar, clique em **Pronto**. Apenas pedidos com posição confirmada podem ser despachados;
- a distribuição entre veículos é heurística; a Google Routes API melhora a ordem por ruas para cada viagem, sem garantia de ótimo global.

## Instalação
1. Copie `.env` da versão instalada. Não publique credenciais.
2. `npm install` e `npm start`.
3. Autorize `Manaíra Rotas` em Administração → Permissões.
4. Em **Configurar base**, ajuste o endereço e as coordenadas exatas do Supermercado Manaíra.
5. Opcional: `GOOGLE_MAPS_API_KEY` no ambiente **do servidor** para Geocoding/Routes. Não exponha a chave no JavaScript público.
6. Teste com dois CEPs de regiões distintas e confirme o número e a posição real de cada entrega antes de marcá-los Pronto.

## Segurança e continuidade
As tabelas `mr_*` são criadas por migração aditiva no início; não é necessário `init-db`. O pacote mantém todos os demais módulos. Não há exclusão nem conversão de pedidos antigos.
GPS via navegador funciona mediante permissão enquanto a tela estiver ativa; não há garantia de rastreamento em segundo plano.
Pedidos da loja on-line ainda não são importados automaticamente (exige acesso à API do site de vendas).
