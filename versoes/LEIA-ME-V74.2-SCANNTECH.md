# Manaíra Board V74.2 — Margens e ativação seletiva Scanntech

- Comparação em uma coluna: custo GZ normal e custo com reembolso.
- Comparação em outra coluna: margem anterior sobre o preço de venda atual do GZ e margem promocional sobre o preço de campanha, com reembolso abatido do custo.
- Itens que não atendem a cadastro ativo, custo conhecido, preço promocional positivo e margem mínima são destacados em vermelho e registrados como não incluídos.
- Campanha ativada pode conter itens excluídos da ativação, preservados apenas para auditoria da análise; relatórios de placas e conflito de vigência usam somente os itens incluídos.
- Rascunhos não ativam itens; ao ativar rascunho, o servidor recalcula a elegibilidade usando os dados históricos registrados.
- Não há integração de aceite com portal Scanntech. Confirme no portal quais itens/campanhas foram aceitos.
- A margem é preliminar e pressupõe reembolso integral das unidades elegíveis; considerar limites, tributos e despesas antes da decisão.
- Migração incremental: coluna `st_itens.incluido`, com default TRUE para manter o comportamento histórico de campanhas antigas.

Instalação: copie o `.env` da instalação anterior, rode `npm install` e `node .` ou faça deploy no Render. A migração ocorre no `init-db`.
