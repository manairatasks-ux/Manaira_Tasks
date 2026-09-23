const router = require('express').Router();

const { mobileApiAuth } =
  require('../../middlewares/mobile-api.middleware');

const produtosGzService =
  require('../produtos-gz/produtos-gz.service');


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
            Number(p.precoVenda || 0),

          precoPromocao:
            Number(p.precoPromocao || 0),

          precoEspecial:
            Number(p.precoEspecial || 0),

          estoque:
            Number(p.quantidadeEstoque || 0),

          situacao:
            String(p.situacao || ''),

          inicioPromocao:
            p.dataInicioPromocao || null,

          terminoPromocao:
            p.dataTerminoPromocao || null
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