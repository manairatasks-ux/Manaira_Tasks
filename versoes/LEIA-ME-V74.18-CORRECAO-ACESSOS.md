# Manaíra Board V74.18 — correção de acessos do módulo Prevenção e Avaria

## Defeito corrigido
A tela de Administração listava o módulo `transferencias_avaria`, mas o serviço de salvamento filtrava os códigos por uma lista fixa que não o incluía. O checkbox aparecia, o servidor respondia sucesso e a permissão era descartada.

## Alteração
O serviço agora consulta o catálogo de módulos ativos do banco, evitando divergências entre a tela de Administração e a validação do backend. Códigos desconhecidos geram erro explícito sem alterar acessos existentes.

## Implantação
Atualize os arquivos do projeto, reinicie o servidor e atualize a página. Em Administração > Acessos aos módulos, marque **Transferências Prevenção e Avaria** para o usuário desejado e salve. Depois, no módulo, configure a permissão operacional de Prevenção/Avaria e o PIN, conforme necessário. Um novo login pode ser necessário para atualizar o menu de módulos.

## Teste de regressão
Execute `node scripts/teste-acessos-transferencias-v74.18.js` para testar o salvamento da permissão sem um PostgreSQL real. A integração completa com banco e interface deve ser testada no ambiente de homologação.
