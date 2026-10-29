const router = require('express').Router();

const { mobileApiAuth } =
  require('../../middlewares/mobile-api.middleware');

const produtosGzService =
  require('../produtos-gz/produtos-gz.service');


// Mantém a interpretação de preços/datas consistente com Orçamentos.
// A Ponte GZ pode retornar números formatados como "R$ 1.234,56".
function numeroGz(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const texto = String(valor).replace(/R\$/gi, '').replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function dataGz(valor) {
  if (!valor) return null;
  const texto = String(valor).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    return texto.slice(6) + '-' + texto.slice(3, 5) + '-' + texto.slice(0, 2);
  }
  return null;
}

function dadosPromocao(p) {
  const especial = numeroGz(p.precoEspecial);
  const promocao = numeroGz(p.precoPromocao);
  const oferta = (especial !== null && especial > 0)
    ? especial
    : (promocao !== null && promocao > 0 ? promocao : null);
  const inicio = dataGz(p.dataInicioPromocao);
  const termino = dataGz(p.dataTerminoPromocao);
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  const vigente = oferta !== null && inicio !== null && termino !== null &&
    hoje >= inicio && hoje <= termino;
  return {
    precoPromocao: vigente ? oferta : null,
    precoEspecial: especial,
    inicioPromocao: vigente ? inicio : null,
    terminoPromocao: vigente ? termino : null
  };
}


// ============================================================
// CONSULTA DE PRODUTO PELO APP MOBILE
// ============================================================

router.get(
  '/produtos/consulta',
  mobileApiAuth,
  async (req, res) => {

    try {

      const codigo = String(
        req.query.codigo || ''
      ).trim();

      if (!codigo) {
        return res.status(400).json({
          error: 'Informe o código do produto.'
        });
      }


      // ========================================================
      // 1º tenta como código de barras / EAN
      // ========================================================

      let resultado =
        await produtosGzService.consultarProduto({
          codigoBarras: codigo
        });

      let produtos =
        Array.isArray(resultado?.produtos)
          ? resultado.produtos
          : [];


      // ========================================================
      // Se não encontrou, tenta como código interno
      // Ex.: código 30
      // ========================================================

      if (!produtos.length) {

        resultado =
          await produtosGzService.consultarProduto({
            codigoInterno: codigo
          });

        produtos =
          Array.isArray(resultado?.produtos)
            ? resultado.produtos
            : [];
      }


      // ========================================================
      // NÃO ENCONTRADO
      // ========================================================

      if (!produtos.length) {

        return res.json({
          encontrado: false,
          produto: null
        });
      }


      // ========================================================
      // PRODUTO
      // ========================================================

      const p = produtos[0];
      const promocao = dadosPromocao(p);


      return res.json({

        encontrado: true,

        produto: {

          codigoInterno:
            String(p.codigo || ''),

          ean:
            String(p.codigoEan || ''),

          descricao:
            String(
              p.descricao ||
              p.descpdv ||
              ''
            ),

          unidade:
            String(p.unidade || ''),

          precoVenda:
            numeroGz(p.precoVenda) ?? 0,

          // O SupManaira V5 usa este campo para exibir a oferta.
          // Só enviamos promoção quando preço e datas são válidos.
          precoPromocao:
            promocao.precoPromocao,

          precoEspecial:
            promocao.precoEspecial,

          estoque:
            numeroGz(p.quantidadeEstoque) ?? 0,

          situacao:
            String(p.situacao || ''),

          inicioPromocao:
            promocao.inicioPromocao,

          terminoPromocao:
            promocao.terminoPromocao
        }
      });

    } catch (err) {

      console.error(
        'Erro consulta mobile:',
        err
      );

      res.status(
        err.status || 502
      ).json({

        error:
          err.message ||
          'Erro ao consultar produto na GZ.'
      });
    }
  }
);


module.exports = router;