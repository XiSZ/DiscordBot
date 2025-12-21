# Discord Active Developer Badge Auto-Maintenance Bot

This bot automatically helps you maintain your Discord Active Developer Badge eligibility.

## Features

- 🤖 Automatic slash command registration
- 📊 Auto-executes commands every 30 days to ensure active developer status
- ⚡ Simple and easy setup process
- 🔄 Automatic reconnection mechanism
- 💬 Works in servers, DMs, and group DMs
- 👤 **User App Support** - Install once, use anywhere (servers, DMs, group DMs)
- 🌐 **Auto-Translation** - Automatically translate messages in configured channels (100+ languages)
- 🆓 **Free Translation** - Powered by Google Translate, no API key required

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

### 2. Enable User App Installation (Optional but Recommended)

To allow the bot to work in DMs and group DMs as a User App:

1. In Developer Portal, go to "Installation" on the left sidebar
2. Under "Installation Contexts", enable:
   - ✅ **Guild Install** (for server installation)
   - ✅ **User Install** (for DM and group DM usage)
3. Set default install settings for both contexts
4. Save changes

### 3. Invite Bot to Server (or Install as User App)

**Option A: Add to Server (Traditional)**

1. In Developer Portal, select "OAuth2" > "URL Generator"
2. Check the following permissions:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Use Slash Commands`, `Manage Messages` (for purge command)
3. Copy the generated URL and open it in your browser
4. Select the server to add the bot to

**Option B: Install as User App (Recommended)**

1. Use the same OAuth2 URL but select "Install to User" option when prompted
2. This allows you to use the bot in:
   - Any server where you have permission
   - Direct messages with the bot
   - Group DMs
   - Private channels

### 4. Setup Project

```bash
# Install dependencies (this will automatically create .env and invite-bot.html files)
npm install
```

**Note**: The `npm install` command will automatically:

- ✅ Create `.env` file from `.env.example` (if it doesn't exist)
- ✅ Create `invite-bot.html` from `invite-bot.html.template` (if it doesn't exist)

### 5. Configure Environment Variables

Edit the `.env` file and fill in the following information:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id
COMMAND_PREFIX=!
```

**How to get these IDs:**

- **DISCORD_TOKEN**: "Reset Token" button on the Bot page
- **CLIENT_ID**: "APPLICATION ID" on the General Information page
- **GUILD_ID**: Right-click server icon in Discord → "Copy Server ID" (Developer Mode must be enabled in settings)
- **COMMAND_PREFIX** (optional): Custom prefix for prefix-based commands (default: `!`)
  - Can be any character or string (e.g., `.` or `>` or `$` or `cmd`)
  - Requires restarting the bot for changes to take effect

### 6. Register Slash Commands

```bash
npm run register
```

### 7. Start the Bot

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
6. ✅ You can also manually test by typing `/ping` in Discord or DMs

### Using Commands in DMs and User Apps

This bot supports Discord's **User App** feature, allowing you to use it in multiple contexts:

- 🏢 **Servers** - Traditional bot usage in Discord servers
- 💬 **Direct Messages** - Use commands in DMs with the bot
- 👥 **Group DMs** - Use commands in group conversations
- 🔒 **Private Channels** - Works in private channels too

**How to Use as a User App:**

1. Install the bot as a User App (see installation instructions above)
2. The bot's commands will appear in:
   - Any server where the bot is installed
   - Your DMs with the bot
   - Any group DM you're in
3. Simply type `/` to see available commands in any context

**DM-Compatible Commands (marked with 💬 in `/help`):**

- All fun commands (`/8ball`, `/dice`, `/flip`, `/joke`, `/quote`)
- Info commands (`/ping`, `/uptime`, `/status`, `/botinfo`, `/stats`, `/userinfo`)
- Utility commands (`/avatar`, `/echo`, `/notify`, `/ping-user`, `/remind`, `/invite`)
- Help command (`/help`)

**Server-Only Commands:**

- All moderation commands (kick, ban, mute, warn, etc.)
- Channel/role management commands
- Server configuration commands (tracking, settings, etc.)
- Guild-specific features (serverinfo, logs, etc.)

**Note**: When used as a User App in group DMs, server-only commands will show an error message indicating they require a server context.

### Dynamic Setup Guide

The setup guide (`invite-bot.html`) is automatically generated from your `.env` file:

- ✅ **Automatic Generation**: Every time you run `npm start`, the guide is regenerated with your current environment variables
- ✅ **Opens in Browser**: The guide automatically opens in your default browser on startup
- 🔒 **Local Only**: The generated HTML file is not tracked by git (listed in `.gitignore`)

**Note**: The `invite-bot.html.template` file is provided as a reference. The actual `invite-bot.html` will be created automatically with your specific configuration when you run `npm start`.

## Command List

### Badge & Information Commands

- `/ping` - Check bot latency and maintain Active Developer status
- `/uptime` - Check how long the bot has been running
- `/status` - View next auto-execution date for your Active Developer badge
- `/serverinfo` - Display detailed information about the server (members, channels, roles, creation date, etc.)
- `/userinfo [user]` - Get information about a user (account creation, join date, roles, etc.)
- `/stats` - View bot performance statistics (uptime, memory usage, server count, API latency)
- `/help` - Display all available commands

### Moderation Commands

- `/kick <user> [reason]` - Kick a user from the server
  - `user` (required): User to kick
  - `reason` (optional): Reason for the kick
  - **Permissions Required**: Kick Members
- `/ban <user> [reason]` - Ban a user from the server
  - `user` (required): User to ban
  - `reason` (optional): Reason for the ban
  - **Permissions Required**: Ban Members
- `/mute <user> <minutes> [reason]` - Mute/timeout a user temporarily
  - `user` (required): User to mute
  - `minutes` (required): Duration in minutes (1-40320)
  - `reason` (optional): Reason for the mute
  - **Permissions Required**: Moderate Members
- `/unmute <user>` - Unmute a user
  - `user` (required): User to unmute
  - **Permissions Required**: Moderate Members
- `/warn <user> [reason]` - Issue a warning to a user
  - `user` (required): User to warn
  - `reason` (optional): Reason for the warning
  - **Permissions Required**: Moderate Members

### Channel Management Commands

- `/lock` - Lock the current channel (prevent members from sending messages)
  - **Permissions Required**: Manage Channels
- `/unlock` - Unlock the current channel
  - **Permissions Required**: Manage Channels
- `/slowmode <seconds>` - Set channel slowmode delay
  - `seconds` (required): Delay in seconds between messages (0-21600, set to 0 to disable)
  - **Permissions Required**: Manage Channels
- `/purge [amount]` - Delete messages in bulk from the channel
  - `amount` (optional): Number of messages to delete (1-1000). If not specified, deletes all fetchable messages
  - **Note**: Only messages newer than 14 days can be bulk deleted due to Discord API limitations
  - **Permissions Required**: Manage Messages

### Utility Commands

- `/say <message> [channel]` - Send a message as the bot
  - `message` (required): Message content to send
  - `channel` (optional): Channel to send to (defaults to current channel)
  - **Permissions Required**: Manage Messages
- `/poll <question> <option1> <option2> [option3-5]` - Create a poll with reactions
  - `question` (required): The poll question
  - `option1` (required): First poll option
  - `option2` (required): Second poll option
  - `option3-5` (optional): Additional options (up to 5 total)
  - **Note**: React with the numbered emojis (1️⃣-5️⃣) to vote
- `/remind <minutes> <reminder>` - Set a reminder that will be sent via DM
  - `minutes` (required): Time in minutes until reminder (1-10080 / ~7 days)
  - `reminder` (required): What you want to be reminded about
  - **Note**: Reminder is sent via DM after the specified time
- `/invite` - Get the bot invite link to add it to other servers
  - Shows a generated invite URL with all necessary permissions

### Translation Commands

- `/translate <text> [to] [from]` - Manually translate text to another language
  - `text` (required): Text to translate
  - `to` (optional): Target language code (default: en)
  - `from` (optional): Source language code (auto-detect if not specified)
  - **Common language codes**: en (English), es (Spanish), de (German), fr (French), it (Italian), ja (Japanese), ko (Korean), zh-CN (Chinese), pt (Portuguese), ru (Russian)
  - **Powered by**: Google Translate (free, no API key needed)
  - **Works in**: Servers, DMs, and Group DMs 💬
- `/translate-setup <channel> [target-language]` - Enable auto-translation for a specific channel
  - `channel` (required): Channel to enable auto-translation in
  - `target-language` (optional): Target language code (default: en)
  - **How it works**: Bot will automatically detect and translate non-English messages in the configured channel
  - **Permissions Required**: Manage Server
- `/translate-config <display-mode> [default-language]` - Configure how translations are displayed
  - `display-mode` (required): Choose how translations appear
    - `reply` - Reply to the original message with translation
    - `embed` - Send translation in a formatted embed
    - `thread` - Create a thread for the translation
  - `default-language` (optional): Set the default target language for all translations
  - **Permissions Required**: Manage Server
- `/translate-disable <channel>` - Disable auto-translation for a channel
  - `channel` (required): Channel to disable auto-translation in
  - **Permissions Required**: Manage Server
- `/translate-list` - View all channels with auto-translation enabled
  - Shows current translation settings (display mode, target language)
  - Lists all enabled channels
  - **Permissions Required**: Manage Server

**Translation Features:**

- 🌐 **Auto-Translation**: Automatically detects and translates non-English messages in configured channels
- 🎨 **Customizable Display**: Choose between reply, embed, or thread format
- 🔧 **Per-Channel Configuration**: Enable translation only in specific channels
- 💬 **Manual Translation**: Use `/translate` anywhere (servers, DMs, group DMs)
- 🆓 **Free Service**: Powered by Google Translate with no API key required
- 🗣️ **100+ Languages**: Supports all major languages

### Logging & Monitoring Commands

- `/logs [lines]` - View recent server audit logs
  - `lines` (optional): Number of logs to display (1-50, default: 10)
  - Shows recent actions like kicks, bans, role changes, etc.
  - **Permissions Required**: Manage Server
- `/config view` - View current bot configuration and settings
  - Displays guild-specific settings and next auto-execution date
  - **Permissions Required**: Manage Server
- `/backup` - View server backup information
  - Shows data about members, channels, and roles for reference
  - **Note**: For full server backups, use dedicated backup bots
  - **Permissions Required**: Manage Server
- `/banlist` - View list of banned users in the server
  - Shows all currently banned users with ban reasons
  - **Permissions Required**: Ban Members
- `/clear-warnings <user>` - Clear warnings for a user
  - `user` (required): User to clear warnings for
  - **Note**: This is informational only. For persistent warning tracking, use a dedicated warning bot
  - **Permissions Required**: Administrator

### Information & User Commands

- `/avatar [user]` - View a user's profile avatar
  - `user` (optional): User to view (defaults to yourself)
- `/roleinfo <role>` - Get detailed information about a role
  - `role` (required): Role to get info about
  - Shows: name, ID, color, creation date, member count, position, permissions
- `/channelinfo [channel]` - Get detailed information about a channel
  - `channel` (optional): Channel to get info about (defaults to current)
  - Shows: name, type, ID, creation date, topic (for text channels)
- `/uptime-ranking` - View bot 30-day uptime percentage and rating
  - Shows current uptime and star rating (⭐ Fair, ⭐⭐ Good, ⭐⭐⭐ Excellent)
- `/echo <text>` - Echo back text (fun command)
  - `text` (required): Text to echo
- `/notify <user> <message>` - Send a DM notification to a user
  - `user` (required): User to notify
  - `message` (required): Message to send via DM
  - **Note**: User must have DMs enabled for the notification to be sent

## Prefix Commands

In addition to slash commands (`/`), the bot supports prefix-based commands. The default prefix is `!` but can be customized via the `COMMAND_PREFIX` environment variable.

### Available Prefix Commands

- `!help` - Display help message with all available commands
- `!ping` - Quick ping response with latency information
- `!uptime` - Show current bot uptime
- `!prefix` - Display the current command prefix and instructions on how to change it

**Example Usage:**

```text
!ping
!help
!uptime
!prefix
```

### Changing the Command Prefix

To change the prefix from `!` to something else (e.g., `.` or `>`):

1. Edit your `.env` file:

   ```env
   COMMAND_PREFIX=.
   ```

2. Save the file
3. Restart the bot
4. The new prefix will take effect immediately

**Note:** Each user can use different prefixes on different servers if they have separate bot instances, but within a single bot instance, the prefix is global.

## Bot Features

### ✅ Command Visibility & Responses

- All command invocations are **ephemeral** (hidden from other users)
- **Checkmark (✅) indicators** appear in all successful command responses
- Failed commands show **error (❌) indicators**
- Clean, organized response formatting with visual separators

### 🔄 Auto-Execution Scheduling

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
4. **Configure Volume for Persistent Data** (required for Twitch notifications):
   - Press `Ctrl+K` (or `⌘K` on Mac) to open Command Palette
   - Type "volume" and select **"Create Volume"**
   - Choose your bot service
   - Set mount path to: `/data`
   - Railway will auto-redeploy with the volume attached

**Note**: The volume ensures Twitch streamer notifications persist across deployments. Without it, the bot will work but Twitch configuration will be lost on each redeploy. See [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) for detailed instructions.

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
