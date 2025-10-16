# Discord Active Developer Badge Auto-Maintenance Bot

This bot automatically helps you maintain your Discord Active Developer Badge eligibility.

## Features

- 🤖 Automatic slash command registration
- 📊 Auto-executes commands every 30 days to ensure active developer status
- ⚡ Simple and easy setup process
- 🔄 Automatic reconnection mechanism

## Why do you need this bot?

Discord requires developers to use at least one slash command within the past 60 days, or they will be removed from the Active Developer program. This bot automatically executes commands periodically to ensure your application stays active.

## Installation Steps

### 0. Clone the Repository

```bash
# Clone the repository
git clone https://github.com/HenryLok0/Auto-Discord-Developer-Badge.git

# Navigate to the project directory
cd Auto-Discord-Developer-Badge
```

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" to create a new application
3. Select "Bot" from the left sidebar
4. Click "Reset Token" and copy your bot token (keep it secret!)
5. Enable the following Privileged Gateway Intents:
   - MESSAGE CONTENT INTENT
   - GUILD MESSAGES

### 2. Invite Bot to Server

1. In Developer Portal, select "OAuth2" > "URL Generator"
2. Check the following permissions:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Use Slash Commands`
3. Copy the generated URL and open it in your browser
4. Select the server to add the bot to

### 3. Setup Project

```bash
# Install dependencies (this will automatically create .env and invite-bot.html files)
npm install
```

**Note**: The `npm install` command will automatically:
- ✅ Create `.env` file from `.env.example` (if it doesn't exist)
- ✅ Create `invite-bot.html` from `invite-bot.html.template` (if it doesn't exist)

### 4. Configure Environment Variables

Edit the `.env` file and fill in the following information:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id
```

**How to get these IDs:**
- **DISCORD_TOKEN**: "Reset Token" button on the Bot page
- **CLIENT_ID**: "APPLICATION ID" on the General Information page
- **GUILD_ID**: Right-click server icon in Discord → "Copy Server ID" (Developer Mode must be enabled in settings)

### 5. Register Slash Commands

```bash
npm run register
```

### 6. Start the Bot

```bash
npm start
```

## Usage

After starting the bot, it will:

1. ✅ Automatically generate setup guide with your environment variables
2. ✅ Open setup guide in your default browser
3. ✅ Automatically connect to Discord
4. ✅ Register the `/ping` command
5. ✅ Auto-execute commands every 30 days to keep the application active
6. ✅ You can also manually test by typing `/ping` in Discord

### Dynamic Setup Guide

The setup guide (`invite-bot.html`) is automatically generated from your `.env` file:

- ✅ **Automatic Generation**: Every time you run `npm start`, the guide is regenerated with your current environment variables
- ✅ **Opens in Browser**: The guide automatically opens in your default browser on startup
- 🔒 **Local Only**: The generated HTML file is not tracked by git (listed in `.gitignore`)

**Note**: The `invite-bot.html.template` file is provided as a reference. The actual `invite-bot.html` will be created automatically with your specific configuration when you run `npm start`.

## Command List

- `/ping` - Check if the bot is working properly and maintain Active Developer status

## Automated Scheduling

The bot has built-in automated scheduling:
- Automatically executes a slash command every 30 days
- Ensures active status within the 60-day requirement
- No manual intervention required

## Deploy to Cloud (Recommended)

To ensure the bot runs 24/7, it's recommended to deploy to a cloud platform:

### Option 1: Heroku
1. Sign up for a [Heroku](https://heroku.com) account
2. Install Heroku CLI
3. Run:
```bash
heroku create
heroku config:set DISCORD_TOKEN=your_token CLIENT_ID=your_id GUILD_ID=your_guild_id
git push heroku main
```

### Option 2: Railway
1. Sign up for a [Railway](https://railway.app) account
2. Connect your GitHub repository
3. Set environment variables: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`

### Option 3: Render
1. Sign up for a [Render](https://render.com) account
2. Create a new Web Service
3. Connect your GitHub repository
4. Set environment variables

## Troubleshooting

### Bot Cannot Connect
- Check if `DISCORD_TOKEN` is correct
- Confirm the bot has been added to the server

### Slash Commands Not Working
- Run `npm run register` to register commands
- Wait 1-5 minutes for Discord to update commands
- Check if the bot has `applications.commands` permission

### Commands Not Auto-Executing
- Ensure the bot is running continuously (recommend deploying to cloud)
- Check log output for error messages

## Getting Active Developer Badge

1. Start the bot and let it run
2. Wait for auto-execution (or manually run `/ping`)
3. Go to [Discord Active Developer Page](https://discord.com/developers/active-developer)
4. Click "Claim Badge" to claim your badge

**Note**: Badge application may take up to 24 hours to process.

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Support

If you have questions or need help, please open an issue on GitHub.

Thank you to all contributors and the open-source community for your support.
