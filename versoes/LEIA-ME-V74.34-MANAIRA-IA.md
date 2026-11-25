# Manaíra Board V74.34 — Manaíra IA / Galpão

Base: V74.33 enviada pelo usuário, preservando os demais módulos.

## Melhorias
- Chat curto por padrão: sem seções repetitivas de fatos/hipóteses/recomendações em perguntas simples.
- Códigos de barras, descrição, embalagens e unidades de movimentações por dia, com consultas diretas ao PostgreSQL.
- Reconhece 'hoje', 'ontem', 'esta semana', 'este mês' e datas DD/MM/AAAA.
- Continuidade de correção curta: 'eu falo as saídas' herda a data da pergunta anterior.
- Tabelas compactas copiáveis e fonte recolhida no chat.
- Até 100 registros detalhados por consulta; total do período continua correto. Não é exportação de todos os registros.
- Cálculos não incluem movimentações estornadas. Não confunde saídas do Galpão com vendas.
- Mantém Ollama opcional para análises e perguntas gerais.

## Instalação
1. Faça backup da versão em produção e do PostgreSQL.
2. Atualize o Board com o projeto completo V74.34, preservando o .env e variáveis do Render da instalação existente. Não precisa mudar a chave do agente.
3. No PC que executa Ollama, feche o Agente Windows V1 e substitua somente o executável pelo `agente-ollama-windows/Manaira_IA_Agente_Windows_V2.exe` na MESMA pasta que guarda seu `config.json` atual. O novo ZIP deliberadamente NÃO contém a configuração privada.
4. Abra o Agente Windows V2. Mantenha o Ollama instalado e rodando.
5. Teste o Galpão com: 'Liste os códigos de barras das saídas de hoje'; 'Quais entradas tivemos ontem?'; 'Analise o giro do Galpão'.

## Segurança
O agente faz requisições HTTPS de saída para o Board e acessa o Ollama somente em 127.0.0.1. O modelo não recebe acesso direto ao PostgreSQL nem executa SQL. As consultas detalhadas são parametrizadas e protegidas pela autenticação existente do Manaíra IA. Nenhum .env ou config.json privado está incluído neste pacote.

## Limitações
Não foi testado no Render, no PostgreSQL da empresa ou na interface real do Windows. Consultas detalhadas exibem até 100 linhas para não sobrecarregar o chat. O período das datas relativas é interpretado no fuso America/Fortaleza. Recomenda-se conferir os valores com o histórico do Galpão antes de usar em decisões operacionais.
