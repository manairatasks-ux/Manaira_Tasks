const router=require('express').Router();
const PDFDocument=require('pdfkit');
const {query,get,all}=require('./os.model');
const {auth,authPdf}=require('../../middlewares/auth.middleware');
const {requireModuleAccess,requireModuleAccessPdf}=require('../../middlewares/module-access.middleware');
const {requireManager,requireManagerPdf}=require('../../shared/profile.service');
const {cleanDateTime,normalizeMinutes,generateOsNumber,osOpenFilter,checkPortalPassword,cleanId,getUserNameById}=require('./os.service');

router.get('/api/os/dashboard', auth, requireModuleAccess('os'), requireManager, async (req, res) => {
  try {
    const { busca = '', status = '', prioridade = '', responsavel = '', periodo = '30' } = req.query;
    const params = [];
    const filters = [];

    if (busca) {
      params.push(`%${String(busca).trim()}%`);
      filters.push(`(o.titulo ILIKE $${params.length} OR COALESCE(o.descricao,'') ILIKE $${params.length} OR COALESCE(o.setor_local,'') ILIKE $${params.length} OR COALESCE(o.solicitante,'') ILIKE $${params.length})`);
    }
    if (status) { params.push(status); filters.push(`o.status = $${params.length}`); }
    if (prioridade) { params.push(prioridade); filters.push(`o.prioridade = $${params.length}`); }
    if (responsavel) { params.push(`%${String(responsavel).trim()}%`); filters.push(`COALESCE(u_resp.nome, o.responsavel_principal, '') ILIKE $${params.length}`); }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const periodoDias = Math.max(1, Math.min(parseInt(periodo, 10) || 30, 365));

    const totalizadores = await get(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${osOpenFilter('o')})::int AS abertas,
        COUNT(*) FILTER (WHERE o.status = 'Recebido')::int AS recebidas,
        COUNT(*) FILTER (WHERE o.status = 'Em execução')::int AS em_execucao,
        COUNT(*) FILTER (WHERE o.status IN ('Aguardando mão de obra', 'Aguardando material', 'Pausado'))::int AS pendentes,
        COUNT(*) FILTER (WHERE o.status = 'Concluído')::int AS concluidas,
        COUNT(*) FILTER (WHERE o.prioridade = 'Urgente' AND ${osOpenFilter('o')})::int AS urgentes,
        ROUND(AVG(NULLIF(o.tempo_real_min, 0)))::int AS tempo_medio_min
      FROM ordens_servico o
      LEFT JOIN usuarios u_resp ON u_resp.id = o.responsavel_principal_id
      ${where}
    `, params);

    const porStatus = await all(`SELECT o.status, COUNT(*)::int AS total FROM ordens_servico o LEFT JOIN usuarios u_resp ON u_resp.id = o.responsavel_principal_id ${where} GROUP BY o.status ORDER BY total DESC`, params);
    const porPrioridade = await all(`SELECT o.prioridade, COUNT(*)::int AS total FROM ordens_servico o LEFT JOIN usuarios u_resp ON u_resp.id = o.responsavel_principal_id ${where} GROUP BY o.prioridade ORDER BY CASE o.prioridade WHEN 'Urgente' THEN 1 WHEN 'Alta' THEN 2 WHEN 'Média' THEN 3 WHEN 'Baixa' THEN 4 ELSE 5 END`, params);
    const porResponsavel = await all(`
      SELECT COALESCE(u_resp.nome, NULLIF(TRIM(o.responsavel_principal), ''), 'Sem responsável') AS responsavel,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${osOpenFilter('o')})::int AS abertas,
        COUNT(*) FILTER (WHERE o.status = 'Concluído')::int AS concluidas
      FROM ordens_servico o
      LEFT JOIN usuarios u_resp ON u_resp.id = o.responsavel_principal_id
      ${where}
      GROUP BY COALESCE(u_resp.nome, NULLIF(TRIM(o.responsavel_principal), ''), 'Sem responsável')
      ORDER BY abertas DESC, total DESC
      LIMIT 12
    `, params);

    const recentes = await all(`
      SELECT o.*, u_resp.nome AS responsavel_nome FROM ordens_servico o
      LEFT JOIN usuarios u_resp ON u_resp.id = o.responsavel_principal_id
      ${where}
      ORDER BY CASE o.prioridade WHEN 'Urgente' THEN 1 WHEN 'Alta' THEN 2 WHEN 'Média' THEN 3 WHEN 'Baixa' THEN 4 ELSE 5 END,
        CASE o.status WHEN 'Recebido' THEN 1 WHEN 'Em análise' THEN 2 WHEN 'Em execução' THEN 3 ELSE 4 END,
        o.criado_em DESC
      LIMIT 80
    `, params);

    const concluidasPeriodo = await all(`
      SELECT to_char(date_trunc('day', o.data_conclusao), 'YYYY-MM-DD') AS dia, COUNT(*)::int AS total
      FROM ordens_servico o
      WHERE o.status = 'Concluído' AND o.data_conclusao >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
      GROUP BY date_trunc('day', o.data_conclusao)
      ORDER BY date_trunc('day', o.data_conclusao)
    `, [periodoDias]);

    res.json({ filtros: { busca, status, prioridade, responsavel, periodo: periodoDias }, totalizadores: totalizadores || {}, porStatus, porPrioridade, porResponsavel, recentes, concluidasPeriodo });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar ordens de serviço.', details: err.message });
  }
});

router.post('/api/os', auth, requireModuleAccess('os'), requireManager, async (req, res) => {
  try {
    const {
      titulo, descricao, solicitante, setor_local, categoria, prioridade, impacto, status,
      responsavel_principal_id, responsavel_principal, funcionarios, quantidade_mao_obra, tempo_estimado_min,
      previsao_conclusao, material_necessario, material_utilizado, pendencias, execucao,
      observacao_conclusao, data_inicio, data_conclusao, tempo_real_min
    } = req.body;

    if (!titulo) return res.status(400).json({ error: 'Título da OS é obrigatório.' });

    const respId = cleanId(responsavel_principal_id);
    const respNome = respId ? await getUserNameById(respId) : (responsavel_principal || '');
    const numero = await generateOsNumber();

    const os = await get(`
      INSERT INTO ordens_servico
      (numero, titulo, descricao, solicitante, setor_local, categoria, prioridade, impacto, status,
       responsavel_principal, responsavel_principal_id, funcionarios, quantidade_mao_obra, tempo_estimado_min, tempo_real_min,
       previsao_conclusao, data_inicio, data_conclusao, material_necessario, material_utilizado, pendencias,
       execucao, observacao_conclusao, criado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      RETURNING *
    `, [
      numero, titulo, descricao || '', solicitante || '', setor_local || '', categoria || 'Outros', prioridade || 'Média', impacto || '', status || 'Recebido',
      respNome || '', respId, funcionarios || '', normalizeMinutes(quantidade_mao_obra) || 1, normalizeMinutes(tempo_estimado_min), normalizeMinutes(tempo_real_min),
      cleanDateTime(previsao_conclusao), cleanDateTime(data_inicio), cleanDateTime(data_conclusao), material_necessario || '', material_utilizado || '', pendencias || '',
      execucao || '', observacao_conclusao || '', req.user.id
    ]);
    res.status(201).json(os);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar OS.', details: err.message });
  }
});


router.put('/api/os/:id', auth, requireModuleAccess('os'), requireManager, async (req, res) => {
  try {
    const {
      titulo,
      descricao,
      solicitante,
      setor_local,
      categoria,
      prioridade,
      impacto,
      status,
      responsavel_principal_id,
      responsavel_principal,
      funcionarios,
      quantidade_mao_obra,
      tempo_estimado_min,
      previsao_conclusao,
      material_necessario,
      material_utilizado,
      pendencias,
      execucao,
      observacao_conclusao,
      data_inicio,
      data_conclusao,
      tempo_real_min
    } = req.body;

    if (!titulo || !String(titulo).trim()) {
      return res.status(400).json({ error: 'Título da OS é obrigatório.' });
    }

    const osExistente = await get('SELECT * FROM ordens_servico WHERE id = $1', [req.params.id]);
    if (!osExistente) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' });

    const finalStatus = status || 'Recebido';
    const respId = cleanId(responsavel_principal_id);
    const respNome = respId ? await getUserNameById(respId) : (responsavel_principal || '');

    let dataInicioFinal = cleanDateTime(data_inicio);
    let dataConclusaoFinal = cleanDateTime(data_conclusao);
    if (finalStatus === 'Em execução' && !dataInicioFinal && !osExistente.data_inicio) dataInicioFinal = new Date();
    if (!dataInicioFinal && osExistente.data_inicio) dataInicioFinal = osExistente.data_inicio;
    if (finalStatus === 'Concluído' && !dataConclusaoFinal && !osExistente.data_conclusao) dataConclusaoFinal = new Date();
    if (!dataConclusaoFinal && osExistente.data_conclusao) dataConclusaoFinal = osExistente.data_conclusao;

    const os = await get(`
      UPDATE ordens_servico SET
        titulo = $1,
        descricao = $2,
        solicitante = $3,
        setor_local = $4,
        categoria = $5,
        prioridade = $6,
        impacto = $7,
        status = $8,
        responsavel_principal = $9,
        responsavel_principal_id = $10,
        funcionarios = $11,
        quantidade_mao_obra = $12,
        tempo_estimado_min = $13,
        tempo_real_min = $14,
        previsao_conclusao = $15,
        data_inicio = $16,
        data_conclusao = $17,
        material_necessario = $18,
        material_utilizado = $19,
        pendencias = $20,
        execucao = $21,
        observacao_conclusao = $22,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $23
      RETURNING *
    `, [
      String(titulo).trim(), descricao || '', solicitante || '', setor_local || '', categoria || 'Outros', prioridade || 'Média', impacto || '', finalStatus,
      respNome || '', respId, funcionarios || '', normalizeMinutes(quantidade_mao_obra) || 1, normalizeMinutes(tempo_estimado_min), normalizeMinutes(tempo_real_min),
      cleanDateTime(previsao_conclusao), dataInicioFinal, dataConclusaoFinal, material_necessario || '', material_utilizado || '', pendencias || '', execucao || '', observacao_conclusao || '', req.params.id
    ]);

    return res.json(os);
  } catch (err) {
    console.error('ERRO AO ATUALIZAR OS:');
    console.error(err);
    return res.status(500).json({ error: 'Erro ao atualizar OS.', details: err.message });
  }
});


router.patch('/api/os/:id/status', auth, requireModuleAccess('os'), requireManager, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Status é obrigatório.'
      });
    }

    const osExistente = await get(
      'SELECT * FROM ordens_servico WHERE id = $1',
      [req.params.id]
    );

    if (!osExistente) {
      return res.status(404).json({
        error: 'Ordem de serviço não encontrada.'
      });
    }

    let dataInicioFinal = osExistente.data_inicio;
    let dataConclusaoFinal = osExistente.data_conclusao;

    // Registra automaticamente quando a OS entra em execução
    if (status === 'Em execução' && !dataInicioFinal) {
      dataInicioFinal = new Date();
    }

    // Registra automaticamente quando a OS é concluída
    if (status === 'Concluído' && !dataConclusaoFinal) {
      dataConclusaoFinal = new Date();
    }

    const osAtualizada = await get(
      `
      UPDATE ordens_servico SET
        status = $1,
        data_inicio = $2,
        data_conclusao = $3,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
      `,
      [
        status,
        dataInicioFinal,
        dataConclusaoFinal,
        req.params.id
      ]
    );

    return res.json(osAtualizada);

  } catch (err) {
    console.error('ERRO AO ALTERAR STATUS DA OS:');
    console.error(err);

    return res.status(500).json({
      error: 'Erro ao alterar status da OS.',
      details: err.message
    });
  }
});

router.delete('/api/os/:id', auth, requireModuleAccess('os'), requireManager, async (req, res) => {
  try {
    await query('DELETE FROM ordens_servico WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir OS.', details: err.message });
  }
});


router.get('/api/os/relatorio-andamento-pdf', authPdf, requireModuleAccessPdf('os'), requireManagerPdf, async (req, res) => {
  try {
    const { range = 'all', busca = '', prioridade = '', responsavel = '' } = req.query;

    const params = [];
    const filters = [
      `(o.status = 'Em execução' OR o.status IN ('Aguardando mão de obra', 'Aguardando material', 'Pausado'))`
    ];

    if (busca) {
      params.push(`%${String(busca).trim()}%`);
      filters.push(`(o.numero ILIKE $${params.length} OR o.titulo ILIKE $${params.length} OR COALESCE(o.descricao,'') ILIKE $${params.length} OR COALESCE(o.setor_local,'') ILIKE $${params.length} OR COALESCE(o.solicitante,'') ILIKE $${params.length})`);
    }

    if (prioridade) {
      params.push(String(prioridade).trim());
      filters.push(`o.prioridade = $${params.length}`);
    }

    if (responsavel) {
      params.push(`%${String(responsavel).trim()}%`);
      filters.push(`(COALESCE(u.nome, '') ILIKE $${params.length} OR COALESCE(o.responsavel_principal, '') ILIKE $${params.length})`);
    }

    if (range === 'hoje') {
      filters.push(`o.previsao_conclusao::date = CURRENT_DATE`);
    } else if (range === '7') {
      filters.push(`o.previsao_conclusao::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`);
    }

    const where = `WHERE ${filters.join(' AND ')}`;

    const itens = await all(`
      SELECT o.*, u.nome AS responsavel_nome
      FROM ordens_servico o
      LEFT JOIN usuarios u ON u.id = o.responsavel_principal_id
      ${where}
      ORDER BY
        CASE
          WHEN o.status = 'Em execução' THEN 1
          ELSE 2
        END,
        CASE o.prioridade
          WHEN 'Urgente' THEN 1
          WHEN 'Alta' THEN 2
          WHEN 'Média' THEN 3
          WHEN 'Baixa' THEN 4
          ELSE 5
        END,
        COALESCE(o.previsao_conclusao, o.criado_em) ASC,
        o.id DESC
      LIMIT 200
    `, params);

    const rangeLabel = {
      hoje: 'com previsão para hoje',
      7: 'com previsão para os próximos 7 dias',
      all: 'todas em execução e pendências'
    }[String(range)] || 'em andamento';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="os-andamento-${safeFileName(rangeLabel)}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 28, bufferPages: true });
    doc.pipe(res);

    const page = {
      left: 16,
      right: 579,

      // Área útil ampliada porque o rodapé será removido
      bottom: 828,

      // Distância horizontal entre os cards
      cardGap: 5,

      // Distância vertical entre as linhas
      rowGap: 8,

      // Altura para caber 4 linhas por página
      cardH: 158
    };

    page.cardW =
      (page.right - page.left - (page.cardGap * 2)) / 3;

    function txt(value) {
      return value && String(value).trim() ? String(value).trim() : '-';
    }

    function short(value, max) {
      return truncateText(txt(value), max);
    }

    function sectionName(status) {
      return status === 'Em execução' ? 'Em execução' : 'Pendências';
    }

    function drawHeader() {
      doc
        .rect(0, 0, doc.page.width, doc.page.height)
        .fill('#f8fafc');

      doc
        .roundedRect(16, 18, 36, 26, 7)
        .fill('#0b2f6b');

      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .text(
          'OS',
          16,
          26,
          {
            width: 36,
            align: 'center'
          }
        );

      doc
        .fillColor('#0b2f6b')
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(
          'Relatório compacto de OS',
          62,
          18,
          {
            width: 340
          }
        );

      doc
        .fillColor('#64748b')
        .font('Helvetica')
        .fontSize(7.3)
        .text(
          `Em execução e Pendências • ${rangeLabel}`,
          62,
          36,
          {
            width: 360
          }
        );

      doc
        .fillColor('#334155')
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .text(
          `Gerado em ${brDateTime(new Date())}`,
          414,
          20,
          {
            width: 150,
            align: 'right'
          }
        )
        .text(
          `Usuário: ${req.user.nome || '-'}`,
          414,
          34,
          {
            width: 150,
            align: 'right'
          }
        );

      const execCount =
        itens.filter(i => i.status === 'Em execução').length;

      const pendCount = itens.length - execCount;

      const metricsY = 53;
      const metricGap = 8;
      const metricW =
        (page.right - page.left - metricGap * 3) / 4;

      const metricas = [
        ['Total', itens.length, '#0b2f6b'],
        ['Em execução', execCount, '#f97316'],
        ['Pendências', pendCount, '#b91c1c'],
        [
          'Alta/Urgente',
          itens.filter(i =>
            ['Alta', 'Urgente'].includes(i.prioridade)
          ).length,
          '#7f1d1d'
        ]
      ];

      metricas.forEach((m, idx) => {
        const x =
          page.left + idx * (metricW + metricGap);

        doc
          .roundedRect(x, metricsY, metricW, 30, 8)
          .fill('#ffffff')
          .strokeColor('#dbeafe')
          .lineWidth(0.6)
          .stroke();

        doc
          .fillColor('#64748b')
          .font('Helvetica-Bold')
          .fontSize(6.1)
          .text(
            m[0],
            x + 8,
            metricsY + 5,
            {
              width: metricW - 16
            }
          );

        doc
          .fillColor(m[2])
          .font('Helvetica-Bold')
          .fontSize(12.5)
          .text(
            String(m[1]),
            x + 8,
            metricsY + 16,
            {
              width: metricW - 16
            }
          );
      });

      return 93;
    }

    function ensurePage(y, height) {
      if (y + height <= page.bottom) return y;
      doc.addPage();
      return drawHeader();
    }

    function drawSectionTitle(title, count, y) {
      y = ensurePage(y, 22);

      const color =
        title === 'Em execução'
          ? '#f97316'
          : '#b91c1c';

      doc
        .roundedRect(
          page.left,
          y,
          page.right - page.left,
          17,
          6
        )
        .fill(color);

      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text(
          `${title} (${count})`,
          page.left + 9,
          y + 5,
          {
            width: 360
          }
        );

      return y + 24;
    }

    function pill(x, y, text, bg, fg, w) {
      doc
        .roundedRect(x, y, w, 12, 6)
        .fill(bg);

      doc
        .fillColor(fg)
        .font('Helvetica-Bold')
        .fontSize(4.7)
        .text(
          String(text || '-'),
          x + 2,
          y + 3.7,
          {
            width: w - 4,
            align: 'center',
            ellipsis: true
          }
        );
    }

    function drawInfo(label, value, x, y, w) {
      doc
        .fillColor('#64748b')
        .font('Helvetica-Bold')
        .fontSize(5.9)
        .text(
          String(label).toUpperCase(),
          x,
          y,
          {
            width: w,
            height: 8
          }
        );

      doc
        .fillColor('#0f172a')
        .font('Helvetica')
        .fontSize(6.8)
        .text(
          txt(value),
          x,
          y + 8,
          {
            width: w,
            height: 17,
            ellipsis: true,
            lineGap: 1
          }
        );
    }

    function drawCard(o, x, y) {
      const w = page.cardW;
      const h = page.cardH;

      const pri = priorityColor(o.prioridade);
      const stat = statusColor(o.status);

      const accent =
        o.status === 'Em execução'
          ? '#f97316'
          : '#b91c1c';

      /*
        No cadastro público, o local exato e o impacto
        são adicionados dentro da própria descrição.
    
        Aqui separamos essas informações para:
        - mostrar somente a descrição principal;
        - exibir o local exato em uma área própria;
        - ocultar o impacto, pois a prioridade já aparece no card.
      */
      const descricaoCompleta = String(o.descricao || '');

      /*
        Compatibilidade com OS antigas.
      
        Nas OS antigas, o local exato ainda está
        dentro da descrição.
      */
      const localAntigoMatch = descricaoCompleta.match(
        /Local exato informado:\s*(.*?)(?=\s*Impacto informado:|$)/is
      );

      const localExatoAntigo = localAntigoMatch
        ? localAntigoMatch[1]
          .replace(/\s+/g, ' ')
          .trim()
        : '';

      /*
        Nas OS novas, usa diretamente a coluna local_exato.
      
        Caso a OS seja antiga e a coluna esteja vazia,
        utiliza o local extraído da descrição.
      */
      const localExatoDetalhado =
        String(o.local_exato || '').trim() ||
        localExatoAntigo;

      /*
        Limpa a descrição antiga para que o PDF
        não mostre novamente local e impacto.
      
        Nas OS novas, essas expressões não existirão,
        então a descrição permanecerá como foi salva.
      */
      const descricaoLimpa = descricaoCompleta
        .replace(
          /\s*Local exato informado:\s*.*?(?=\s*Impacto informado:|$)/is,
          ''
        )
        .replace(
          /\s*Impacto informado:\s*.*$/is,
          ''
        )
        .replace(/\s+/g, ' ')
        .trim();


      // =========================
      // CARD
      // =========================

      doc
        .roundedRect(x, y, w, h, 9)
        .fill('#ffffff')
        .strokeColor('#cfe0f8')
        .lineWidth(0.7)
        .stroke();

      doc
        .roundedRect(x, y, 5, h, 3)
        .fill(accent);


      // =========================
      // CABEÇALHO
      // =========================

      doc
        .fillColor('#0b2f6b')
        .font('Helvetica-Bold')
        .fontSize(6.9)
        .text(
          txt(o.numero || `OS-${o.id}`),
          x + 9,
          y + 7,
          {
            width: 66,
            height: 9,
            ellipsis: true
          }
        );

      pill(
        x + w - 96,
        y + 5,
        o.status,
        stat[0],
        stat[1],
        65
      );

      pill(
        x + w - 28,
        y + 5,
        o.prioridade,
        pri[0],
        pri[1],
        25
      );


      // =========================
      // TÍTULO
      // =========================

      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(8.1)
        .text(
          short(o.titulo, 75),
          x + 9,
          y + 23,
          {
            width: w - 18,
            height: 15,
            ellipsis: true,
            lineGap: 1
          }
        );


      // =========================
      // INFORMAÇÕES PRINCIPAIS
      // =========================

      const infoY = y + 39;
      const colGap = 4;

      const colW =
        (w - 18 - colGap * 2) / 3;

      drawInfo(
        'Resp.',
        o.responsavel_nome ||
        o.responsavel_principal ||
        'Sem responsável',
        x + 9,
        infoY,
        colW
      );

      drawInfo(
        'Local exato',
        o.setor_local || '-',
        x + 9 + colW + colGap,
        infoY,
        colW
      );

      drawInfo(
        'Previsão',
        o.previsao_conclusao
          ? brDateTime(o.previsao_conclusao)
          : '-',
        x + 9 + (colW + colGap) * 2,
        infoY,
        colW
      );


      // =========================
      // DESCRIÇÃO PRINCIPAL
      // =========================

      const descY = y + 64;

      doc
        .fillColor('#64748b')
        .font('Helvetica-Bold')
        .fontSize(6.1)
        .text(
          'DESC.',
          x + 9,
          descY,
          {
            width: 18,
            height: 8
          }
        );

      doc
        .fillColor('#334155')
        .font('Helvetica')
        .fontSize(7)
        .text(
          short(
            descricaoLimpa || 'Sem descrição informada.',
            450
          ),
          x + 27,
          descY,
          {
            width: w - 36,

            // Até aproximadamente quatro linhas
            height: 38,

            ellipsis: true,
            lineGap: 1.2
          }
        );


      // =========================
      // LOCAL EXATO DETALHADO
      // =========================

      const localDetalhadoY = y + 105;

      if (localExatoDetalhado) {
        doc
          .fillColor('#0b2f6b')
          .font('Helvetica-Bold')
          .fontSize(6.1)
          .text(
            'LOCAL:',
            x + 9,
            localDetalhadoY,
            {
              width: 21,
              height: 8
            }
          );

        doc
          .fillColor('#334155')
          .font('Helvetica')
          .fontSize(6.8)
          .text(
            short(localExatoDetalhado, 180),
            x + 30,
            localDetalhadoY,
            {
              width: w - 39,

              // Até aproximadamente duas linhas
              height: 19,

              ellipsis: true,
              lineGap: 1
            }
          );
      }


      // =========================
      // PENDÊNCIAS
      // =========================

      if (o.pendencias && String(o.pendencias).trim()) {
        const pendY = y + 127;

        doc
          .fillColor('#b91c1c')
          .font('Helvetica-Bold')
          .fontSize(6.1)
          .text(
            'PEND.',
            x + 9,
            pendY,
            {
              width: 18,
              height: 8
            }
          );

        doc
          .fillColor('#7f1d1d')
          .font('Helvetica')
          .fontSize(7)
          .text(
            short(o.pendencias, 300),
            x + 27,
            pendY,
            {
              width: w - 36,

              // Até aproximadamente três linhas
              height: 26,

              ellipsis: true,
              lineGap: 1.2
            }
          );
      }
    }




    let y = drawHeader();

    if (!itens.length) {
      doc.roundedRect(60, y + 50, 475, 90, 16).fill('#ffffff').strokeColor('#dbeafe').stroke();
      doc.fillColor('#0b2f6b').font('Helvetica-Bold').fontSize(13).text('Nenhuma OS encontrada', 60, y + 78, { width: 475, align: 'center' });
      doc.fillColor('#64748b').font('Helvetica').fontSize(8).text('Não existem chamados em execução ou pendências para os filtros selecionados.', 80, y + 102, { width: 435, align: 'center' });
    }

    else {
      const sections = [
        [
          'Em execução',
          itens.filter(o => o.status === 'Em execução')
        ],
        [
          'Pendências',
          itens.filter(o => o.status !== 'Em execução')
        ]
      ];

      // Controla quantas linhas já foram usadas na página
      let rowsOnPage = 0;

      for (const [title, list] of sections) {
        if (!list.length) continue;

        /*
          Caso a página já tenha quatro linhas,
          começa uma nova página antes da seção.
        */
        if (rowsOnPage >= 4) {
          doc.addPage();
          y = drawHeader();
          rowsOnPage = 0;
        }

        /*
          Verifica se ainda cabe o título e pelo menos
          uma linha de cards.
        */
        if (
          y + 24 + page.cardH >
          page.bottom
        ) {
          doc.addPage();
          y = drawHeader();
          rowsOnPage = 0;
        }

        y = drawSectionTitle(title, list.length, y);

        let col = 0;

        for (const os of list) {
          /*
            Sempre que começar uma nova linha,
            verifica se já atingiu quatro linhas.
          */
          if (col === 0 && rowsOnPage >= 4) {
            doc.addPage();
            y = drawHeader();
            rowsOnPage = 0;

            // Repete o título da seção na nova página
            y = drawSectionTitle(
              `${title} — continuação`,
              list.length,
              y
            );
          }

          /*
            Segurança adicional para não ultrapassar
            a parte inferior da página.
          */
          if (
            col === 0 &&
            y + page.cardH > page.bottom
          ) {
            doc.addPage();
            y = drawHeader();
            rowsOnPage = 0;

            y = drawSectionTitle(
              `${title} — continuação`,
              list.length,
              y
            );
          }

          const x =
            page.left +
            col * (page.cardW + page.cardGap);

          drawCard(os, x, y);

          col += 1;

          /*
            Ao completar três colunas,
            avança uma linha.
          */
          if (col >= 3) {
            col = 0;
            rowsOnPage += 1;
            y += page.cardH + page.rowGap;
          }
        }

        /*
          Caso a última linha tenha menos de três cards,
          ainda assim ela conta como uma linha.
        */
        if (col !== 0) {
          rowsOnPage += 1;
          y += page.cardH + page.rowGap;
        }

        y += 4;
      }
    }

    doc.end();
  } catch (err) {
    console.error('ERRO AO GERAR PDF DE OS EM ANDAMENTO:');
    console.error(err);
    res.status(500).send('Erro ao gerar PDF de OS em andamento.');
  }
});

router.get('/api/os/relatorio-pdf', authPdf, requireModuleAccessPdf('os'), requireManagerPdf, async (req, res) => {
  try {
    const itens = await all(`
      SELECT o.*, u.nome AS responsavel_nome
      FROM ordens_servico o
      LEFT JOIN usuarios u ON u.id = o.responsavel_principal_id
      ORDER BY
        CASE prioridade
          WHEN 'Urgente' THEN 1
          WHEN 'Alta' THEN 2
          WHEN 'Média' THEN 3
          WHEN 'Baixa' THEN 4
          ELSE 5
        END,
        criado_em DESC
      LIMIT 200
    `);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="ordens-servico-operacional.pdf"');

    const doc = new PDFDocument({ size: 'A4', margin: 28, bufferPages: true });
    doc.pipe(res);

    function texto(valor) {
      return valor && String(valor).trim() ? String(valor).trim() : '-';
    }

    function tempo(min) {
      const n = Number(min || 0);
      if (!n) return '-';
      if (n < 60) return `${n} min`;
      const h = Math.floor(n / 60);
      const m = n % 60;
      return m ? `${h}h ${m}min` : `${h}h`;
    }

    function pageBreakIfNeeded(height = 210) {
      if (doc.y + height > 770) doc.addPage();
    }

    function sectionTitle(title, x, y, width) {
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#0b2f6b')
        .text(title, x, y, { width });
    }

    function line(label, value, x, y, width) {
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor('#475569')
        .text(`${label}: `, x, y, { continued: true });

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#0f172a')
        .text(texto(value), { width });
    }

    function boxText(title, value, x, y, width, height) {
      doc
        .roundedRect(x, y, width, height, 8)
        .strokeColor('#dbeafe')
        .lineWidth(1)
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor('#0b2f6b')
        .text(title, x + 8, y + 7, { width: width - 16 });

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#334155')
        .text(texto(value), x + 8, y + 21, {
          width: width - 16,
          height: height - 28,
          ellipsis: true,
          lineGap: 2
        });
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#0b2f6b')
      .text('Ordens de Serviço Operacionais', { align: 'center' });

    doc.moveDown(0.4);

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748b')
      .text(`Gerado em ${brDateTime(new Date())} • ${req.user.nome}`, { align: 'center' });

    doc.moveDown(1.3);

    itens.forEach((o) => {
      pageBreakIfNeeded(260);

      const startY = doc.y;
      const leftX = 46;
      const rightX = 300;
      const leftW = 220;
      const rightW = 260;

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#0f172a')
        .text(`${o.numero || `OS-${o.id}`} - ${texto(o.titulo)}`, leftX, startY, {
          width: 520
        });

      let yLeft = startY + 22;
      let yRight = startY + 22;

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor('#0b2f6b')
        .text(`STATUS: ${texto(o.status)}     |     PRIORIDADE: ${texto(o.prioridade)}`, leftX, yLeft, {
          width: leftW
        });

      yLeft += 20;

      sectionTitle('DADOS GERAIS', leftX, yLeft, leftW);
      yLeft += 14;

      line('Local/Setor', o.setor_local, leftX, yLeft, leftW);
      yLeft += 13;
      line('Categoria', o.categoria, leftX, yLeft, leftW);
      yLeft += 13;
      line('Solicitante', o.solicitante, leftX, yLeft, leftW);
      yLeft += 18;

      sectionTitle('RESPONSÁVEIS E EQUIPE', leftX, yLeft, leftW);
      yLeft += 14;

      line('Responsável', o.responsavel_nome || o.responsavel_principal, leftX, yLeft, leftW);
      yLeft += 13;
      line('Funcionários', o.funcionarios, leftX, yLeft, leftW);
      yLeft += 13;
      line('Mão de obra', o.quantidade_mao_obra || 1, leftX, yLeft, leftW);
      yLeft += 18;

      sectionTitle('PRAZOS E TEMPOS', leftX, yLeft, leftW);
      yLeft += 14;

      line('Tempo estimado', tempo(o.tempo_estimado_min), leftX, yLeft, leftW);
      yLeft += 13;
      line('Tempo real', tempo(o.tempo_real_min), leftX, yLeft, leftW);
      yLeft += 13;
      line('Previsão', o.previsao_conclusao ? brDateTime(o.previsao_conclusao) : '-', leftX, yLeft, leftW);
      yLeft += 18;

      line('Criada em', brDateTime(o.criado_em), leftX, yLeft, leftW);
      yLeft += 13;
      line('Atualizada em', brDateTime(o.atualizado_em), leftX, yLeft, leftW);

      boxText(
        'DESCRIÇÃO DO SERVIÇO',
        o.descricao,
        rightX,
        yRight,
        rightW,
        180
      );

      yRight += 188;

      doc.y = Math.max(yLeft, yRight) + 16;

      doc
        .moveTo(46, doc.y)
        .lineTo(560, doc.y)
        .strokeColor('#dbeafe')
        .lineWidth(1)
        .stroke();

      doc.moveDown(1.2);
    });

    drawFooterPages(doc, 'Relatório operacional de ordens de serviço.');
    doc.end();

  } catch (err) {
    console.error('ERRO AO GERAR PDF DE OS:');
    console.error(err);
    res.status(500).send('Erro ao gerar PDF de OS.');
  }
});




// =========================
// Portal público protegido - Solicitação de OS
// =========================
router.post('/api/public/os/validar-senha', async (req, res) => {
  try {
    const { senha } = req.body || {};

    if (!checkPortalPassword(senha)) {
      return res.status(401).json({ error: 'Senha de acesso inválida.' });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao validar acesso.', details: err.message });
  }
});
router.post('/api/public/os', async (req, res) => {
  try {
    const {
      senha_portal,
      solicitante,
      setor_local,
      local_exato,
      categoria,
      titulo,
      descricao,
      impacto
    } = req.body || {};

    if (!checkPortalPassword(senha_portal)) {
      return res.status(401).json({
        error: 'Senha de acesso inválida.'
      });
    }

    if (!titulo || !String(titulo).trim()) {
      return res.status(400).json({
        error: 'Informe o título do problema.'
      });
    }

    if (!descricao || !String(descricao).trim()) {
      return res.status(400).json({
        error: 'Descreva o que está acontecendo.'
      });
    }

    const numero = await generateOsNumber();

    /*
      A partir desta versão, cada informação passa
      a ser salva em seu próprio campo.
    */
    const descricaoFinal = String(descricao || '').trim();
    const localExatoFinal = String(local_exato || '').trim();
    const impactoFinal = String(impacto || '').trim();

    const prioridadeInicial = impactoFinal
      .toLowerCase()
      .includes('sim')
      ? 'Alta'
      : 'Média';

    const os = await get(
      `
        INSERT INTO ordens_servico (
          numero,
          titulo,
          descricao,
          local_exato,
          solicitante,
          setor_local,
          categoria,
          prioridade,
          impacto,
          status,
          responsavel_principal,
          funcionarios,
          quantidade_mao_obra,
          tempo_estimado_min,
          tempo_real_min,
          previsao_conclusao,
          data_inicio,
          data_conclusao,
          material_necessario,
          material_utilizado,
          pendencias,
          execucao,
          observacao_conclusao,
          criado_por
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24
        )
        RETURNING *
      `,
      [
        numero,
        String(titulo).trim(),
        descricaoFinal,
        localExatoFinal,
        String(solicitante || '').trim(),
        String(setor_local || '').trim(),
        categoria || 'Outros',
        prioridadeInicial,
        impactoFinal,
        'Recebido',
        '',
        '',
        1,
        0,
        0,
        null,
        null,
        null,
        '',
        '',
        '',
        '',
        '',
        null
      ]
    );

    return res.status(201).json({
      ok: true,
      numero: os.numero,
      os
    });
  } catch (err) {
    console.error('ERRO AO CRIAR OS PELO PORTAL:');
    console.error(err);

    return res.status(500).json({
      error: 'Erro ao enviar solicitação.',
      details: err.message
    });
  }
});


module.exports=router;
