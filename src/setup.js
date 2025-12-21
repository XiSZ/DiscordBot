import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import { logger } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

logger.divider();
logger.log("🔧 Running post-install setup...");
logger.divider();

// Copy .env.example to .env if .env doesn't exist
const envExamplePath = join(rootDir, ".env.example");
const envPath = join(rootDir, ".env");

if (!fs.existsSync(envPath)) {
  try {
    fs.copyFileSync(envExamplePath, envPath);
    logger.success("Created .env file from .env.example");
    logger.log("📝 Please edit .env file and add your Discord credentials");
  } catch (error) {
    logger.error(`Failed to create .env file: ${error.message}`);
  }
} else {
  logger.info(".env file already exists, skipping...");
}

// Copy invite-bot.html.template to invite-bot.html if invite-bot.html doesn't exist
const templatePath = join(rootDir, "invite-bot.html.template");
const htmlPath = join(rootDir, "invite-bot.html");

if (!fs.existsSync(htmlPath)) {
  try {
    fs.copyFileSync(templatePath, htmlPath);
    logger.success("Created invite-bot.html from invite-bot.html.template");
    logger.log(
      "💡 This file will be regenerated with your .env values when you run npm start"
    );
  } catch (error) {
    logger.error(`Failed to create invite-bot.html: ${error.message}`);
  }
} else {
  logger.info("invite-bot.html already exists, skipping...");
}

logger.divider();
logger.success("Setup complete!");
logger.log("");
logger.log("📋 Next steps:");
logger.log("   1. Edit .env file with your Discord credentials");
logger.log("   2. Run: npm run register (to register slash commands)");
logger.log("   3. Run: npm start (to start the bot)");
logger.divider();
