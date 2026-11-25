# Manaíra Board V74.32 — Manaíra IA V1 (Galpão)

Esta versão foi construída diretamente sobre a V74.31 enviada pelo usuário.

## O que entrou

- Cartão **Manaíra IA** na central de módulos, visível ao Administrador Principal.
- Painel com indicadores reais de produtos ativos, embalagens e unidades em estoque, sem saldo, lotes vencidos e próximos ao vencimento.
- Movimentações de entrada/saída e ranking de produtos por embalagens movimentadas no período de 7, 30 ou 90 dias.
- Recomendações gerenciais baseadas em regras verificáveis e em dados do Galpão.
- Chat com perguntas sobre estoque, validade, entradas, saídas, rankings e recomendações.
- Botão flutuante no canto inferior direito e janela de chat na própria tela.
- Endpoint opcional para integrar Ollama: a ausência do Ollama NÃO bloqueia o painel nem os demais módulos.
- Consultas somente de leitura, sem SQL construído pelo modelo, sem alterações de estoque.

## Controle de acesso

A API é exclusiva ao perfil `administrador_principal`. Para restringir ao seu login exato, **recomenda-se** adicionar nas variáveis de ambiente do Render:

```
MANAIRA_IA_EMAIL=seu.email.cadastrado@empresa.com.br
```

O valor deve ser o e-mail já cadastrado no Board (não é senha). Com essa configuração, só o administrador principal com esse e-mail poderá utilizar os endpoints; a validação é feita no backend.

## Ollama: etapa opcional de integração

**Não exponha a porta 11434 ou seu computador diretamente na Internet.** A URL `localhost` do Render não corresponde ao seu PC. Na V1, sem URL configurada, o chat responde por ferramentas de análise determinísticas e informa claramente "Análise por indicadores".

Quando houver um endpoint protegido e acessível pelo backend (ex.: VPN/túnel seguro com autenticação e TLS), pode-se configurar:

```
MANAIRA_IA_OLLAMA_URL=https://ENDERECO-PRIVADO-E-PROTEGIDO
MANAIRA_IA_OLLAMA_MODEL=qwen3:4b
MANAIRA_IA_OLLAMA_KEY=CHAVE_DO_SERVICO_SEGURO
```

As configurações devem ser definidas nas variáveis do serviço no Render, **nunca no JavaScript do navegador**. A API envia somente o recorte de indicadores e nomes necessários, limitado a 20 KB de JSON, não o banco completo. Mesmo com Ollama offline, o modo de indicadores continua operando.

Observação: o endpoint usado precisa aceitar `/api/chat` no formato Ollama e, quando configurada, autenticação Bearer. Expor a API Ollama pura sem uma camada de segurança não é recomendado.

## Validação

1. Atualizar o código do Board em ambiente de teste e garantir que as tabelas do Galpão já existam.
2. Entrar como administrador principal, abrir **Manaíra IA** na central e comparar os seis indicadores com o módulo Galpão.
3. Fazer perguntas: `Quanto tenho em estoque?`, `Quais produtos mais movimentaram?`, `O que vence em 30 dias?`, `Quantas saídas ocorreram?`.
4. Abrir o botão flutuante e confirmar que o chat funciona sem sair de outro módulo.
5. Entrar com usuário não autorizado e confirmar que o módulo não aparece e as rotas `/api/manaira-ia/*` retornam HTTP 403.
6. Verificar que a V74.31 do Recebimento e CPD, a Ponte GZ e os demais módulos continuam operando.

A IA não está "treinada" no banco; os valores são consultados por SQL parametrizado e apresentados à IA como contexto. Recomendações são hipóteses operacionais para avaliação humana.

**Não validado ainda com PostgreSQL real nem com Ollama rodando no PC.** Testar em ambiente controlado antes de implantar no Board de produção.
