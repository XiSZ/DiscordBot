# Railway Deployment Guide

This guide explains how to deploy the Discord bot to Railway with persistent data storage.

## Why Use Railway Volumes?

Railway uses ephemeral storage by default, meaning any files created during runtime are lost when the service redeploys. For features like **Twitch streamer notifications**, the bot needs to persist configuration data across deployments.

**Railway Volumes** provide persistent storage that survives deployments, restarts, and updates.

## What Gets Persisted?

- **Twitch Streamer Configuration**: List of monitored Twitch streamers per guild
- **Notification Channels**: Discord channels for stream notifications
- Any future persistent data features

## Step-by-Step Setup

### 1. Initial Railway Deployment

1. **Sign up** for a [Railway](https://railway.app) account
2. Click **New Project** → **Deploy from GitHub repo**
3. Authorize Railway to access your GitHub account
4. Select the `Auto-Discord-Developer-Badge` repository
5. Railway will automatically detect and deploy your bot

### 2. Configure Environment Variables

1. In your Railway project dashboard, click on your service
2. Go to the **Variables** tab
3. Add the following variables:
   - `DISCORD_TOKEN` - Your Discord bot token
   - `CLIENT_ID` - Your Discord application ID
   - `GUILD_ID` - Your Discord server ID
   - `COMMAND_PREFIX` - Command prefix (optional, default: `!`)
   - `TWITCH_CLIENT_ID` - Your Twitch application client ID (if using Twitch features)
   - `TWITCH_ACCESS_TOKEN` - Your Twitch access token (if using Twitch features)

### 3. Add Railway Volume for Persistence

This is the **critical step** for data persistence:

#### Option A: Using Command Palette (Recommended)

1. In your Railway project dashboard, press `Ctrl+K` (Windows/Linux) or `⌘K` (Mac) to open the Command Palette
2. Type "volume" and select **"Create Volume"**
3. Select your bot service from the list
4. When prompted, set the **mount path** to: `/data`
5. The volume will be created and automatically attached to your service

#### Option B: Using Right-Click Menu

1. In your Railway project dashboard, right-click on the project canvas (empty space)
2. Select **"New Volume"** from the context menu
3. Select your bot service to connect the volume to
4. Set the **mount path** to: `/data`
5. The volume will be created and attached

#### After Creating the Volume

Railway automatically sets the environment variable `RAILWAY_VOLUME_MOUNT_PATH` when a volume is attached. You don't need to manually add this variable - the bot code will detect it automatically.

### 4. Deploy with Volume

1. After adding the volume, Railway will automatically redeploy
2. Check the **Deployments** tab to monitor progress
3. Once deployed, check logs to confirm data directory creation:

   ```text
   ✅ Created data directory: /data
   ✅ Loaded Twitch configuration from file
   ```

## How It Works

### Automatic Fallback

The bot automatically detects whether it's running on Railway:

- **On Railway** (with volume): Uses `/data` directory for persistent storage
- **Locally**: Uses `./data` directory in the project folder

### File Storage

Configuration is stored in JSON format:

- **Location**: `$RAILWAY_VOLUME_MOUNT_PATH/twitch-data.json` or `./data/twitch-data.json`
- **Format**:

  ```json
  {
    "streamers": {
      "guildId": ["streamer1", "streamer2"]
    },
    "channels": {
      "guildId": "channelId"
    }
  }
  ```

## Verification

After deployment with a volume, you can verify persistence:

1. **Add a Twitch streamer** using the bot commands
2. **Check Railway logs** - you should see:

   ```text
   ✅ Saved Twitch configuration to /data/twitch-data.json
   ```

3. **Trigger a redeploy** (push a commit or manual redeploy)
4. **Check logs again** - configuration should be loaded:

   ```text
   ✅ Loaded Twitch configuration from file
   ```

5. **Verify** that your Twitch streamers are still monitored

## Troubleshooting

### Volume Not Working

**Symptom**: Configuration is lost after redeployment

**Solutions**:

1. Verify the environment variable `RAILWAY_VOLUME_MOUNT_PATH=/data` exists
2. Confirm the volume mount path is exactly `/data`
3. Check Railway logs for any volume mount errors
4. Ensure the volume was created before deployment

### Permission Errors

**Symptom**: Errors creating or writing to data directory

**Solutions**:

1. Railway volumes should have correct permissions by default
2. Check logs for specific permission errors
3. If persists, try recreating the volume

### Data Not Loading

**Symptom**: Bot starts but doesn't load previous configuration

**Solutions**:

1. Check if `twitch-data.json` exists in the volume:
   - Use Railway's file browser or SSH access
   - Path should be `/data/twitch-data.json`
2. Verify JSON format is valid
3. Check logs for parsing errors

## Volume Management

### Viewing Volume Data

Railway provides file browsing for volumes:

1. Go to your service → **Settings** → **Volumes**
2. Click on your volume
3. Browse files stored in the volume

### Backup

It's recommended to periodically backup your volume data:

1. Access volume through Railway dashboard
2. Download `twitch-data.json`
3. Store backup securely

### Deleting Volume

⚠️ **Warning**: Deleting a volume permanently removes all stored data

1. Go to **Settings** → **Volumes**
2. Click the volume you want to remove
3. Click **Delete Volume**
4. Confirm deletion

## Cost Considerations

Railway volumes have the following characteristics:

- **Free tier**: Includes some storage (check current Railway pricing)
- **Paid tier**: Additional storage available
- **Data transfer**: No additional charges for reading/writing

For this bot, storage needs are minimal (< 1MB typically).

## Advanced Configuration

### Custom Data Directory

If you need a different mount path:

1. Change the environment variable:

   ```env
   RAILWAY_VOLUME_MOUNT_PATH=/custom/path
   ```

2. Update the volume mount path in Railway settings to match
3. Redeploy the service

### Multiple Volumes

For advanced use cases, you can mount multiple volumes:

- Each volume needs a unique mount path
- Update bot code to use different paths for different data types

## Alternative Solutions

If Railway volumes aren't suitable, consider these alternatives:

### 1. Database Storage

- Use Railway's PostgreSQL or Redis
- Store configuration in database tables
- Requires code changes to implement

### 2. External Storage

- Use AWS S3, Google Cloud Storage, etc.
- Requires API integration and credentials
- More complex but more flexible

### 3. Environment Variables

- Store configuration as JSON in env vars
- Limited by variable size restrictions
- Not ideal for frequently changing data

## Summary

Railway volumes provide the simplest solution for persisting bot data:

- ✅ Easy to set up (2-3 minutes)
- ✅ Automatic persistence across deployments
- ✅ No code changes required
- ✅ Minimal cost
- ✅ Built-in file management tools

For most use cases, Railway volumes are the recommended approach.

---

## Support

If you encounter issues with Railway deployment:

1. Check Railway's [official documentation](https://docs.railway.app)
2. Review Railway's status page for service issues
3. Open an issue on this repository with Railway logs
4. Join Railway's Discord community for support
