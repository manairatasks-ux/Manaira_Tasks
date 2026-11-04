# Manaíra Board V73 — Produtividade E-commerce

Base: V72.6.1 fornecida pelo usuário. Todos os módulos anteriores permanecem.

## Ativação
1. Extraia o ZIP numa pasta nova; copie seu `.env` (não está incluído no pacote).
2. Execute `npm install` e `node .`. O esquema PostgreSQL é criado automaticamente.
3. Entre em Administração → Permissões e conceda acesso a `Produtividade E-commerce` aos usuários desejados. Administrador principal tem acesso automaticamente.
4. Entre no cartão **Produtividade E-commerce**, depois em **Importações VIP**.
5. Informe exatamente o período exportado na VIP (por exemplo, 01/10/2026 até 31/10/2026), selecione o CSV, clique **Conferir arquivo**, depois **Confirmar importação**.
6. Volte ao **Dashboard** ou **Comparativos** e aplique o período correspondente. Exporte CSV (abre no Excel) ou PDF.

## Regras
- Aceita o CSV do relatório *Tempo médio de separação por usuário*, com as 9 colunas do exemplo enviado.
- PDF é material de conferência do formato; **a importação é via CSV**, pois o PDF dificulta validação de linhas/colunas.
- IDs VIP 9 (Mateus Reis) e 52 (Imprimir Selo) são **sempre excluídos dos cálculos**, nunca excluídos do histórico bruto.
- Usuários classificados como `operacional` ou `desconsiderado` também ficam fora dos indicadores.
- A prévia mostra apenas as exclusões fixas 9 e 52; classificações administrativas adicionais são aplicadas ao dashboard após importar.
- A VIP não traz data em cada linha do CSV; **início e fim informados pelo usuário** são salvos na importação.
- Importações de períodos sobrepostos são bloqueadas para impedir dupla contagem, por exemplo mês completo e uma semana contida nele.
- O filtro do dashboard inclui somente relatórios **integralmente contidos** no intervalo escolhido. Não fraciona dados consolidados.
- Os tempos médios são derivados de segundos totais / compras ou / itens, e podem diferir dos tempos médios informados pela VIP, pois o relatório original possui aparentes divergências.
- Importações e exclusões de importações estão disponíveis apenas para gestores; alterações de categoria também.
- Exclusões de importação removem os indicadores daquele intervalo, mas mantêm os perfis dos usuários VIP.
- Não usa outros módulos ou bases existentes para atualizar indicadores.

## Observação de qualidade dos dados
No PDF enviado, o resumo geral não coincide com a soma de várias colunas por colaborador. O sistema preserva os dados das linhas do CSV e não declara que suas somas representam o total oficial da VIP. Antes de usar os rankings em decisões de pessoal, confira diferenças de função, jornada e complexidade dos pedidos.

## Teste recomendado
Importe o CSV de 01/10/2026 a 31/10/2026. A prévia precisa mostrar 15 linhas, sendo 13 elegíveis depois de retirar os IDs 9 e 52, totalizando 1.176 compras e 74.982 itens separados (segundo a soma das linhas).
