module.exports = {
  apps: [{
    name: 'ngr-bot',
    script: 'server.js',
    cwd: '/home/olly3dp/Área de trabalho/R.DIARIO /SAAS/NGR BOT /AgenteIAChatbot_PrimeiraVez',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/pm2/ngr-bot-error.log',
    out_file: '/var/log/pm2/ngr-bot-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    listen_timeout: 8000,
    kill_timeout: 5000
  }]
};