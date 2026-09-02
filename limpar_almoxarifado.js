require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('render.com')
        ? { rejectUnauthorized: false }
        : false
});

async function limparAlmoxarifado() {
    const client = await pool.connect();

    try {
        console.log('🧹 Iniciando limpeza do Almoxarifado...');

        await client.query('BEGIN');

        // Primeiro apaga as movimentações
        const movimentacoes = await client.query(
            'DELETE FROM almox_movimentacoes'
        );

        // Depois apaga os itens
        const itens = await client.query(
            'DELETE FROM almox_itens'
        );

        await client.query('COMMIT');

        console.log('');
        console.log('✅ Limpeza concluída!');
        console.log(`📋 Movimentações apagadas: ${movimentacoes.rowCount}`);
        console.log(`📦 Itens apagados: ${itens.rowCount}`);
        console.log('');
        console.log('Almoxarifado pronto para uso.');

    } catch (erro) {
        await client.query('ROLLBACK');

        console.error('');
        console.error('❌ Erro ao limpar Almoxarifado:');
        console.error(erro);

    } finally {
        client.release();
        await pool.end();
    }
}

limparAlmoxarifado();
