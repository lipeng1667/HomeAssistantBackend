module.exports = {
  apps: [
    {
      name: 'home-assistant-backend',
      script: 'server.js',
      exec_mode: 'cluster',
      instances: 'max', // Or set a specific number, e.g., 2
      watch: false,     // Change to true if you want auto-restart on file change (usually false in production)
      env: {
        PORT: 10000,
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};