# Manaíra Board V71.2 — Mapa de Pontos Extras

Corrigido o fluxo de posicionamento conforme a aplicação Python V3.0.13.

- Cadastrar ponto: clique em “Cadastrar ponto”, selecione a posição exata na planta, preencha os dados e salve. A localização é gravada juntamente com o ponto.
- Clique em área vazia: oferece o cadastro direto naquela localização.
- Reposicionar: escolha o ponto já cadastrado e clique na nova posição da planta; grava coordenadas proporcionais (0–1).
- Clique em marcador: abre detalhes, foto e vínculo de fornecedor.
- Busca fornecedor: atualiza lista de pontos contratados e realça marcadores correspondentes; clicar no resultado centraliza a visualização na localização.
- Layout: navegação lateral escura, pesquisa acima da planta, painel “Pontos localizados” à direita e planta original preservada.

Não modifica schema do PostgreSQL, nem contratos, pagamentos ou permissões. Para testar: cadastre um ponto pelo mapa, atualize a página, confirme a permanência da posição; reposicione e confirme a persistência. Fotos requerem Cloudinary configurado.
