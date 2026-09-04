require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const { query, get, pool } = require('./db');

async function initDb() {
  // Cria/atualiza as tabelas do banco de dados
  const schema = fs.readFileSync(
    path.join(__dirname, '..', 'schema.sql'),
    'utf8'
  );

  await query(schema);

  // Permite definir explicitamente o Administrador Principal sem editar o banco.
  // Use ADMIN_PRINCIPAL_EMAIL no .env/Render ou execute o script npm run definir-admin-principal.
  const principalEmail = String(process.env.ADMIN_PRINCIPAL_EMAIL || '').trim().toLowerCase();
  if (principalEmail) {
    const principal = await get('SELECT id FROM usuarios WHERE LOWER(email) = $1 AND ativo = TRUE', [principalEmail]);
    if (!principal) {
      throw new Error(`ADMIN_PRINCIPAL_EMAIL não corresponde a um usuário ativo: ${principalEmail}`);
    }
    await query('UPDATE usuarios SET administrador_principal = FALSE WHERE id <> $1', [principal.id]);
    await query(`UPDATE usuarios SET administrador_principal = TRUE, perfil = 'administrador_principal' WHERE id = $1`, [principal.id]);
    await query(`UPDATE usuarios SET perfil = 'administrador' WHERE id <> $1 AND perfil = 'administrador_principal'`, [principal.id]);
    await query('UPDATE setores SET proprietario_id = $1 WHERE proprietario_id IS NULL', [principal.id]);
    console.log(`Administrador Principal confirmado: ${principalEmail}`);
  }

  // Verifica se já existe algum usuário administrativo
  const userCount = await get(
    'SELECT COUNT(*)::int AS total FROM usuarios'
  );

  // Cria o administrador padrão somente se não existir nenhum usuário
  if (!userCount || userCount.total === 0) {
    const senhaHash = await bcrypt.hash('admin123', 10);

    await query(
      `
        INSERT INTO usuarios (
          nome,
          email,
          senha_hash,
          perfil
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        'Administrador',
        'admin@manaira.com',
        senhaHash,
        'administrador_principal'
      ]
    );

    await query(`UPDATE usuarios SET administrador_principal = TRUE WHERE email = $1`, ['admin@manaira.com']);

    console.log('Usuário administrador principal inicial criado.');
  }

  const principalAtual = await get(`SELECT id FROM usuarios WHERE administrador_principal = TRUE AND ativo = TRUE ORDER BY id LIMIT 1`);
  if (!principalAtual) {
    const candidato = await get(`
      SELECT id FROM usuarios
      WHERE ativo = TRUE
      ORDER BY CASE WHEN perfil IN ('administrador_principal','administrador','admin') THEN 0 ELSE 1 END,
               criado_em ASC, id ASC
      LIMIT 1
    `);
    if (candidato) {
      await query('UPDATE usuarios SET administrador_principal = FALSE');
      await query(`UPDATE usuarios SET administrador_principal = TRUE, perfil = 'administrador_principal' WHERE id = $1`, [candidato.id]);
      await query('UPDATE setores SET proprietario_id = $1 WHERE proprietario_id IS NULL', [candidato.id]);
    }
  }



  // V15: catálogo de módulos e migração segura dos acessos existentes.
  await query(`
    INSERT INTO modulos (codigo, nome, descricao, ordem, ativo) VALUES
      ('atividades', 'Atividades', 'Dashboard, setores, grupos e tarefas.', 10, TRUE),
      ('os', 'Ordem de Serviço', 'Gestão operacional das ordens de serviço.', 20, TRUE),
      ('administracao', 'Administração', 'Usuários, hierarquia, setores e acessos.', 30, TRUE),
      ('almoxarifado', 'Almoxarifado', 'Estoque, entradas, saídas e histórico de materiais.', 40, TRUE),
      ('galpao', 'Galpão', 'Produtos, estoque por validade, entradas, saídas e histórico.', 50, TRUE),
      ('rh', 'RH', 'Chamados, pedidos e futuras rotinas de Recursos Humanos.', 60, TRUE)
    ON CONFLICT (codigo) DO UPDATE SET
      nome = EXCLUDED.nome,
      descricao = EXCLUDED.descricao,
      ordem = EXCLUDED.ordem,
      ativo = TRUE
  `);

  // Só aplica padrão a usuários que ainda não possuem nenhuma configuração de módulo.
  // Assim, uma permissão removida manualmente não volta após reiniciar o servidor.
  await query(`
    INSERT INTO usuario_modulos (usuario_id, modulo_id)
    SELECT u.id, m.id
    FROM usuarios u
    JOIN modulos m ON (
      m.codigo = 'atividades'
      OR (m.codigo IN ('os','administracao') AND u.perfil IN ('administrador_principal','administrador','gerente','encarregado'))
    )
    WHERE NOT EXISTS (SELECT 1 FROM usuario_modulos x WHERE x.usuario_id = u.id)
    ON CONFLICT DO NOTHING
  `);


  // V17: tipos iniciais de solicitações do RH. O RH pode editar/inativar depois.
  await query(`
    INSERT INTO rh_tipos_solicitacao (nome, descricao, ordem, ativo) VALUES
      ('2ª via de contracheque', 'Solicitação de segunda via de contracheque.', 10, TRUE),
      ('Informe de rendimentos', 'Solicitação relacionada ao informe de rendimentos.', 20, TRUE),
      ('Declaração de vínculo', 'Declaração ou comprovante de vínculo empregatício.', 30, TRUE),
      ('Atualização de dados cadastrais', 'Alteração de dados pessoais ou cadastrais.', 40, TRUE),
      ('Alteração de conta bancária', 'Atualização dos dados bancários para pagamento.', 50, TRUE),
      ('Férias', 'Dúvidas e solicitações relacionadas a férias.', 60, TRUE),
      ('Benefícios', 'Solicitações relacionadas a benefícios.', 70, TRUE),
      ('Vale-transporte', 'Solicitações relacionadas ao vale-transporte.', 80, TRUE),
      ('Plano de saúde', 'Solicitações relacionadas ao plano de saúde.', 90, TRUE),
      ('Dúvidas sobre pagamento', 'Dúvidas sobre folha ou pagamento.', 100, TRUE),
      ('Correção de ponto', 'Solicitação relacionada a divergências de ponto.', 110, TRUE),
      ('Atestado / documento', 'Entrega, registro ou dúvida sobre atestado/documento.', 120, TRUE),
      ('Outros', 'Outras solicitações ao RH.', 999, TRUE)
    ON CONFLICT (nome) DO NOTHING
  `);

  console.log('Banco de dados inicializado com sucesso.');
}

if (require.main === module) {
  initDb()
    .then(async () => {
      console.log('Inicialização concluída.');
      await pool.end();
    })
    .catch(async (err) => {
      console.error('Erro ao inicializar banco:', err);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { initDb };