# V71 — Pontos Extras (primeira versão web integrada)

Base: Manaíra Board V70.4. Estrutura isolada no PostgreSQL com prefixo `pe_`.

## Origem do layout
Imagens `planta_loja.png` e `planta_original.png` do ZIP original Gestão de Pontos Extras Manaíra V3.0.13. Não foram redesenhadas. A interface mantém seções e mapa, adaptados ao padrão Manaíra Board.

## Incluído
- Nova permissão `pontos_extras` no painel Administração; admins principais têm acesso.
- Dashboard com contadores e financeiro das cobranças cadastradas.
- Fornecedores: cadastro, edição e API de exclusão com integridade referencial.
- Pontos: cadastro, edição, foto Cloudinary, posição no mapa em coordenadas relativas.
- Mapa: marcadores ocupados/disponíveis, busca por fornecedor, localização, detalhes, reposicionamento e prévia de foto no mouse.
- Contratos: individuais com bloqueio de sobreposição, edição, vigência e forma de pagamento.
- Pacotes: múltiplos pontos por valor único, sem multiplicar valores, criação e edição sem cobranças.
- Pagamentos: mensalidades manuais, baixa parcial em transação, histórico, CSV.
- Visual web responsivo.

## Limites desta versão
Não é uma migração de dados do SQLite original, pois o ZIP de referência não continha a pasta `dados`. Os pontos precisam ser cadastrados e posicionados; não inventamos dados. Não existe emissão automática de boletos, geração automática de mensalidades, anexação de contratos e comprovantes pela interface, nem o conjunto completo de operações de exclusão/edição financeira do aplicativo Python. O upload seguro de imagens dos pontos funciona mediante Cloudinary configurado. Endpoint genérico de anexos está preparado, mas não vincula contratos ou comprovantes nesta versão. Não há teste end-to-end com PostgreSQL e Cloudinary reais neste ambiente.

## Instalação
Copie o `.env` da versão anterior; execute `npm install` e `npm start`. Na inicialização são criadas apenas as tabelas `pe_*` por migração aditiva. Libere acesso em Administração > Permissões para usuários autorizados. Não execute reset de banco.

## Verificação
Sintaxe JS validada com `node --check`; integridade ZIP validada. Teste a criação de fornecedor, ponto, posicionamento, contrato, mensalidade e recebimento de teste antes de uso real.
