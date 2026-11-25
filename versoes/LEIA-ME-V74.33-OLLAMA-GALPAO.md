# Manaíra Board V74.33 — Manaíra IA real com Ollama (piloto Galpão)

## Mudanças
- Mantém dashboard, chat e botão flutuante da V74.32.
- Solicitações de chat passam para fila no PostgreSQL e são entregues a um **agente local por HTTPS de saída**.
- Agente local executa `qwen3.5:4b` em `http://127.0.0.1:11434/api/chat` com `think:false`, retornando somente a resposta.
- **Nenhuma porta do PC é publicada**, nenhuma mudança no ngrok da Ponte GZ.
- Se agente cair/desligar, após 3 minutos o Board apresenta análise determinística do Galpão (não finge ser IA).
- A fila fica no PostgreSQL, permitindo múltiplas instâncias Render, e atribuição atômica da tarefa.
- Mantém permissões existentes: somente Administrador Principal e opcionalmente e-mail definido em `MANAIRA_IA_EMAIL`.

## Configurar sem compartilhar segredos
1. Faça backup do Board e do PostgreSQL. Publique V74.33 em ambiente de teste, com a mesma configuração que usava na V74.32. A nova tabela `manaira_ia_jobs` é criada no início.
2. **Não precisa instalar Python:** o arquivo `agente-ollama-windows/Manaira_IA_Agente_Windows_V1.exe` é executável Windows 64 bits. O código-fonte Go também está incluído.
3. Confirme que o Ollama está rodando: `curl.exe http://localhost:11434/api/tags`, com `qwen3.5:4b` listado.
4. No PC pessoal, execute **`Manaira_IA_Agente_Windows_V1.exe` pela primeira vez**, informe a URL HTTPS pública do seu Render. O programa gera uma chave aleatória e cria `config.json` no mesmo diretório. Não publique esse arquivo.
5. Em **Render > Environment**, cadastre `MANAIRA_IA_WORKER_KEY` com o valor mostrado pelo configurador e efetue redeploy/restart.
6. No PC pessoal, abra novamente `Manaira_IA_Agente_Windows_V1.exe` (deixe rodando para usar a IA). Verifique que informa "agente Windows V1". Os scripts Python são uma alternativa, não obrigatórios.
7. Abra o Board em seu usuário administrador principal. Faça uma pergunta sobre os dados do Galpão; a resposta aparecerá como `Qwen3.5 4B · Ollama local` se o agente executar.

**Segurança:** nunca publique `config.json`, nunca coloque a chave no JS do navegador ou compartilhe em chat. Não configure `MANAIRA_IA_OLLAMA_URL` na V74.33. Se o Render usar endereço customizado, informe seu HTTPS correspondente.

## Limites e observações
- Uma pergunta de cada vez recomendada. Até 2 tarefas ativas por usuário; expiração 3 minutos; timeout Ollama 110s.
- Dados do Galpão são calculados pelo backend em SQL somente de leitura. O Ollama recebe resumo e recortes, não o PostgreSQL nem credenciais.
- O chat é de linguagem natural, mas os rankings e tendências disponíveis são limitados às consultas existentes no Galpão. Não inventa números ausentes.
- `config.json` do agente **não está incluído** no ZIP e deverá ser criado localmente.
- Nesta V1 o modo local não sobrecarrega o servidor da Ponte GZ, mas usa CPU/GPU/RAM do seu PC quando uma pergunta é processada.
- Os dados de contexto enviados pelo Board são armazenados temporariamente na fila `manaira_ia_jobs`; definir política de retenção/limpeza em versão futura. Recomendamos restringir acesso ao banco e fazer backup.

## Validação
- Revisão de sintaxe em arquivos Node.js e Python.
- Testes unitários de formatação e configuração do agente. **Não foi validada comunicação com Render e PostgreSQL reais neste ambiente.**
- Faça primeiro em homologação e confira as respostas com o relatório do Galpão.
