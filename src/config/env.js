module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev_secret',
  osPortalPassword: process.env.OS_PORTAL_PASSWORD || 'manairaos',
  gzApiBase: process.env.GZ_API_BASE || 'http://10.111.155.113:8083',
  gzApiToken: process.env.GZ_API_TOKEN || '',
  gzLoja: process.env.GZ_LOJA || '1'
};
