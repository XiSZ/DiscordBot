import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import dotenv from "dotenv";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Command prefix (can be customized via .env file)
const PREFIX = process.env.COMMAND_PREFIX || "!";

// Auto-execution interval (30 days)
const AUTO_EXECUTE_INTERVAL_DAYS = 30;
const AUTO_EXECUTE_INTERVAL_MS =
  AUTO_EXECUTE_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

// Maximum safe value for Node.js setTimeout (about 24.8 days)
const MAX_TIMEOUT = 2147483647;

// Check once per day if execution is needed
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

// Track last execution time
let lastExecutionTime = Date.now();

// Track bot start time for uptime calculation
const botStartTime = Date.now();

// Function to format uptime
function getUptime() {
  const uptime = Date.now() - botStartTime;
  const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
  const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

// Function to auto-execute slash command
async function autoExecuteCommand() {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channels = await guild.channels.fetch();

    // Find the first text channel
    const textChannel = channels.find(
      (channel) =>
        channel.type === 0 &&
        channel.permissionsFor(guild.members.me).has("SendMessages")
    );

    if (!textChannel) {
      console.log("❌ Cannot find available text channel");
      return;
    }

    // Send a message to log auto-execution
    console.log(
      "🤖 Auto-executing ping command to maintain application active status..."
    );

    await textChannel.send({
      content:
        "✅ Auto-maintenance Active Developer status - Ping! Bot is working properly.",
    });

    lastExecutionTime = Date.now();
    const nextExecutionDate = new Date(
      lastExecutionTime + AUTO_EXECUTE_INTERVAL_MS
    );
    console.log(
      `✅ Auto-execution completed! Next execution time: ${nextExecutionDate.toLocaleString(
        "en-US"
      )}`
    );
  } catch (error) {
    console.error("❌ Error during auto-execution:", error);
  }
}

// Check if auto-command execution is needed
function checkAndExecute() {
  const now = Date.now();
  const timeSinceLastExecution = now - lastExecutionTime;

  // Execute if more than 30 days have passed since last execution
  if (timeSinceLastExecution >= AUTO_EXECUTE_INTERVAL_MS) {
    console.log("📅 Auto-execution time reached...");
    autoExecuteCommand();
  } else {
    const daysRemaining = Math.ceil(
      (AUTO_EXECUTE_INTERVAL_MS - timeSinceLastExecution) /
        (24 * 60 * 60 * 1000)
    );
    console.log(
      `⏳ ${daysRemaining} day(s) remaining until next auto-execution`
    );
  }
}

// Rich presence rotation
let presenceIndex = 0;
const presenceMessages = [
  {
    type: ActivityType.Watching,
    name: "over your Active Developer status",
  },
  { type: ActivityType.Playing, name: "with Discord API" },
  { type: ActivityType.Listening, name: "to user commands" },
  {
    type: ActivityType.Watching,
    name: `Currently active in ${client.guilds?.cache.size || 0} servers`,
  },
  { type: ActivityType.Playing, name: "Auto-Maintenance Mode" },
  { type: ActivityType.Competing, name: "in the uptime challenge" },
];

function updateRichPresence() {
  try {
    const presence = presenceMessages[presenceIndex];

    // Update server count dynamically
    if (presence.name.includes("servers")) {
      presence.name = `${client.guilds.cache.size} server${
        client.guilds.cache.size !== 1 ? "s" : ""
      }`;
    }

    // Update uptime dynamically for competing status
    if (presence.type === ActivityType.Competing) {
      presence.name = `Uptime: ${getUptime()}`;
    }

    client.user.setPresence({
      activities: [
        {
          name: presence.name,
          type: presence.type,
        },
      ],
      status: "online",
    });

    presenceIndex = (presenceIndex + 1) % presenceMessages.length;
  } catch (error) {
    console.error("❌ Error updating rich presence:", error);
  }
}

// Setup auto-execution schedule
function setupAutoExecution() {
  // Execute once immediately
  setTimeout(() => {
    console.log("🚀 First auto-execution...");
    autoExecuteCommand();
  }, 60000); // Execute after 1 minute from startup

  // Check daily if execution is needed (instead of using interval exceeding 32-bit limit)
  setInterval(() => {
    checkAndExecute();
  }, CHECK_INTERVAL);

  console.log(
    `⏰ Auto-execution schedule set, will execute every ${AUTO_EXECUTE_INTERVAL_DAYS} days`
  );
  console.log(`🔍 Checking every 24 hours if execution is needed`);

  const nextExecutionDate = new Date(
    lastExecutionTime + AUTO_EXECUTE_INTERVAL_MS
  );
  console.log(
    `📅 Next scheduled execution time: ${nextExecutionDate.toLocaleString(
      "en-US"
    )}`
  );
}

// Open invite-bot.html in default browser
function openInviteBotGuide() {
  const htmlPath = join(__dirname, "..", "invite-bot.html");
  const guideUrl =
    process.env.GUIDE_URL ||
    "https://raw.githubusercontent.com/XiSZ/Auto-Discord-Developer-Badge/main/invite-bot.html";

  // Detect headless/hosted environments where opening a browser is pointless
  const isHeadless =
    process.env.CI === "true" ||
    !!process.env.CODESPACES ||
    !!process.env.SSH_CONNECTION ||
    !!process.env.CONTAINER ||
    (process.platform === "linux" && !process.env.DISPLAY) ||
    !process.stdout.isTTY;

  // If file is not present on this machine or we are headless, just print a remote-friendly link
  const guideExists = existsSync(htmlPath);
  if (!guideExists || isHeadless) {
    const locationHint = guideExists ? `file://${htmlPath}` : guideUrl;
    console.log("💡 Setup guide available at:", locationHint);
    return;
  }

  // Detect platform and use appropriate command
  const command =
    process.platform === "win32"
      ? `start "" "${htmlPath}"`
      : process.platform === "darwin"
      ? `open "${htmlPath}"`
      : `xdg-open "${htmlPath}"`;

  exec(command, (error) => {
    if (error) {
      console.log("💡 Setup guide available at:", guideUrl);
    } else {
      console.log("🌐 Opening setup guide in your browser...");
    }
  });
}

// Helper function for successful command response
async function successReply(interaction, content, isEphemeral = true) {
  return await interaction.reply({
    content: `✅ ${content}`,
    ephemeral: isEphemeral,
  });
}

// Helper function for error response
async function errorReply(interaction, content) {
  return await interaction.reply({
    content: `❌ ${content}`,
    ephemeral: true,
  });
}

client.once("clientReady", () => {
  console.log("✅ Bot is online!");
  console.log(`🤖 Logged in as: ${client.user.tag}`);
  console.log(`📊 Joined ${client.guilds.cache.size} server(s)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 Discord Active Developer Badge Auto-Maintenance Bot");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // ActivityType.Playing - "Playing [name]"
  // ActivityType.Streaming - "Streaming [name]"
  // ActivityType.Listening - "Listening to [name]"
  // ActivityType.Watching - "Watching [name]" (currently set)
  // ActivityType.Competing - "Competing in [name]"

  // Set initial rich presence
  updateRichPresence();

  // Update rich presence every 30 seconds with rotating messages
  setInterval(updateRichPresence, 30000);

  // Setup auto-execution schedule
  setupAutoExecution();
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Help command
  if (interaction.commandName === "help") {
    await interaction.reply({
      content:
        `📖 **Available Commands**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**Badge & Info:**\n` +
        `\`/ping\` – Check bot latency and badge status\n` +
        `\`/uptime\` – View bot uptime\n` +
        `\`/status\` – Show next auto-execution date\n` +
        `\`/serverinfo\` – Display server information\n` +
        `\`/userinfo [user]\` – Get user details\n` +
        `\`/stats\` – View bot performance statistics\n` +
        `\n**Moderation:**\n` +
        `\`/kick <user> [reason]\` – Remove user from server\n` +
        `\`/ban <user> [reason]\` – Ban user from server\n` +
        `\`/mute <user> <minutes> [reason]\` – Mute user\n` +
        `\`/unmute <user>\` – Unmute user\n` +
        `\`/warn <user> [reason]\` – Warn user\n` +
        `\n**Channel Management:**\n` +
        `\`/lock\` – Lock current channel (no messages)\n` +
        `\`/unlock\` – Unlock current channel\n` +
        `\`/slowmode <seconds>\` – Set channel slowmode (0 to disable)\n` +
        `\`/purge [amount]\` – Delete messages from channel\n` +
        `\n**Utility:**\n` +
        `\`/say <message> [channel]\` – Send message as bot\n` +
        `\`/poll <question> <opt1> <opt2> [opt3-5]\` – Create a poll\n` +
        `\`/remind <minutes> <reminder>\` – Set a reminder\n` +
        `\`/invite\` – Get bot invite link\n` +
        `\`/avatar [user]\` – View user's avatar\n` +
        `\`/echo <text>\` – Echo back text\n` +
        `\`/notify <user> <message>\` – Send DM notification\n` +
        `\n**Information:**\n` +
        `\`/roleinfo <role>\` – Get role details\n` +
        `\`/channelinfo [channel]\` – Get channel details\n` +
        `\`/uptime-ranking\` – View bot uptime percentage\n` +
        `\n**Logging & Monitoring:**\n` +
        `\`/logs [lines]\` – View audit logs\n` +
        `\`/config view\` – View bot configuration\n` +
        `\`/backup\` – View server backup info\n` +
        `\`/banlist\` – View banned users\n` +
        `\`/clear-warnings <user>\` – Clear user warnings\n` +
        `\`/help\` – Show this message`,
      ephemeral: true,
    });
    console.log(`✅ ${interaction.user.tag} executed help command`);
  }

  if (interaction.commandName === "ping") {
    const startTime = Date.now();
    await interaction.deferReply({ ephemeral: true });

    const latency = Date.now() - startTime;
    const apiLatency = Math.round(client.ws.ping);

    const timeSinceLastAuto = Date.now() - lastExecutionTime;
    const daysUntilNext = Math.ceil(
      (AUTO_EXECUTE_INTERVAL_MS - timeSinceLastAuto) / (1000 * 60 * 60 * 24)
    );

    await interaction.editReply({
      content:
        `✅ **Pong!**\n` +
        `⏱️ Latency: ${latency}ms\n` +
        `💓 API Latency: ${apiLatency}ms\n` +
        `✅ Bot is working properly\n` +
        `📅 Days until next auto-execution: ${daysUntilNext} day(s)\n` +
        `🎖️ Your Active Developer status has been updated!`,
    });

    console.log(`✅ ${interaction.user.tag} executed ping command`);
  }

  if (interaction.commandName === "uptime") {
    const uptime = Date.now() - botStartTime;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

    await interaction.reply({
      content:
        `✅ **Bot Uptime**\n` +
        `📊 Total: ${days}d ${hours}h ${minutes}m ${seconds}s\n` +
        `🚀 Started: <t:${Math.floor(botStartTime / 1000)}:R>\n` +
        `✅ Status: Online and operational`,
      ephemeral: true,
    });

    console.log(`✅ ${interaction.user.tag} executed uptime command`);
  }

  if (interaction.commandName === "purge") {
    // Check if user has permission to manage messages
    if (!interaction.memberPermissions.has("ManageMessages")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Messages" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    // Check if bot has permission to manage messages
    if (!interaction.guild.members.me.permissions.has("ManageMessages")) {
      await interaction.reply({
        content:
          '❌ I need the "Manage Messages" permission to delete messages.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const amount = interaction.options.getInteger("amount");
      const channel = interaction.channel;

      let deletedCount = 0;

      if (amount) {
        // Delete specific amount in batches of 100
        let remaining = amount;
        while (remaining > 0) {
          const batchSize = Math.min(remaining, 100);
          const messages = await channel.messages.fetch({ limit: batchSize });
          if (messages.size === 0) break;

          const deleted = await channel.bulkDelete(messages, true);
          deletedCount += deleted.size;
          remaining -= deleted.size;

          // If we deleted fewer than fetched, we've hit messages older than 14 days
          if (deleted.size < messages.size) {
            break;
          }
        }
      } else {
        // Delete all messages in batches
        let fetchedMessages;
        do {
          fetchedMessages = await channel.messages.fetch({ limit: 100 });
          if (fetchedMessages.size > 0) {
            const deleted = await channel.bulkDelete(fetchedMessages, true);
            deletedCount += deleted.size;

            // If we deleted fewer than fetched, we've hit messages older than 14 days
            if (deleted.size < fetchedMessages.size) {
              break;
            }
          }
        } while (fetchedMessages.size > 0);
      }

      await interaction.editReply({
        content:
          `✅ Successfully deleted ${deletedCount} message(s).\n` +
          `${
            deletedCount < (amount || 100)
              ? "⚠️ Note: Messages older than 14 days cannot be bulk deleted."
              : ""
          }`,
      });

      console.log(
        `🗑️ ${interaction.user.tag} purged ${deletedCount} messages in #${channel.name}`
      );
    } catch (error) {
      console.error("❌ Error purging messages:", error);
      await interaction.editReply({
        content: "❌ An error occurred while trying to delete messages.",
      });
    }
  }

  // Status command - Badge-specific info
  if (interaction.commandName === "status") {
    const timeSinceLastAuto = Date.now() - lastExecutionTime;
    const daysUntilNext = Math.ceil(
      (AUTO_EXECUTE_INTERVAL_MS - timeSinceLastAuto) / (1000 * 60 * 60 * 24)
    );
    const hoursUntilNext = Math.ceil(
      ((AUTO_EXECUTE_INTERVAL_MS - timeSinceLastAuto) % (1000 * 60 * 60 * 24)) /
        (1000 * 60 * 60)
    );
    const nextExecutionDate = new Date(
      lastExecutionTime + AUTO_EXECUTE_INTERVAL_MS
    );

    await interaction.reply({
      content:
        `🎖️ **Active Developer Badge Status**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📅 Last auto-execution: <t:${Math.floor(
          lastExecutionTime / 1000
        )}:R>\n` +
        `⏰ Next scheduled: ${nextExecutionDate.toLocaleString("en-US")}\n` +
        `⏳ Time remaining: ${daysUntilNext}d ${hoursUntilNext}h\n` +
        `🤖 Bot Status: Online and maintaining your badge\n` +
        `✅ Auto-execution: Enabled`,
    });

    console.log(`✅ ${interaction.user.tag} executed status command`);
  }

  // Server info command
  if (interaction.commandName === "serverinfo") {
    const guild = interaction.guild;
    const owner = await guild.fetchOwner();
    const memberCount = guild.memberCount;
    const channelCount = guild.channels.cache.size;
    const roleCount = guild.roles.cache.size;
    const verificationLevel = ["None", "Low", "Medium", "High", "Very High"][
      guild.verificationLevel
    ];

    const createdAt = Math.floor(guild.createdTimestamp / 1000);

    await interaction.reply({
      content:
        `📊 **Server Information**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🏛️ **Name:** ${guild.name}\n` +
        `🆔 **ID:** ${guild.id}\n` +
        `👑 **Owner:** ${owner.user.tag}\n` +
        `📅 **Created:** <t:${createdAt}:R>\n` +
        `👥 **Members:** ${memberCount}\n` +
        `💬 **Channels:** ${channelCount}\n` +
        `🏷️ **Roles:** ${roleCount}\n` +
        `🔐 **Verification Level:** ${verificationLevel}\n` +
        `${guild.icon ? `🖼️ **Icon:** [View](${guild.iconURL()})` : ""}`,
    });

    console.log(`✅ ${interaction.user.tag} executed serverinfo command`);
  }

  // User info command
  if (interaction.commandName === "userinfo") {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id);

    const joinedAt = Math.floor(member.joinedTimestamp / 1000);
    const createdAt = Math.floor(user.createdTimestamp / 1000);
    const roles =
      member.roles.cache
        .filter((r) => r.name !== "@everyone")
        .map((r) => r.toString())
        .join(", ") || "None";

    await interaction.reply({
      content:
        `👤 **User Information**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 **Username:** ${user.tag}\n` +
        `🆔 **ID:** ${user.id}\n` +
        `📅 **Account Created:** <t:${createdAt}:R>\n` +
        `🎪 **Joined Server:** <t:${joinedAt}:R>\n` +
        `🏷️ **Roles:** ${roles}\n` +
        `${user.bot ? "🤖 **Type:** Bot" : "👨 **Type:** User"}`,
      ephemeral: true,
    });

    console.log(
      `✅ ${interaction.user.tag} executed userinfo command for ${user.tag}`
    );
  }

  // Stats command
  if (interaction.commandName === "stats") {
    const uptime = getUptime();
    const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const serverCount = client.guilds.cache.size;
    const userCount = client.users.cache.size;
    const channelCount = client.channels.cache.size;

    await interaction.reply({
      content:
        `📈 **Bot Statistics**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏰ **Uptime:** ${uptime}\n` +
        `🖥️ **Memory Usage:** ${memUsage} MB\n` +
        `🏛️ **Servers:** ${serverCount}\n` +
        `👥 **Users Cached:** ${userCount}\n` +
        `💬 **Channels Cached:** ${channelCount}\n` +
        `💓 **API Latency:** ${Math.round(client.ws.ping)}ms\n` +
        `🔌 **Discord.js Version:** v${require("discord.js").version}`,
    });

    console.log(`✅ ${interaction.user.tag} executed stats command`);
  }

  // Lock command
  if (interaction.commandName === "lock") {
    if (!interaction.memberPermissions.has("ManageChannels")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Channels" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const channel = interaction.channel;
      await channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages: false,
        }
      );

      await interaction.reply({
        content: `🔒 Channel locked! Only members with specific roles can send messages.`,
      });

      console.log(`🔒 ${interaction.user.tag} locked channel #${channel.name}`);
    } catch (error) {
      console.error("❌ Error locking channel:", error);
      await interaction.reply({
        content: "❌ Failed to lock the channel.",
        ephemeral: true,
      });
    }
  }

  // Unlock command
  if (interaction.commandName === "unlock") {
    if (!interaction.memberPermissions.has("ManageChannels")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Channels" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const channel = interaction.channel;
      await channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages: null,
        }
      );

      await interaction.reply({
        content: `🔓 Channel unlocked! Everyone can send messages again.`,
      });

      console.log(
        `🔓 ${interaction.user.tag} unlocked channel #${channel.name}`
      );
    } catch (error) {
      console.error("❌ Error unlocking channel:", error);
      await interaction.reply({
        content: "❌ Failed to unlock the channel.",
        ephemeral: true,
      });
    }
  }

  // Slowmode command
  if (interaction.commandName === "slowmode") {
    if (!interaction.memberPermissions.has("ManageChannels")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Channels" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const seconds = interaction.options.getInteger("seconds");
      const channel = interaction.channel;

      await channel.setRateLimitPerUser(seconds);

      const message =
        seconds === 0
          ? "🐇 Slowmode disabled!"
          : `🐢 Slowmode set to ${seconds} second(s)`;

      await interaction.reply({ content: message });

      console.log(
        `⏱️ ${interaction.user.tag} set slowmode to ${seconds}s in #${channel.name}`
      );
    } catch (error) {
      console.error("❌ Error setting slowmode:", error);
      await interaction.reply({
        content: "❌ Failed to set slowmode.",
        ephemeral: true,
      });
    }
  }

  // Kick command
  if (interaction.commandName === "kick") {
    if (!interaction.memberPermissions.has("KickMembers")) {
      await interaction.reply({
        content:
          '❌ You need the "Kick Members" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild.members.me.permissions.has("KickMembers")) {
      await interaction.reply({
        content: '❌ I need the "Kick Members" permission to kick users.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");
      const reason =
        interaction.options.getString("reason") || "No reason provided";
      const member = await interaction.guild.members.fetch(user.id);

      await member.kick(reason);

      await interaction.reply({
        content: `✅ **${user.tag}** has been kicked.\n📝 **Reason:** ${reason}`,
      });

      console.log(`👢 ${interaction.user.tag} kicked ${user.tag}: ${reason}`);
    } catch (error) {
      console.error("❌ Error kicking user:", error);
      await interaction.reply({
        content: "❌ Failed to kick the user.",
        ephemeral: true,
      });
    }
  }

  // Ban command
  if (interaction.commandName === "ban") {
    if (!interaction.memberPermissions.has("BanMembers")) {
      await interaction.reply({
        content:
          '❌ You need the "Ban Members" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild.members.me.permissions.has("BanMembers")) {
      await interaction.reply({
        content: '❌ I need the "Ban Members" permission to ban users.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");
      const reason =
        interaction.options.getString("reason") || "No reason provided";
      const member = await interaction.guild.members.fetch(user.id);

      await member.ban({ reason });

      await interaction.reply({
        content: `✅ **${user.tag}** has been banned.\n📝 **Reason:** ${reason}`,
      });

      console.log(`⛔ ${interaction.user.tag} banned ${user.tag}: ${reason}`);
    } catch (error) {
      console.error("❌ Error banning user:", error);
      await interaction.reply({
        content: "❌ Failed to ban the user.",
        ephemeral: true,
      });
    }
  }

  // Mute command
  if (interaction.commandName === "mute") {
    if (!interaction.memberPermissions.has("ModerateMembers")) {
      await interaction.reply({
        content:
          '❌ You need the "Moderate Members" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild.members.me.permissions.has("ModerateMembers")) {
      await interaction.reply({
        content: '❌ I need the "Moderate Members" permission to mute users.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");
      const minutes = interaction.options.getInteger("minutes");
      const reason =
        interaction.options.getString("reason") || "No reason provided";
      const member = await interaction.guild.members.fetch(user.id);

      const muteTime = minutes * 60 * 1000;

      await member.timeout(muteTime, reason);

      await interaction.reply({
        content: `🔇 **${user.tag}** has been muted for ${minutes} minute(s).\n📝 **Reason:** ${reason}`,
      });

      console.log(
        `🔇 ${interaction.user.tag} muted ${user.tag} for ${minutes}m: ${reason}`
      );
    } catch (error) {
      console.error("❌ Error muting user:", error);
      await interaction.reply({
        content: "❌ Failed to mute the user.",
        ephemeral: true,
      });
    }
  }

  // Unmute command
  if (interaction.commandName === "unmute") {
    if (!interaction.memberPermissions.has("ModerateMembers")) {
      await interaction.reply({
        content:
          '❌ You need the "Moderate Members" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild.members.me.permissions.has("ModerateMembers")) {
      await interaction.reply({
        content: '❌ I need the "Moderate Members" permission to unmute users.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");
      const member = await interaction.guild.members.fetch(user.id);

      await member.timeout(null);

      await interaction.reply({
        content: `🔊 **${user.tag}** has been unmuted.`,
      });

      console.log(`🔊 ${interaction.user.tag} unmuted ${user.tag}`);
    } catch (error) {
      console.error("❌ Error unmuting user:", error);
      await interaction.reply({
        content: "❌ Failed to unmute the user.",
        ephemeral: true,
      });
    }
  }

  // Warn command
  if (interaction.commandName === "warn") {
    if (!interaction.memberPermissions.has("ModerateMembers")) {
      await interaction.reply({
        content:
          '❌ You need the "Moderate Members" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");
      const reason =
        interaction.options.getString("reason") || "No reason provided";

      await interaction.reply({
        content: `⚠️ **${user.tag}** has been warned.\n📝 **Reason:** ${reason}`,
      });

      console.log(`⚠️ ${interaction.user.tag} warned ${user.tag}: ${reason}`);
    } catch (error) {
      console.error("❌ Error warning user:", error);
      await interaction.reply({
        content: "❌ Failed to warn the user.",
        ephemeral: true,
      });
    }
  }

  // Say command
  if (interaction.commandName === "say") {
    if (!interaction.memberPermissions.has("ManageMessages")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Messages" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const message = interaction.options.getString("message");
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;

      await channel.send(message);

      await interaction.reply({
        content: `✅ Message sent to ${channel}!`,
        ephemeral: true,
      });

      console.log(
        `💬 ${interaction.user.tag} sent a message via /say in #${channel.name}`
      );
    } catch (error) {
      console.error("❌ Error sending message:", error);
      await interaction.reply({
        content: "❌ Failed to send the message.",
        ephemeral: true,
      });
    }
  }

  // Poll command
  if (interaction.commandName === "poll") {
    try {
      const question = interaction.options.getString("question");
      const option1 = interaction.options.getString("option1");
      const option2 = interaction.options.getString("option2");
      const option3 = interaction.options.getString("option3");
      const option4 = interaction.options.getString("option4");
      const option5 = interaction.options.getString("option5");

      const options = [option1, option2, option3, option4, option5].filter(
        Boolean
      );
      const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

      let pollContent = `📊 **${question}**\n━━━━━━━━━━━━━━━━━\n`;
      options.forEach((opt, i) => {
        pollContent += `${emojis[i]} ${opt}\n`;
      });

      const pollMessage = await interaction.reply({
        content: pollContent,
        fetchReply: true,
      });

      for (let i = 0; i < options.length; i++) {
        await pollMessage.react(emojis[i]);
      }

      console.log(`📊 ${interaction.user.tag} created a poll: ${question}`);
    } catch (error) {
      console.error("❌ Error creating poll:", error);
      await interaction.reply({
        content: "❌ Failed to create the poll.",
        ephemeral: true,
      });
    }
  }

  // Remind command
  if (interaction.commandName === "remind") {
    try {
      const minutes = interaction.options.getInteger("minutes");
      const reminder = interaction.options.getString("reminder");
      const user = interaction.user;

      await interaction.reply({
        content: `⏰ Reminder set! You'll be reminded in ${minutes} minute(s).`,
        ephemeral: true,
      });

      setTimeout(async () => {
        try {
          await user.send(
            `⏰ **Reminder from ${minutes} minute(s) ago:** ${reminder}`
          );
        } catch (error) {
          console.error("❌ Could not send reminder DM:", error);
        }
      }, minutes * 60 * 1000);

      console.log(
        `⏰ ${interaction.user.tag} set a reminder: ${reminder} (${minutes}m)`
      );
    } catch (error) {
      console.error("❌ Error setting reminder:", error);
      await interaction.reply({
        content: "❌ Failed to set the reminder.",
        ephemeral: true,
      });
    }
  }

  // Invite command
  if (interaction.commandName === "invite") {
    try {
      const inviteUrl = client.generateInvite({
        scopes: ["bot"],
        permissions: [
          "SendMessages",
          "ManageMessages",
          "KickMembers",
          "BanMembers",
          "ModerateMembers",
          "ManageChannels",
          "UseApplicationCommands",
        ],
      });

      await interaction.reply({
        content: `🔗 **Invite the bot to your server:**\n${inviteUrl}`,
        ephemeral: true,
      });

      console.log(`🔗 ${interaction.user.tag} requested bot invite link`);
    } catch (error) {
      console.error("❌ Error generating invite:", error);
      await interaction.reply({
        content: "❌ Failed to generate invite link.",
        ephemeral: true,
      });
    }
  }

  // Logs command - Show recent bot action logs
  if (interaction.commandName === "logs") {
    if (!interaction.memberPermissions.has("ManageGuild")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Server" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const lines = interaction.options.getInteger("lines") || 10;
      const guild = interaction.guild;

      // Fetch audit logs
      const auditLogs = await guild.fetchAuditLogs({ limit: lines });
      let logsContent =
        `📋 **Recent Server Actions** (Last ${Math.min(
          lines,
          auditLogs.entries.size
        )} actions)\n` + `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      if (auditLogs.entries.size === 0) {
        logsContent += "No recent actions found.";
      } else {
        auditLogs.entries.forEach((log) => {
          const action = log.action;
          const executor = log.executor.tag;
          const target = log.target?.tag || log.targetId || "Unknown";
          const reason = log.reason || "No reason";

          logsContent += `**${action}** - ${executor} → ${target}\n`;
          logsContent += `   📝 Reason: ${reason}\n`;
        });
      }

      await interaction.reply({
        content: logsContent,
        ephemeral: true,
      });

      console.log(`📋 ${interaction.user.tag} viewed server audit logs`);
    } catch (error) {
      console.error("❌ Error fetching logs:", error);
      await interaction.reply({
        content: "❌ Failed to fetch audit logs.",
        ephemeral: true,
      });
    }
  }

  // Config command - Show/update bot settings
  if (interaction.commandName === "config") {
    if (!interaction.memberPermissions.has("ManageGuild")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Server" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "view") {
      try {
        const guildId = interaction.guild.id;
        const autoExecEnabled = true; // Default enabled
        const nextExecDate = new Date(
          lastExecutionTime + AUTO_EXECUTE_INTERVAL_MS
        );

        const configContent =
          `⚙️ **Bot Configuration for ${interaction.guild.name}**\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🆔 **Guild ID:** ${guildId}\n` +
          `🤖 **Auto-Execution:** ${
            autoExecEnabled ? "✅ Enabled" : "❌ Disabled"
          }\n` +
          `📅 **Next Execution:** ${nextExecDate.toLocaleString("en-US")}\n` +
          `⏱️ **Execution Interval:** ${AUTO_EXECUTE_INTERVAL_DAYS} days\n` +
          `💓 **API Latency:** ${Math.round(client.ws.ping)}ms`;

        await interaction.reply({
          content: configContent,
          ephemeral: true,
        });

        console.log(`⚙️ ${interaction.user.tag} viewed bot configuration`);
      } catch (error) {
        console.error("❌ Error viewing config:", error);
        await interaction.reply({
          content: "❌ Failed to fetch configuration.",
          ephemeral: true,
        });
      }
    }
  }

  // Backup command - Show backup info
  if (interaction.commandName === "backup") {
    if (!interaction.memberPermissions.has("ManageGuild")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Server" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const guild = interaction.guild;
      const memberCount = guild.memberCount;
      const channelCount = guild.channels.cache.size;
      const roleCount = guild.roles.cache.size;

      const backupInfo =
        `💾 **Server Backup Information**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🏛️ **Server:** ${guild.name}\n` +
        `👥 **Members:** ${memberCount}\n` +
        `💬 **Channels:** ${channelCount}\n` +
        `🏷️ **Roles:** ${roleCount}\n` +
        `📊 **Total Data Points:** ${
          memberCount + channelCount + roleCount
        }\n` +
        `\n💡 **Note:** This is informational only. For full server backups, consider using dedicated backup bots or server management tools.`;

      await interaction.reply({
        content: `✅ ${backupInfo}`,
        ephemeral: true,
      });

      console.log(`💾 ${interaction.user.tag} viewed backup information`);
    } catch (error) {
      console.error("❌ Error fetching backup info:", error);
      await interaction.reply({
        content: "❌ Failed to fetch backup information.",
        ephemeral: true,
      });
    }
  }

  // Avatar command - Show user's avatar
  if (interaction.commandName === "avatar") {
    try {
      const user = interaction.options.getUser("user") || interaction.user;
      const avatarUrl = user.displayAvatarURL({ size: 512 });

      await interaction.reply({
        content: `✅ **${user.username}'s Avatar:**\n${avatarUrl}`,
        ephemeral: true,
      });

      console.log(`👤 ${interaction.user.tag} viewed ${user.tag}'s avatar`);
    } catch (error) {
      console.error("❌ Error fetching avatar:", error);
      await interaction.reply({
        content: "❌ Failed to fetch avatar.",
        ephemeral: true,
      });
    }
  }

  // Notify command - Send DM to a user
  if (interaction.commandName === "notify") {
    try {
      const user = interaction.options.getUser("user");
      const message = interaction.options.getString("message");

      await user.send(
        `📬 **Notification from ${interaction.user.tag}:**\n${message}`
      );

      await interaction.reply({
        content: `✅ Notification sent to ${user}!`,
        ephemeral: true,
      });

      console.log(
        `📬 ${interaction.user.tag} sent notification to ${user.tag}`
      );
    } catch (error) {
      console.error("❌ Error sending notification:", error);
      await interaction.reply({
        content: "❌ Failed to send notification (user may have DMs disabled).",
        ephemeral: true,
      });
    }
  }

  // Echo command - Repeat text (fun command)
  if (interaction.commandName === "echo") {
    try {
      const text = interaction.options.getString("text");

      await interaction.reply({
        content: `✅ **Echo:** ${text}`,
        ephemeral: true,
      });

      console.log(`🔊 ${interaction.user.tag} echoed: ${text}`);
    } catch (error) {
      console.error("❌ Error echoing text:", error);
      await interaction.reply({
        content: "❌ Failed to echo text.",
        ephemeral: true,
      });
    }
  }

  // Role info command - Get role information
  if (interaction.commandName === "roleinfo") {
    try {
      const role = interaction.options.getRole("role");
      const createdAt = Math.floor(role.createdTimestamp / 1000);
      const memberCount = interaction.guild.members.cache.filter((m) =>
        m.roles.cache.has(role.id)
      ).size;

      const roleInfo =
        `🏷️ **Role Information**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**Name:** ${role.name}\n` +
        `**ID:** ${role.id}\n` +
        `**Color:** ${role.hexColor}\n` +
        `**Created:** <t:${createdAt}:R>\n` +
        `**Members:** ${memberCount}\n` +
        `**Position:** ${role.position}\n` +
        `**Managed:** ${role.managed ? "Yes" : "No"}\n` +
        `**Mentionable:** ${role.mentionable ? "Yes" : "No"}`;

      await interaction.reply({
        content: `✅ ${roleInfo}`,
        ephemeral: true,
      });

      console.log(
        `🏷️ ${interaction.user.tag} viewed info for role: ${role.name}`
      );
    } catch (error) {
      console.error("❌ Error fetching role info:", error);
      await interaction.reply({
        content: "❌ Failed to fetch role information.",
        ephemeral: true,
      });
    }
  }

  // Channel info command - Get channel information
  if (interaction.commandName === "channelinfo") {
    try {
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;
      const createdAt = Math.floor(channel.createdTimestamp / 1000);

      let channelInfo =
        `💬 **Channel Information**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**Name:** ${channel.name}\n` +
        `**Type:** ${channel.type === 0 ? "Text" : "Voice"}\n` +
        `**ID:** ${channel.id}\n` +
        `**Created:** <t:${createdAt}:R>`;

      if (channel.type === 0) {
        channelInfo += `\n**Topic:** ${channel.topic || "None"}`;
      }

      await interaction.reply({
        content: `✅ ${channelInfo}`,
        ephemeral: true,
      });

      console.log(
        `💬 ${interaction.user.tag} viewed info for channel: ${channel.name}`
      );
    } catch (error) {
      console.error("❌ Error fetching channel info:", error);
      await interaction.reply({
        content: "❌ Failed to fetch channel information.",
        ephemeral: true,
      });
    }
  }

  // Uptime ranking command - Show bot uptime percentage
  if (interaction.commandName === "uptime-ranking") {
    try {
      const uptime = Date.now() - botStartTime;
      const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
      const percentage = ((uptime / (30 * 24 * 60 * 60 * 1000)) * 100).toFixed(
        2
      );

      const uptimeRank =
        `⏰ **30-Day Uptime Ranking**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📊 **Total Uptime:** ${days}d ${hours}h ${minutes}m ${seconds}s\n` +
        `📈 **Uptime %:** ${Math.min(100, percentage)}%\n` +
        `🎯 **Rating:** ${
          uptime > 25 * 24 * 60 * 60 * 1000
            ? "⭐⭐⭐ Excellent"
            : uptime > 20 * 24 * 60 * 60 * 1000
            ? "⭐⭐ Good"
            : "⭐ Fair"
        }`;

      await interaction.reply({
        content: `✅ ${uptimeRank}`,
        ephemeral: true,
      });

      console.log(`⏰ ${interaction.user.tag} checked uptime ranking`);
    } catch (error) {
      console.error("❌ Error fetching uptime ranking:", error);
      await interaction.reply({
        content: "❌ Failed to fetch uptime ranking.",
        ephemeral: true,
      });
    }
  }

  // Ban list command - Show banned users
  if (interaction.commandName === "banlist") {
    if (!interaction.memberPermissions.has("BanMembers")) {
      await interaction.reply({
        content:
          '❌ You need the "Ban Members" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const bans = await interaction.guild.bans.fetch();

      if (bans.size === 0) {
        await interaction.reply({
          content: "✅ No banned users in this server.",
          ephemeral: true,
        });
        return;
      }

      let banListContent = `⛔ **Ban List (${bans.size} total)**\n━━━━━━━━━━━━━━━━━━━\n`;
      let count = 0;

      for (const [, ban] of bans) {
        if (count >= 20) {
          banListContent += `\n... and ${bans.size - 20} more`;
          break;
        }
        banListContent += `• **${ban.user.tag}** - ${
          ban.reason || "No reason"
        }\n`;
        count++;
      }

      await interaction.reply({
        content: `✅ ${banListContent}`,
        ephemeral: true,
      });

      console.log(`⛔ ${interaction.user.tag} viewed ban list`);
    } catch (error) {
      console.error("❌ Error fetching ban list:", error);
      await interaction.reply({
        content: "❌ Failed to fetch ban list.",
        ephemeral: true,
      });
    }
  }

  // Clear warnings command - Reset warn count (admin)
  if (interaction.commandName === "clear-warnings") {
    if (!interaction.memberPermissions.has("Administrator")) {
      await interaction.reply({
        content:
          '❌ You need the "Administrator" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");

      await interaction.reply({
        content: `✅ Warnings cleared for ${user}! (Note: This bot doesn't track persistent warnings. Use a dedicated warning bot for that.)`,
        ephemeral: true,
      });

      console.log(
        `🔄 ${interaction.user.tag} cleared warnings for ${user.tag}`
      );
    } catch (error) {
      console.error("❌ Error clearing warnings:", error);
      await interaction.reply({
        content: "❌ Failed to clear warnings.",
        ephemeral: true,
      });
    }
  }
});

// Prefix command handler
client.on("messageCreate", async (message) => {
  // Ignore bot messages and messages without the prefix
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  // Extract the command and arguments
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  if (!command) return;

  // Prefix command: help
  if (command === "help") {
    const helpContent =
      `📖 **Available Commands**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `**Slash Commands (use /command):**\n` +
      `\`/ping\` – Check bot latency and badge status\n` +
      `\`/uptime\` – View bot uptime\n` +
      `\`/status\` – Show next auto-execution date\n` +
      `\`/serverinfo\` – Display server information\n` +
      `\`/userinfo [user]\` – Get user details\n` +
      `\`/stats\` – View bot performance statistics\n` +
      `\`/kick <user> [reason]\` – Remove user from server\n` +
      `\`/ban <user> [reason]\` – Ban user from server\n` +
      `\`/lock\` – Lock current channel\n` +
      `\`/unlock\` – Unlock current channel\n` +
      `\n**Prefix Commands (use ${PREFIX}command):**\n` +
      `\`${PREFIX}help\` – Show this message\n` +
      `\`${PREFIX}ping\` – Quick ping response\n` +
      `\`${PREFIX}uptime\` – Show bot uptime\n` +
      `\`${PREFIX}prefix\` – Show current command prefix`;

    try {
      await message.reply({ content: helpContent });
      console.log(`📖 ${message.author.tag} used prefix command: help`);
    } catch (error) {
      console.error("❌ Error sending help:", error);
    }
  }

  // Prefix command: ping
  else if (command === "ping") {
    const startTime = Date.now();
    const sentMessage = await message.reply({
      content: `🏓 Pong! Calculating latency...`,
    });

    const latency = Date.now() - startTime;
    const apiLatency = Math.round(client.ws.ping);

    try {
      await sentMessage.edit({
        content:
          `🏓 **Pong!**\n` +
          `⏱️ Message Latency: ${latency}ms\n` +
          `💓 API Latency: ${apiLatency}ms\n` +
          `✅ Bot is working properly`,
      });

      console.log(`🏓 ${message.author.tag} used prefix command: ping`);
    } catch (error) {
      console.error("❌ Error editing ping response:", error);
    }
  }

  // Prefix command: uptime
  else if (command === "uptime") {
    const uptime = Date.now() - botStartTime;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

    try {
      await message.reply({
        content:
          `✅ **Bot Uptime**\n` +
          `📊 Total: ${days}d ${hours}h ${minutes}m ${seconds}s\n` +
          `🚀 Started: <t:${Math.floor(botStartTime / 1000)}:R>\n` +
          `✅ Status: Online and operational`,
      });

      console.log(`⏰ ${message.author.tag} used prefix command: uptime`);
    } catch (error) {
      console.error("❌ Error sending uptime:", error);
    }
  }

  // Prefix command: prefix (show current prefix)
  else if (command === "prefix") {
    try {
      await message.reply({
        content:
          `📋 **Current Command Prefix:** \`${PREFIX}\`\n` +
          `\n💡 You can change this in the \`.env\` file by setting:\n` +
          `\`\`\`\nCOMMAND_PREFIX=${PREFIX}\n\`\`\`\n` +
          `Then restart the bot for changes to take effect.`,
      });

      console.log(`📋 ${message.author.tag} checked the command prefix`);
    } catch (error) {
      console.error("❌ Error sending prefix info:", error);
    }
  }

  // Unknown command response
  else {
    try {
      await message.reply({
        content: `❌ Unknown command \`${PREFIX}${command}\`. Use \`${PREFIX}help\` for available commands.`,
      });
    } catch (error) {
      console.error("❌ Error sending unknown command message:", error);
    }
  }
});

// Error handling
client.on("error", (error) => {
  console.error("❌ Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Promise rejection:", error);
});

// Track if guide has been opened
let guideOpened = false;

// Open setup guide on startup
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🚀 Starting Discord Active Developer Badge Bot...");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
openInviteBotGuide();
guideOpened = true;

// Login bot
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error("❌ Unable to login bot:", error);
  console.log(
    "Please check if your DISCORD_TOKEN is correctly set in the .env file"
  );

  // Only open guide if it wasn't already opened
  if (!guideOpened) {
    console.log("\n📖 Opening setup guide to help you configure the bot...");
    openInviteBotGuide();
  } else {
    console.log("\n📖 Please check the setup guide in your browser for help.");
  }

  setTimeout(() => process.exit(1), 2000);
});
