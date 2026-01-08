module.exports = {
  apps: [
    {
      name: "discordbot",
      script: "src/index.js",
      watch: true, // Disable watch on serv00 to reduce resource usage
      ignore_watch: [
        "logs",
        "node_modules",
        ".git",
        "data",
        "sessions",
        "invite-bot.html",
      ],
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M", // Restart if memory exceeds 500MB
      env: {
        NODE_ENV: "production",
        DISABLE_CONTROL_API: "true", // Disable control API when running bot-only
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      time: true, // Prefix logs with timestamp
    },
  ],
};
