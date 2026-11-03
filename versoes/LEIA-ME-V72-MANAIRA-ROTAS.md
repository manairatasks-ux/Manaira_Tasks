# Manaíra Board V72.0 — Manaíra Rotas

## Instalação
1. Extraia em nova pasta; guarde a versão anterior como referência.
2. Copie o arquivo `.env` da versão anterior, **sem enviá-lo a terceiros**.
3. `npm install && npm start`. A inicialização cria somente as tabelas `mr_*` e registra o novo módulo; não rode `init-db` para resetar nada.
4. Administração → Permissões: conceda `Manaíra Rotas` ao gestor e aos entregadores. Cada entregador precisa de login próprio.
5. Abra Manaíra Rotas → Configurações. Configure o endereço completo e as coordenadas da loja. Pode usar o GPS do celular estando fisicamente no mercado.
6. Cadastre um pedido com CEP, rua e número; ou importe CSV com o modelo em `exemplos/`.
7. Confirme a posição no mapa e marque o pedido Pronto.
8. Planejar rotas → selecione pedidos, veículos simultâneos e limite de paradas. Escolha um entregador em cada viagem e confirme.
9. O entregador abre **Minhas entregas** no celular com HTTPS, inicia a viagem, autoriza GPS, abre Google Maps para a parada e confirma Entregue / Não entregue.
10. Depois da última parada, o entregador abre a navegação de retorno ao Manaíra e encerra a viagem.

## Integração Google Maps — recomendada para uso real
No painel do Render, nas variáveis de ambiente do serviço Node.js, adicione:

`GOOGLE_MAPS_API_KEY=CHAVE_PRIVADA_DO_SERVIDOR`

Ative cobrança e habilite **Geocoding API** e **Routes API** no projeto Google Cloud. Restrinja a chave às APIs necessárias e ao uso apropriado pelo servidor. Não coloque essa chave em `public/` ou no código do navegador.

- Sem chave: cadastro, consulta de CEP via ViaCEP, GPS, mapa de pontos, confirmação de entregas e links de navegação continuam funcionando; contudo, é necessário **localizar os endereços manualmente** no mapa. O agrupamento é por distância geográfica e **NÃO** representa distância/tempo real por ruas.
- Com chave: geocodificação de endereços e tentativa de otimização viária **por viagem** usando `computeRoutes` do Google. Se o provedor falhar, o sistema volta à estimativa geográfica, com aviso na tela. A criação das viagens exige localização validada. O algoritmo de **distribuição entre entregadores é heurístico**, não uma garantia de ótimo global; compare rotas antes do despacho.
- A roteirização viária é calculada em modo DRIVE. Para motocicletas, trânsito, restrições de circulação e entregas com prazos estritos, confira na navegação antes da saída.
- Requisições do Google Maps podem ter cobrança por uso; monitorar cotas e custos.

## Limites e segurança da primeira versão
- A posição GPS é enviada somente pelo entregador designado, com sua permissão, em HTTPS e enquanto a viagem está iniciada e o módulo está **visível/ativo no navegador**. Ao mudar de aplicativo, bloquear a tela ou abrir o Google Maps, o navegador pode suspender/cessar o compartilhamento. **Não há rastreamento garantido em segundo plano**; para isso seria necessário app nativo com permissões adequadas.
- A central mostra a última posição informada e seu horário, não localização permanente. O registro GPS mais recente é apagado ao finalizar a viagem. Não existe coleta antes de iniciar a viagem.
- O módulo compartilha dados de endereços com Google Geocoding/Routes quando habilitado. Use segundo as regras de privacidade da empresa e dos provedores.
- CEP por si só não assegura endereço exato. Não libere uma entrega com endereço incompleto ou geocodificação marcada como "revisar".
- A primeira versão não integra diretamente os pedidos da plataforma de e-commerce: usa cadastro manual/CSV. Para integração automática, será preciso API/documentação do fornecedor do e-commerce.
- Prazos são armazenados, mas o motor V72.0 não impõe janelas de entrega automaticamente. Não trate o plano como solução garantida de prazo/veículo/peso.
- Veículos não têm capacidade de peso/volume automatizada na V72.0; use limites de paradas e conferência operacional.
- Os links abrem navegação no Google Maps, mas a plataforma não fornece voz e recálculo de curvas nativamente.
- Importação CSV aceita até 100 linhas por envio e não atualiza pedidos duplicados. Cabeçalho: `numero;cliente;cep;rua;numero_endereco;bairro;complemento;cidade;uf;lat;lon`.

## Dados
Tabelas independentes: `mr_config`, `mr_pedidos`, `mr_viagens`, `mr_paradas`, `mr_localizacoes`, `mr_eventos`.

Os IDs e as outras tabelas dos módulos existentes não são alterados.

## Teste controlado recomendado
- Cadastre 4 pedidos fictícios com coordenadas **confirmadas manualmente** (2 em bairros próximos e 2 em outra região).
- Configure a base correta, selecione 2 veículos e planeje. Confira que todas as rotas retornam à origem.
- Atribua 2 usuários com permissão, inicie cada viagem no próprio celular e teste GPS com tela aberta.
- Confirme uma entrega e uma ocorrência de não entregue; encerre, confira histórico e CSV.
- Repita com `GOOGLE_MAPS_API_KEY` configurada para conferir distância de ruas e diferenças no agrupamento.
