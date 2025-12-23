import { REST, Routes, SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

// Helper function to add user-install contexts to commands
function makeUserInstallable(command) {
  const commandJSON = command.toJSON();
  // Add integration types: 0 = Guild Install, 1 = User Install
  commandJSON.integration_types = [0, 1];
  // Add contexts: 0 = Guild, 1 = Bot DM, 2 = Group DM
  commandJSON.contexts = [0, 1, 2];
  return commandJSON;
}

// Helper function for guild-only commands
function makeGuildOnly(command) {
  const commandJSON = command.toJSON();
  commandJSON.integration_types = [0]; // Guild install only
  commandJSON.contexts = [0]; // Guild only
  return commandJSON;
}

const commands = [
  // Ping command to check latency and maintain Active Developer status
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Check bot latency and maintain Active Developer status")
  ),
  // Uptime command to check bot uptime
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("uptime")
      .setDescription("Check how long the bot has been running")
  ),
  // Status command - Show Active Developer Badge status
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("status")
      .setDescription(
        "View next auto-execution date for your Active Developer badge"
      )
  ),
  // Auto-execution control
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("auto-execution")
      .setDescription("Enable, disable, or view auto-execution status")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("enable")
          .setDescription("Enable auto-execution for Active Developer upkeep")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("disable")
          .setDescription("Disable auto-execution for Active Developer upkeep")
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("status").setDescription("Show auto-execution state")
      )
  ),
  // Help command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Display all available commands")
  ),
  // Server info command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("serverinfo")
      .setDescription("Display information about this server")
  ),
  // User info command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("userinfo")
      .setDescription("Get information about a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to get info about (defaults to you)")
          .setRequired(false)
      )
  ),
  // Stats command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("stats")
      .setDescription("View bot performance statistics")
  ),
  // Purge command to delete messages in bulk
  makeGuildOnly(
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
  ),
  // Lock command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("lock")
      .setDescription("Lock the current channel (prevent messages)")
  ),
  // Unlock command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("unlock")
      .setDescription("Unlock the current channel")
  ),
  // Slowmode command
  makeGuildOnly(
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
  ),
  // Kick command
  makeGuildOnly(
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
  ),
  // Ban command
  makeGuildOnly(
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
  ),
  // Mute command
  makeGuildOnly(
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
  ),
  // Unmute command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("unmute")
      .setDescription("Unmute a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to unmute")
          .setRequired(true)
      )
  ),
  // Warn command
  makeGuildOnly(
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
  ),
  // Say command
  makeGuildOnly(
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
  ),
  // Poll command
  makeGuildOnly(
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
        option
          .setName("option1")
          .setDescription("First option")
          .setRequired(true)
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
  ),
  // Remind command
  makeUserInstallable(
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
  ),
  // Invite command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("invite")
      .setDescription("Get the bot invite link")
  ),
  // Logs command
  makeGuildOnly(
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
  ),
  // Config command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("config")
      .setDescription("Manage bot configuration")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("view")
          .setDescription("View current bot configuration")
      )
  ),
  // Backup command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("backup")
      .setDescription("View server backup information")
  ),
  // Avatar command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("avatar")
      .setDescription("View a user's avatar")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to view avatar (defaults to you)")
          .setRequired(false)
      )
  ),
  // Notify command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("notify")
      .setDescription("Send a DM notification to a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to notify")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Message to send")
          .setRequired(true)
      )
  ),
  // Echo command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("echo")
      .setDescription("Echo back text (fun command)")
      .addStringOption((option) =>
        option.setName("text").setDescription("Text to echo").setRequired(true)
      )
  ),
  // Role info command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("roleinfo")
      .setDescription("Get detailed information about a role")
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("Role to get info about")
          .setRequired(true)
      )
  ),
  // Channel info command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("channelinfo")
      .setDescription("Get detailed information about a channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel to get info about (defaults to current)")
          .setRequired(false)
      )
  ),
  // Uptime ranking command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("uptime-ranking")
      .setDescription("View bot 30-day uptime ranking")
  ),
  // Ban list command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("banlist")
      .setDescription("View list of banned users in the server")
  ),
  // Clear warnings command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("clear-warnings")
      .setDescription("Clear warnings for a user (admin only)")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to clear warnings for")
          .setRequired(true)
      )
  ),
  // Tracking command
  makeGuildOnly(
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
      .addSubcommand((subcommand) =>
        subcommand
          .setName("ignore-channel")
          .setDescription("Add or remove a channel from tracking ignore list")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("Channel to ignore")
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("events")
          .setDescription("Configure which event types to track")
          .addBooleanOption((option) =>
            option
              .setName("messages")
              .setDescription("Track message events (send, edit, delete)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("members")
              .setDescription("Track member events (join, leave, role changes)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("voice")
              .setDescription("Track voice channel events (join, leave, mute)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("reactions")
              .setDescription("Track reaction events")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("channels")
              .setDescription("Track channel create/delete events")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("user-updates")
              .setDescription("Track user profile updates (avatar, username)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("channel-updates")
              .setDescription(
                "Track channel updates (name, topic, permissions)"
              )
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("roles")
              .setDescription("Track role events (create, delete, update)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("guild")
              .setDescription("Track guild updates (name, icon, banner)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("threads")
              .setDescription("Track thread events (create, delete, archive)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("scheduled-events")
              .setDescription(
                "Track scheduled events (create, delete, start, end)"
              )
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("stickers")
              .setDescription("Track sticker events (create, delete, update)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("webhooks")
              .setDescription("Track webhook events (create, update, delete)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("integrations")
              .setDescription(
                "Track integration events (create, update, delete)"
              )
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("invites")
              .setDescription("Track invite events (create, delete)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("stage-instances")
              .setDescription(
                "Track stage instance events (create, update, delete)"
              )
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("moderation-rules")
              .setDescription("Track auto moderation rule events")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("interactions")
              .setDescription(
                "Track interaction events (slash commands, buttons, selects)"
              )
              .setRequired(false)
          )
      )
  ),
  // Twitch notification command
  makeGuildOnly(
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
  ),
  // 8ball command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("8ball")
      .setDescription("Get a random Magic 8-ball response")
      .addStringOption((option) =>
        option
          .setName("question")
          .setDescription("Your question")
          .setRequired(true)
      )
  ),
  // Dice command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("dice")
      .setDescription("Roll dice with customizable sides")
      .addIntegerOption((option) =>
        option
          .setName("sides")
          .setDescription("Number of sides on the die (default: 6)")
          .setMinValue(2)
          .setMaxValue(100)
          .setRequired(false)
      )
      .addIntegerOption((option) =>
        option
          .setName("rolls")
          .setDescription("Number of times to roll (default: 1)")
          .setMinValue(1)
          .setMaxValue(10)
          .setRequired(false)
      )
  ),
  // Flip command
  makeUserInstallable(
    new SlashCommandBuilder().setName("flip").setDescription("Flip a coin")
  ),
  // Quote command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("quote")
      .setDescription("Get a random inspirational quote")
  ),
  // Joke command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("joke")
      .setDescription("Tell a random joke")
  ),
  // Warn list command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("warn-list")
      .setDescription("View warnings for a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to view warnings for")
          .setRequired(true)
      )
  ),
  // Role assign command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("role-assign")
      .setDescription("Assign a role to a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to assign role to")
          .setRequired(true)
      )
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("Role to assign")
          .setRequired(true)
      )
  ),
  // Role remove command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("role-remove")
      .setDescription("Remove a role from a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to remove role from")
          .setRequired(true)
      )
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("Role to remove")
          .setRequired(true)
      )
  ),
  // Channel create command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("channel-create")
      .setDescription("Create a new text channel")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("Name of the new channel")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("topic")
          .setDescription("Channel topic (optional)")
          .setRequired(false)
      )
  ),
  // Channel delete command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("channel-delete")
      .setDescription("Delete a channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel to delete (defaults to current)")
          .setRequired(false)
      )
  ),
  // Welcome command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("welcome")
      .setDescription("Set welcome message and channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel for welcome messages")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Welcome message text")
          .setRequired(true)
      )
  ),
  // Settings command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("settings")
      .setDescription("View or configure bot settings for the server")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("view")
          .setDescription("View current server settings")
      )
  ),
  // Announce command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("announce")
      .setDescription("Send a server-wide announcement")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Announcement message")
          .setRequired(true)
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription(
            "Channel to send announcement to (defaults to current)"
          )
          .setRequired(false)
      )
  ),
  // Ping user command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("ping-user")
      .setDescription("Ping a user with a message")
      .addUserOption((option) =>
        option.setName("user").setDescription("User to ping").setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Message to send")
          .setRequired(true)
      )
  ),
  // Bot info command
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("botinfo")
      .setDescription("Get information about the bot")
  ),
  // Suggest command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("suggest")
      .setDescription("Submit a suggestion to server administrators")
      .addStringOption((option) =>
        option
          .setName("suggestion")
          .setDescription("Your suggestion")
          .setRequired(true)
      )
  ),
  // Command activity command
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("command-activity")
      .setDescription("View most used commands on this server")
      .addIntegerOption((option) =>
        option
          .setName("days")
          .setDescription("Number of days to check (default: 7)")
          .setMinValue(1)
          .setMaxValue(90)
          .setRequired(false)
      )
  ),
  // Translation commands
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("translate-setup")
      .setDescription("Enable auto-translation for a channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel to enable auto-translation in")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("target-language")
          .setDescription("Target language code (e.g., en, es, de, fr, ja)")
          .setRequired(false)
      )
  ),
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("translate-config")
      .setDescription("Configure translation settings for this server")
      .addStringOption((option) =>
        option
          .setName("display-mode")
          .setDescription("How to display translations")
          .setRequired(true)
          .addChoices(
            { name: "Reply to message", value: "reply" },
            { name: "Embed", value: "embed" },
            { name: "Thread", value: "thread" }
          )
      )
      .addStringOption((option) =>
        option
          .setName("default-language")
          .setDescription("Default target language (e.g., en, es, de, fr)")
          .setRequired(false)
      )
  ),
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("translate-output-channel")
      .setDescription("Set the channel where translations will be sent")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription(
            "Channel to send translations to (leave empty to disable)"
          )
          .setRequired(true)
      )
  ),
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("translate-disable")
      .setDescription("Disable auto-translation for a channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel to disable auto-translation in")
          .setRequired(true)
      )
  ),
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("translate-list")
      .setDescription("List all channels with auto-translation enabled")
  ),
  makeGuildOnly(
    new SlashCommandBuilder()
      .setName("translate-status")
      .setDescription("View current translation settings and enabled channels")
  ),
  makeUserInstallable(
    new SlashCommandBuilder()
      .setName("translate")
      .setDescription("Manually translate text")
      .addStringOption((option) =>
        option
          .setName("text")
          .setDescription("Text to translate")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("to")
          .setDescription("Target language (e.g., en, es, de, fr, ja)")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("from")
          .setDescription("Source language (auto-detect if not specified)")
          .setRequired(false)
      )
  ),
  // Role info command (duplicate prevention - using roleinfo for consistency)
  // Skip adding another role-info
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔄 Starting to register slash commands...");

    const hasGuildTarget =
      process.env.GUILD_ID && process.env.GUILD_ID.trim().length > 0;
    const registerGlobalWhenGuild =
      (process.env.REGISTER_GLOBAL_WHEN_GUILD || "false").toLowerCase() ===
      "true";

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

      if (registerGlobalWhenGuild) {
        console.log(
          "🌐 REGISTER_GLOBAL_WHEN_GUILD=true — also registering globally (may show duplicates in UI)"
        );
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
          body: commands,
        });
      } else {
        console.log(
          "🌐 REGISTER_GLOBAL_WHEN_GUILD=false — skipping global registration to avoid duplicates"
        );
      }
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
    console.log(
      `\nℹ️ Mode: ${
        hasGuildTarget ? "Guild" : "Global"
      } | Global also registered with guild: ${registerGlobalWhenGuild}`
    );
    if (!hasGuildTarget) {
      console.log(
        "💡 Tip: Set GUILD_ID in .env to register instantly to a test server while iterating."
      );
    } else if (!registerGlobalWhenGuild) {
      console.log(
        "💡 Set REGISTER_GLOBAL_WHEN_GUILD=true if you explicitly want both guild and global copies (may duplicate in UI)."
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
