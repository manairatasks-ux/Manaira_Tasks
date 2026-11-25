# Manaíra Board V74.35 — Recebimento e CPD / inventários

Base: V74.34 (Manaíra IA + Galpão), preservada.

## Implementações

- Corrigida a janela máxima de continuidade das ausências: 150 minutos entre inventários COMPLETOS. A pasta adicional é consultada pela Ponte a cada 120 minutos; a margem é de 30 minutos. Se passar mais de 150 minutos, a ausência reinicia no inventário completo seguinte, sem lançamento retroativo.
- Nova rota assinada `POST /api/recebimento/xml-sync/parcial` para relatórios de acompanhamento. Exige `XML_SYNC_SECRET`, os headers HMAC `x-xml-timestamp` e `x-xml-signature`, o tipo `ACOMPANHAMENTO`, `alteraLancamentos: false` e dados dentro de limites. Rejeita relatórios antigos, inválidos, incompletos ou com autenticação errada.
- Os relatórios parciais são armazenados isoladamente em `receb_xml_relatorios_parciais`. Não modificam status, presença, ausência, recebimento físico ou lançamento automático.
- `GET /api/recebimento/xml-sync/historico` retorna últimas verificações completas e relatórios parciais ao usuário autenticado com permissão Recebimento/CPD.
- Resumo do CPD agora exibe separadamente última verificação completa, última parcial e o histórico.

## IMPORTANTE: Ponte GZ V4.8

A V4.8 *exibe* relatórios parciais em seu painel LOCAL, mas ainda **não os envia ao Board**. O novo endpoint do Board está pronto para a próxima Ponte enviar o relatório de acompanhamento assinado. Até a atualização da Ponte, o campo "Relatório parcial" continuará "ainda não recebido". As notas individuais continuam sendo sincronizadas na rota antiga.

O inventário completo também permanecerá bloqueado na Ponte enquanto houver XMLs com campos inválidos ou outra verificação insegura; o Board não pode contornar isso. A próxima atualização da Ponte deve separar presença validada de importação fiscal sem forçar inventários indevidos.

## Instalação

1. Faça backup da V74.34 e do PostgreSQL.
2. Instale a V74.35 e mantenha as variáveis existentes. Não há necessidade de trocar credenciais do Agente Ollama, da Ponte ou do ngrok.
3. O `src/init-db.js` executa a migração `xml-sync.schema.sql` durante a inicialização. A tabela nova é aditiva e não apaga registros anteriores.
4. Abra Recebimento e CPD → Notas disponíveis (XML) e confira o novo painel de inventários.
5. Em produção, valide primeiro o histórico e execute teste supervisionado de ausência antes de permitir confiar na classificação automática.

## Segurança e limites

A regra das 12 horas exige inventários completos e consecutivos, nota recebida pelo CPD, sem pendência, ainda não lançada e observada previamente. Os dados parciais não participam dessa regra. O lançamento é uma classificação no Board, nunca um lançamento fiscal no sistema GZ.
