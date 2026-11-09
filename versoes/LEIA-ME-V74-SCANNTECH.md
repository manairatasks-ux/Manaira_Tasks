# Manaíra Board V74 — Scanntech (versão inicial de testes)

Base: V73.6 XML Integral DANFE enviada pelo usuário. Os módulos anteriores foram mantidos.

## Incluído
- Módulo próprio `Scanntech` na Central de Módulos e na Administração > Acessos.
- Nova promoção: marca, código Scanntech, título, produtos colados da campanha, preço antigo/novo, desconto, reembolso/unidade, datas, margem mínima e observações de condições.
- Consulta dos códigos diretamente na mesma Ponte GZ da Consulta em Lote. Dados: descrição, preço venda, custo de aquisição, estoque e situação.
- Análise da margem comercial preliminar `(preço novo + reembolso - custo aquisição)/(preço novo + reembolso)`, **não é lucro líquido**. Reembolso pressupõe que cada venda é elegível e não excede limites da campanha; custos adicionais e impostos não estão incluídos.
- Campanhas salvas no PostgreSQL como rascunho ou ativada. Ativar significa registrar o que já foi aceito no portal Scanntech; não ativa a campanha automaticamente na plataforma externa.
- Campanhas sem cadastro, inativas ou sem custo só podem ser salvas como rascunho.
- Alertas de retirada hoje, próximos 3 dias, atrasadas sem confirmação, e colocação pendente.
- Confirmar colocação/retirada de placas. O alerta não some até a confirmação.
- Relatório de entrada e saída com data escolhida, colunas marca, código, descrição, início, fim, preço antigo e preço novo. Impressão via navegador (pode salvar como PDF) e CSV para Excel.
- Impede ativação de produtos cujos períodos se sobrepõem a campanhas ativas já cadastradas.
- Banco: tabelas independentes `st_campanhas`, `st_itens`.

## Instalação
1. Extraia em pasta nova, copie o `.env` da V73.6 sem publicá-lo no GitHub.
2. `npm install` e `node .`, ou suba no Render preservando o `DATABASE_URL` atual.
3. Administração > Acessos aos módulos > conceder **Scanntech** aos usuários. Administrador Principal tem acesso automático.
4. Abra Scanntech > Nova promoção, cole códigos, preencha preços e datas e clique Consultar produtos no GZ.
5. Confirme valores. Cadastre como rascunho quando algum item não existir no GZ; registre ativada somente após aceitar no portal Scanntech.
6. Em Scanntech > Relatórios, selecione Saída e as datas, gere a lista e imprima ou exporte CSV.

## Limites desta V74
- Não existe integração direta com o portal Scanntech: copiar/colar códigos e aceitar campanhas no portal continuam manuais.
- A análise de margem é estimativa comercial (custo GZ + reembolso integral), não substitui avaliação financeira/fiscal ou limites comerciais.
- Produtos recebem condições comuns da campanha (preço/reembolso e datas), como no exemplo fornecido.
- Primeiro lançamento sem edição do conteúdo de campanhas salvas: pode cancelar e cadastrar novamente após ajuste. Controle de placas e status possuem botões próprios.
- Não foi executado teste ponta a ponta com o PostgreSQL e a Ponte GZ reais; antes de operar, valide com uma campanha de teste e confira permissões e relatório.
