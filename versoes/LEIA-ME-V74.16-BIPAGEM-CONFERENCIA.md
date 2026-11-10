# Manaíra Board V74.16 — Prevenção e Avaria

- Aba Acessos e PIN só aparece para gerente, administrador e administrador principal. Validação de edição da permissão permanece no servidor.
- PIN individual dos operadores pode ser cadastrado nas próprias telas Prevenção e Avaria.
- Prevenção: EAN via leitor USB/Bluetooth com Enter, consulta GZ idêntica ao serviço usado no Pit Stop, câmera (BarcodeDetector quando compatível) e avulso manual sem código.
- Avaria: leitura EAN para localizar o item correspondente e focalizar sua quantidade recebida; itens avulsos são conferidos pela lista manualmente.
- Quantidades não são presumidas a partir da leitura: conferente informa quantidade física por item; recebimento só confirma depois de preencher todos.
- Migração automática ao inicializar: `ta_itens.codigo` passa a aceitar NULL, preservando registros existentes.
- Requer HTTPS para câmera nos dispositivos móveis; leitor físico e digitação funcionam como alternativa.
- Homologar com banco de testes, API GZ acessível e dois usuários distintos. Não houve teste ponta a ponta com PostgreSQL/GZ de produção.
