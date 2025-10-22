/** PM2 ecosystem config for Pikso (Node.js + Express + Socket.IO)
 * Production binds to PORT=3101 to avoid conflict with 3000 in use by docker-proxy.
 */
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
        NODE_ENV: 'production',
        PORT: 3101
        // MOD_PASSWORD берётся из окружения, если используется
      },
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      time: true
    }
  ]
};
