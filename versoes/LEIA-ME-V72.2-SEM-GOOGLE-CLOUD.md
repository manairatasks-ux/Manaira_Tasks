# Manaíra Board V72.2 — Rotas sem Google Cloud

## O que mudou
- Removida a dependência da chave Google Maps para geocodificação e rotas internas.
- Mapa interativo Leaflet com dados OpenStreetMap continua funcionando.
- Geocodificação (CEP, rua e número) integrada à **Geoapify**.
- Cálculo viário e traçado das ruas pela **Geoapify Routing API**.
- Cálculo do agrupamento/ordem de paradas continua heurístico, no servidor; o trajeto viário calcula essa ordem e retorna à loja.
- Quando a API falhar, nenhuma distância viária é inventada: a linha tracejada é apenas a estimativa geográfica.
- Marcadores localizados por CEP/rua sem número confirmado são marcados **a conferir** e não podem ser despachados sem confirmação.

## Ativação sem pagamento ao Google
1. Crie uma conta gratuita em https://myprojects.geoapify.com/ (o plano gratuito **não exige cartão**).
2. Copie sua chave de API Geoapify.
3. No Render > serviço Manaíra Board > Environment, adicione **GEOAPIFY_API_KEY** = (sua chave). Não coloque a chave no repositório GitHub.
4. Salve as variáveis e faça deploy/restart.
5. No Board abra Manaíra Rotas > Configurar base e cadastre a origem (ou marque-a pelo GPS no local).
6. Cole CEPs no mapa. Cada endereço localizado recebe marcador; confira número e localização antes de liberar viagem.

## Limites, precisão e observações
- Geoapify Free, segundo https://www.geoapify.com/pricing/ (consulta em 03/11/2026): 3.000 créditos/dia, até 5 solicitações/s; disponível comercialmente, sem cartão de crédito; há obrigação de atribuição.
- Créditos por rota dependem da quantidade de trechos; **não** equivalem necessariamente a uma requisição por viagem.
- A atribuição/ordenação de múltiplos veículos é heurística; não garante solução ótima global ou trânsito real.
- Consultas por CEP sem número frequentemente retornam um ponto aproximado da rua: confirmação é necessária para entrega segura.
- O mapa base gratuito OpenStreetMap público possui política de uso e disponibilidade sem SLA; para uso pesado recomenda-se provedor de tiles dedicado.
- Abrir navegação via Google Maps no celular não requer chave da API do Google Maps.
- Não há atualização de banco de dados destrutiva. Seus dados antigos foram preservados.

## Testes recomendados
1. Entre na aba Configurar base e confira as coordenadas.
2. Cadastre CEP+numero de uma rua conhecida; confira localização exibida.
3. Se a localização estiver marcada como `revisar`, confira mapa e confirme com um clique.
4. Libere 3 pedidos como prontos e gere rota; confira linha contínua e distância viária.
5. Teste atribuição e navegação pelo smartphone, sem usar pedidos reais até validar.
