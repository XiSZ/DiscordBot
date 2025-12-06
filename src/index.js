import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import dotenv from "dotenv";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

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

  // Detect platform and use appropriate command
  const command =
    process.platform === "win32"
      ? `start "" "${htmlPath}"`
      : process.platform === "darwin"
      ? `open "${htmlPath}"`
      : `xdg-open "${htmlPath}"`;

  exec(command, (error) => {
    if (error) {
      console.log("💡 Setup guide available at: invite-bot.html");
    } else {
      console.log("🌐 Opening setup guide in your browser...");
    }
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

  // Set rich presence
  client.user.setPresence({
    activities: [
      {
        name: "Chase the Bug in [Source Code]",
        type: ActivityType.Playing,
      },
    ],
    status: "online",
  });
  console.log("✨ Rich presence set: Watching Active Developer Badge");

  // Setup auto-execution schedule
  setupAutoExecution();
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    const startTime = Date.now();
    await interaction.deferReply();

    const latency = Date.now() - startTime;
    const apiLatency = Math.round(client.ws.ping);

    const timeSinceLastAuto = Date.now() - lastExecutionTime;
    const daysUntilNext = Math.ceil(
      (AUTO_EXECUTE_INTERVAL_MS - timeSinceLastAuto) / (1000 * 60 * 60 * 24)
    );

    await interaction.editReply({
      content:
        `🏓 Pong!\n` +
        `⏱️ Latency: ${latency}ms\n` +
        `💓 API Latency: ${apiLatency}ms\n` +
        `✅ Bot is working properly\n` +
        `📅 Days until next auto-execution: ${daysUntilNext} day(s)\n` +
        `🎖️ Your Active Developer status has been updated!`,
    });

    console.log(`✅ ${interaction.user.tag} executed ping command`);
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
