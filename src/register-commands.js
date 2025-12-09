import { REST, Routes, SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const commands = [
  // Ping command to check latency and maintain Active Developer status
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency and maintain Active Developer status")
    .toJSON(),
  // Uptime command to check bot uptime
  new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Check how long the bot has been running")
    .toJSON(),
  // Status command - Show Active Developer Badge status
  new SlashCommandBuilder()
    .setName("status")
    .setDescription(
      "View next auto-execution date for your Active Developer badge"
    )
    .toJSON(),
  // Help command
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Display all available commands")
    .toJSON(),
  // Server info command
  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Display information about this server")
    .toJSON(),
  // User info command
  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Get information about a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to get info about (defaults to you)")
        .setRequired(false)
    )
    .toJSON(),
  // Stats command
  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View bot performance statistics")
    .toJSON(),
  // Purge command to delete messages in bulk
  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete all messages in the channel")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription(
          "Number of messages to delete (1-1000, default: all fetchable)"
        )
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(false)
    )
    .toJSON(),
  // Lock command
  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock the current channel (prevent messages)")
    .toJSON(),
  // Unlock command
  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock the current channel")
    .toJSON(),
  // Slowmode command
  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode delay")
    .addIntegerOption((option) =>
      option
        .setName("seconds")
        .setDescription("Slowmode delay in seconds (0 to disable)")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    )
    .toJSON(),
  // Kick command
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from the server")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to kick").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for kick")
        .setRequired(false)
    )
    .toJSON(),
  // Ban command
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to ban").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for ban")
        .setRequired(false)
    )
    .toJSON(),
  // Mute command
  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a user for a specified duration")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to mute").setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("minutes")
        .setDescription("Duration in minutes (1-40320)")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for mute")
        .setRequired(false)
    )
    .toJSON(),
  // Unmute command
  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Unmute a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to unmute").setRequired(true)
    )
    .toJSON(),
  // Warn command
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to warn").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for warning")
        .setRequired(false)
    )
    .toJSON(),
  // Say command
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send a message as the bot")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Message to send")
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to send message to (defaults to current)")
        .setRequired(false)
    )
    .toJSON(),
  // Poll command
  new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll with options")
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("Poll question")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("option1").setDescription("First option").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("option2")
        .setDescription("Second option")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("option3")
        .setDescription("Third option")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("option4")
        .setDescription("Fourth option")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("option5")
        .setDescription("Fifth option")
        .setRequired(false)
    )
    .toJSON(),
  // Remind command
  new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Set a reminder (DM sent after specified time)")
    .addIntegerOption((option) =>
      option
        .setName("minutes")
        .setDescription("Minutes until reminder (1-10080)")
        .setMinValue(1)
        .setMaxValue(10080)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reminder")
        .setDescription("What to remind you about")
        .setRequired(true)
    )
    .toJSON(),
  // Invite command
  new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Get the bot invite link")
    .toJSON(),
  // Logs command
  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("View recent server audit logs")
    .addIntegerOption((option) =>
      option
        .setName("lines")
        .setDescription("Number of logs to show (1-50, default: 10)")
        .setMinValue(1)
        .setMaxValue(50)
        .setRequired(false)
    )
    .toJSON(),
  // Config command
  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Manage bot configuration")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View current bot configuration")
    )
    .toJSON(),
  // Backup command
  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("View server backup information")
    .toJSON(),
  // Avatar command
  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("View a user's avatar")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to view avatar (defaults to you)")
        .setRequired(false)
    )
    .toJSON(),
  // Notify command
  new SlashCommandBuilder()
    .setName("notify")
    .setDescription("Send a DM notification to a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to notify").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Message to send")
        .setRequired(true)
    )
    .toJSON(),
  // Echo command
  new SlashCommandBuilder()
    .setName("echo")
    .setDescription("Echo back text (fun command)")
    .addStringOption((option) =>
      option.setName("text").setDescription("Text to echo").setRequired(true)
    )
    .toJSON(),
  // Role info command
  new SlashCommandBuilder()
    .setName("roleinfo")
    .setDescription("Get detailed information about a role")
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("Role to get info about")
        .setRequired(true)
    )
    .toJSON(),
  // Channel info command
  new SlashCommandBuilder()
    .setName("channelinfo")
    .setDescription("Get detailed information about a channel")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to get info about (defaults to current)")
        .setRequired(false)
    )
    .toJSON(),
  // Uptime ranking command
  new SlashCommandBuilder()
    .setName("uptime-ranking")
    .setDescription("View bot 30-day uptime ranking")
    .toJSON(),
  // Ban list command
  new SlashCommandBuilder()
    .setName("banlist")
    .setDescription("View list of banned users in the server")
    .toJSON(),
  // Clear warnings command
  new SlashCommandBuilder()
    .setName("clear-warnings")
    .setDescription("Clear warnings for a user (admin only)")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to clear warnings for")
        .setRequired(true)
    )
    .toJSON(),
  // Tracking command
  new SlashCommandBuilder()
    .setName("tracking")
    .setDescription("Configure guild activity tracking")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("toggle")
        .setDescription("Enable or disable activity tracking")
        .addBooleanOption((option) =>
          option
            .setName("enabled")
            .setDescription("Enable (true) or disable (false) tracking")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("channel")
        .setDescription("Set the channel for tracking logs")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to send tracking logs to")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("View current tracking configuration")
    )
    .toJSON(),
  // Twitch notification command
  new SlashCommandBuilder()
    .setName("twitch-notify")
    .setDescription("Manage Twitch streamer notifications for your server")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a Twitch streamer to monitor for this server")
        .addStringOption((option) =>
          option
            .setName("streamer")
            .setDescription("Twitch streamer username to monitor")
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Discord channel to send notifications to")
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Stop monitoring a Twitch streamer")
        .addStringOption((option) =>
          option
            .setName("streamer")
            .setDescription("Twitch streamer username to stop monitoring")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List all monitored streamers for this server")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("channel")
        .setDescription("Set default notification channel for this server")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Discord channel for Twitch notifications")
            .setRequired(true)
        )
    )
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔄 Starting to register slash commands...");

    const hasGuildTarget =
      process.env.GUILD_ID && process.env.GUILD_ID.trim().length > 0;

    if (hasGuildTarget) {
      console.log(
        `🎯 Registering commands to guild ${process.env.GUILD_ID} (instant updates)`
      );
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID
        ),
        { body: commands }
      );
    } else {
      console.log(
        "🌐 No GUILD_ID set; registering commands globally (may take up to 1 hour)"
      );
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
        body: commands,
      });
    }

    console.log("✅ Successfully registered slash commands!");
    console.log(`📝 Registered ${commands.length} command(s):`);
    commands.forEach((cmd) =>
      console.log(`   - /${cmd.name}: ${cmd.description}`)
    );
    if (!hasGuildTarget) {
      console.log(
        "\n💡 Tip: Set GUILD_ID in .env to register instantly to a test server while iterating."
      );
    }
  } catch (error) {
    console.error("❌ Error registering slash commands:", error);

    if (error.code === 50001) {
      console.log("\n⚠️ Error reason: Bot missing permissions");
      console.log("Solution:");
      console.log("1. Confirm the bot has been added to the server");
      console.log('2. Confirm the bot has "applications.commands" permission');
    } else if (error.code === "TOKEN_INVALID") {
      console.log("\n⚠️ Error reason: Invalid Discord Token");
      console.log("Solution:");
      console.log("1. Check if DISCORD_TOKEN in .env file is correct");
      console.log("2. Go to Discord Developer Portal to regenerate Token");
    }
  }
})();
