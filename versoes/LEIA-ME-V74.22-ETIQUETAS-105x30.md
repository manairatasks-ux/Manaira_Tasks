# Manaíra Board V74.22 — Etiquetas Zebra 105 × 30 mm

## Medidas físicas confirmadas
- Largura: **105 mm**.
- Altura: **30 mm**.
- Zebra ZD230 203 dpi: aproximadamente **839 × 240 dots**.
- Proporção de prévia: **3,5:1**.

## Atualizações
- Configuração padrão de impressão 105 × 30 mm no módulo de Cartazes.
- Configuração padrão correspondente no agente Windows.
- Prévia na tela com proporção real 105:30.
- Quem tinha as medidas antigas do protótipo (110 × 35) terá a configuração atualizada automaticamente ao abrir Etiquetas Zebra, preservando a impressora, token e outros ajustes.
- Layout normal/promocional da V74.21 mantido e reposicionado proporcionalmente pelo agente, preservando a região da logo pré-impressa.

## Teste recomendado
1. Atualize o projeto e reinicie o servidor.
2. Encerre o agente Windows antigo e abra o `INICIAR-IMPRESSAO-ZEBRA.bat` desta versão (um novo token poderá ser gerado).
3. Abra **Cartazes → Etiquetas Zebra**, confirme largura 105 mm e altura 30 mm.
4. Desmarque impressão automática e imprima **uma etiqueta normal e uma promocional**.
5. Compare os impressos com a bobina real; a densidade e calibragem física podem exigir ajustes de X/Y.

Não há alteração de banco de dados. Esta versão não foi testada fisicamente na impressora.
