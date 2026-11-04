# Manaíra Board V72.6 — Central de Entregas com Fluxo Visual

Base: V72.5 enviada pelo usuário. Versão integral; preserva módulos, rotas HTTP e banco existentes.

## Interface do Manaíra Rotas

1. **Cadastrar entregas:** CEP em lote, cadastro individual e importação CSV.
2. **Conferir e selecionar:** mapa principal, legenda de cores, pesquisa de pedidos e quatro listas operacionais verticais (A conferir / Prontos para rota / Em viagem / Finalizados).
3. **Montar e enviar viagens:** selecionar pedidos prontos, escolher quantidade de entregadores, limite de paradas e veículo; sugerir trajetos e atribuir motoristas.
4. **Viagens confirmadas:** filtros de período/situação, detalhamento, cancelamento e arquivamento com as proteções da V72.5.

Pedidos entregues continuam ocultos do mapa inicialmente, mas consultáveis na lista de Finalizados. O interruptor 'Mostrar finalizados no mapa' só altera a visualização. Excluir continua sujeito às proteções de histórico do backend; arquivar preserva os registros.

## Instalação

Extrair em pasta nova e manter o `.env` da instalação, incluindo `GEOAPIFY_API_KEY`. Executar `npm install` e `npm start`. Na web pode ser necessário atualizar com Ctrl+F5 para renovar JS/CSS em cache.

## Notas técnicas

- Apenas JS e CSS da interface de rotas foram alterados. Sem migrações no banco de dados.
- Os endereços e coordenadas são consultados pelos mesmos endpoints já existentes na V72.5.
- Nenhum pedido, rota ou registro é excluído automaticamente com esta atualização.
- Conferência estática feita com `node --check`; fluxos de interface e PostgreSQL precisam de teste no ambiente local.
