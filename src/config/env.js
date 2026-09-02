module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev_secret',
  osPortalPassword: process.env.OS_PORTAL_PASSWORD || 'manairaos'
};
