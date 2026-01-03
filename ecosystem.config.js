module.exports = {
  apps: [{
    name: "discordbot",
    script: "src/index.js",
    watch: true,
    ignore_watch: ["logs", "node_modules", ".git"],
    env: {
      NODE_ENV: "production"
    }
  }]
};
