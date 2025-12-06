import { REST, Routes, SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const commands = [
  // Ping command to check latency and maintain Active Developer status
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency and maintain Active Developer status")
    .toJSON(),
  // Purge command to delete messages in bulk
  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete all messages in the channel")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription(
          "Number of messages to delete (1-100, default: all fetchable)"
        )
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(false)
    )
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔄 Starting to register slash commands...");

    // Register commands to specific server (instant effect)
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Successfully registered slash commands!");
    console.log(`📝 Registered ${commands.length} command(s):`);
    commands.forEach((cmd) =>
      console.log(`   - /${cmd.name}: ${cmd.description}`)
    );
    console.log(
      "\n💡 Tip: If commands don't appear immediately, please wait 1-5 minutes"
    );
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
