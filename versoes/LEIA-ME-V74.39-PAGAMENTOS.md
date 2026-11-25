# Manaíra Board V74.39 — Ajustes de pagamentos

Base: V74.38, mantidos os módulos anteriores.

- Modais de Pontos Extras não são mais fechados com clique fora da janela. O usuário fecha exclusivamente por **Fechar (X)**, **Cancelar** ou após **Salvar** com sucesso.
- Adicionada **Depósito bancário** às formas de pagamento de contratos comerciais e às modalidades de registrar/editar recebimento.
- A API de recebimentos agora valida e aceita a modalidade **Depósito bancário**. Número do depósito ou banco pode ser detalhado em **Observação**, e comprovante pode ser anexado no registro de recebimento.
- Nenhuma alteração em Banco PostgreSQL ou Ponte GZ é necessária.

Verifique em ambiente de homologação antes de substituir produção.
