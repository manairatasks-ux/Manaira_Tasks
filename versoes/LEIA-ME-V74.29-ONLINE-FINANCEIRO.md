# Manaíra Board V74.29 — Online × Financeiro (primeira versão)

Base: projeto V74.28 fornecido pelo usuário. Os módulos anteriores foram preservados.

## Módulos novos

- **Online** (`online_boletos`): cria solicitação com cliente, cupom, valor opcional, parcelas opcionais e observações; fotografa cupom no celular ou seleciona JPG/PNG/WEBP/PDF; acompanha status; reenvia após devolução.
- **Financeiro** (`financeiro_boletos`): consulta solicitações do Online, inicia preparação, vê cupons, anexa um ou vários boletos em JPG/PNG/WEBP/PDF, marca como pronto, devolve para correção ou cancela com justificativa.
- Os módulos usam o mesmo banco e o histórico de ações; futuras origens são possíveis na estrutura (`setor_origem`, `tipo`), mas **nenhum outro setor foi habilitado** nesta versão.

## Como habilitar

1. Faça backup do PostgreSQL.
2. Publique o projeto e aguarde a inicialização (executa `src/init-db.js`, criando `sb_solicitacoes`, `sb_documentos` e `sb_eventos`, sem apagar registros existentes).
3. Em **Administração → Acessos dos módulos**, habilite **Online** para os solicitantes e **Financeiro** para a equipe financeira. O administrador principal recebe acesso automaticamente pela regra já existente no Board.
4. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` no Render para anexos, caso ainda não estejam configurados.
5. Faça o teste: Online cria e anexa cupom → Financeiro abre, inicia, anexa boleto e conclui → Online abre o boleto.

## Status

Pendente → Em preparação → Boleto pronto. O Financeiro também pode devolver para correção (Online complementa cupom e reenvia) ou cancelar. A conclusão exige pelo menos um boleto; iniciar preparação exige ao menos um cupom anexado.

## Arquivos

- Fotos e PDFs, até 10 MB por arquivo, gravados via Cloudinary; metadados no PostgreSQL.
- O sistema mantém o login e a autorização por módulo já existentes no Board. Não foram adicionados PINs ou bloqueios individuais por documento nesta versão.
- Os anexos não são gravados em disco local do Render.

## Limites da primeira versão

- Não emite boletos bancários, não monitora pagamentos, não integra bancos e não inclui outros setores.
- Não há exclusão de solicitações/documentos ou alterações de cliente após envio; devolução permite anexar novos cupons.
- Sem notificações automáticas: o usuário atualiza a tela.
- A validação realizada foi estática (sintaxe JS, rotas, integrações e estrutura do ZIP). Testes reais de banco, Cloudinary e câmera precisam ser realizados no ambiente da empresa antes da produção.
