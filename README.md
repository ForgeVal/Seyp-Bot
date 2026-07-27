# PC Optimization Ticket Bot

A Discord bot that posts a **"PC Optimization"** button. When a user clicks
it, the bot creates a private ticket channel visible only to that user and
your admin/support role.

## Setup

1. **Create the bot**
   - Go to https://discord.com/developers/applications → New Application
   - Bot tab → Add Bot → copy the **Token**
   - OAuth2 tab → copy the **Client ID**

2. **Invite the bot to your server**
   Use this URL (replace `CLIENT_ID`):
   ```
   https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot%20applications.commands
   ```
   (Permission `8` = Administrator, for simplicity. You can scope this down
   to just `Manage Channels`, `Manage Roles`, `View Channels`, `Send Messages`
   if you'd rather not grant Administrator.)

3. **Get your Admin Role ID and (optional) Category ID**
   - Enable Developer Mode: User Settings → Advanced → Developer Mode
   - Right-click your admin/support role → Copy Role ID
   - Right-click a category (optional) → Copy Category ID

4. **Configure environment variables**
   ```
   cp .env.example .env
   ```
   Fill in `DISCORD_TOKEN`, `CLIENT_ID`, `ADMIN_ROLE_ID`, and optionally
   `TICKET_CATEGORY_ID`.

5. **Install and run**
   ```
   npm install
   npm start
   ```

6. **Post the button**
   In any channel where you want the ticket prompt, run:
   ```
   /setup
   ```
   This posts the embed with the "PC Optimization" button. Anyone who
   clicks it gets their own private ticket channel.

## How it works

- Clicking **PC Optimization** creates a channel named `pc-optim-<username>`
  with permission overwrites so only the ticket creator and the configured
  admin role can view it (`@everyone` is denied access).
- Inside the ticket, a **Close Ticket** button deletes the channel after a
  short delay.
- If a user already has an open ticket, clicking the button again reuses
  the existing channel instead of creating a duplicate.

## Customizing

All the tunable bits live at the top of `index.js` in the `CONFIG` object:
channel naming, category placement, and the admin role. The embed text and
colors can be edited in `buildTicketPromptMessage()` and
`createTicketChannel()`.
