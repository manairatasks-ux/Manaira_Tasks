# Manaíra Board V70.2 — Consulta promocional do SupManaira

## Mudança

Arquivo alterado: `src/modules/mobile/mobile.routes.js`.

A rota `GET /api/mobile/produtos/consulta?codigo=...` agora:
- mantém a consulta GZ por EAN e fallback por código interno;
- usa `precoEspecial` (quando positivo) ou `precoPromocao` (quando positivo);
- interpreta preços numéricos e strings de moeda com vírgula decimal;
- só expõe `precoPromocao` quando há data inicial e final válidas e o período inclui a data atual em `America/Fortaleza`;
- envia datas ISO `AAAA-MM-DD` compatíveis com o SupManaira V5;
- mantém as demais propriedades e a autenticação da rota.

O campo `precoEspecial` bruto permanece disponível como compatibilidade; o app deve apresentar como promoção **somente** `precoPromocao`, que é validado.

## Implantação

Publique a V70.2 no mesmo ambiente que fornece a API mobile (Render). Apenas substituir arquivos localmente não atualiza a API hospedada. Não requer migração de banco de dados nem nova compilação do aplicativo SupManaira V5.

## Teste

Consulte um EAN comprovadamente em promoção e outro sem promoção. Verifique no retorno JSON os campos `precoVenda`, `precoPromocao`, `inicioPromocao` e `terminoPromocao` e confirme a exibição no Android.

**Limitação:** não foi possível testar a Ponte GZ/Render com credenciais reais neste ambiente. Se a Ponte GZ enviar outros nomes de campos, será preciso ajustar o mapeamento após observar uma resposta real.
