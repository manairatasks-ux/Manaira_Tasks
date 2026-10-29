# Manaíra Board V70 — Módulo Pit Stop

## Funcionalidades
- Cadastro sequencial: bipar código de barras EAN, consultar descrição na Ponte GZ, informar quantidade, fotografar e salvar; pronto para novo produto.
- Leitor físico com Enter; no celular, fotografia por câmera/galeria; leitura de código por câmera disponível apenas em navegadores com suporte nativo a BarcodeDetector e permissão de câmera (HTTPS).
- Fotografia JPG/PNG/WEBP obrigatória, até 8 MB, armazenada no Cloudinary como recurso autenticado; referência mantida no PostgreSQL.
- Sessões de abastecimento; histórico por período; totais, produtos consolidados e PDF por sessão ou por período (máximo de 300 entradas por relatório consolidado).
- Consulta e correção da quantidade com motivo e auditoria; cancelamento lógico com motivo, sem apagar foto nem histórico; identificação de duplicidade no mesmo abastecimento.
- Design responsivo, alinhado à paleta V69.2.

## Instalação
1. Preserve a versão anterior; extraia a V70 numa pasta nova.
2. Configure o `.env` com as credenciais PostgreSQL, Ponte GZ e Cloudinary já utilizadas pela plataforma.
3. Execute `npm install` e `npm start`. O próprio servidor chama `initDb`, que aplica `CREATE TABLE IF NOT EXISTS` e cadastra o novo módulo sem apagar tabelas antigas. **Não é necessário rodar `npm run init-db` manualmente.**
4. Em Administração > Acessos aos módulos, habilite **Pit Stop** para os colaboradores responsáveis. O administrador principal possui acesso automático.
5. Faça um teste com EAN real, foto, quantidade, salvamento, histórico e PDF.

## Observações
- As entradas são registros operacionais de abastecimento, **não** baixam estoque do GZ e **não** contabilizam vendas.
- Fotos precisam de Cloudinary configurado e acesso à internet. No PDF, fotos indisponíveis são sinalizadas.
- O PDF é regenerado dos registros persistidos; esta V70 não armazena cópias imutáveis dos PDFs gerados. Registros e fotografias permanecem salvos.
- Para usuário comum, histórico e PDF são limitados às suas próprias sessões; gerência/administradores podem acompanhar as sessões de todos.
- O PDF consolidado por período limita a 300 registros para evitar relatórios excessivamente grandes. Reduza o intervalo para abrangência completa em períodos movimentados.
- Testes automatizados com GZ/Cloudinary/PostgreSQL reais não foram realizados neste ambiente. Valide no ambiente de homologação antes de colocar em produção.
