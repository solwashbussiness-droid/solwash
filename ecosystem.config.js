module.exports = {
  apps: [
    {
      name: 'solwash-backend',
      cwd: './backend',
      script: 'src/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      autorestart: true,
      restart_delay: 2000,
      max_memory_restart: '800M',
      exp_backoff_restart_delay: 100
    },
    {
      name: 'solwash-admin',
      cwd: './admin',
      script: 'serve.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      autorestart: true,
      restart_delay: 2000
    },
    {
      name: 'solwash-frontend',
      cwd: './frontend/web_preview',
      script: 'serve.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      autorestart: true,
      restart_delay: 2000
    }
  ]
};
