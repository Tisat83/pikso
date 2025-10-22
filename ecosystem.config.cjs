/** PM2 ecosystem config for Pikso (Node.js + Express + Socket.IO) */
module.exports = {
  apps: [
    {
      name: 'pikso',
      script: 'server.cjs',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
        // PORT и MOD_PASSWORD берутся из окружения сервера (export или через процесс-менеджер)
      },
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      time: true
    }
  ]
};
