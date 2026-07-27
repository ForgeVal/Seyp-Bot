// PC Optimization Ticket Bot
// -----------------------------------------------------------------------
// Features:
//   /setup            -> posts an embed with a "PC Optimization" button
//   Button click       -> creates a private ticket channel (creator + admin
//                         role only), with a "Close Ticket" button inside
//   Close button        -> archives/deletes the ticket channel
//
// Requires: discord.js v14, Node 18+
// -----------------------------------------------------------------------

const {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  REST,
  Routes,
} = require('discord.js');

require('dotenv').config();

// ---------------------------------------------------------------------
// CONFIG - edit these to match your server
// ---------------------------------------------------------------------
const CONFIG = {
  // Category new ticket channels get created under (optional, set to null to skip)
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || null,

  // Role ID that should be able to see every ticket (your support/admin role)
  ADMIN_ROLE_ID: process.env.ADMIN_ROLE_ID,

  // Custom IDs used internally - no need to change
  OPEN_BUTTON_ID: 'open_pc_optimization_ticket',
  CLOSE_BUTTON_ID: 'close_pc_optimization_ticket',
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

// ---------------------------------------------------------------------
// Slash command: /setup
// Posts the embed + button in whatever channel it's run in.
// ---------------------------------------------------------------------
const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Post the PC Optimization ticket button in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
  console.log('Slash commands registered.');
}

// ---------------------------------------------------------------------
// Helper: build the initial embed + button message
// ---------------------------------------------------------------------
function buildTicketPromptMessage() {
  const embed = new EmbedBuilder()
    .setTitle('PC Optimization Support')
    .setDescription(
      'Need help optimizing your PC? Click the button below to open a ' +
      'private ticket. Only you and our admins will be able to see it.'
    )
    .setColor(0x5865f2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CONFIG.OPEN_BUTTON_ID)
      .setLabel('PC Optimization')
      .setEmoji('🛠️')
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

// ---------------------------------------------------------------------
// Helper: create a private ticket channel for a given user
// ---------------------------------------------------------------------
async function createTicketChannel(guild, member) {
  // Avoid duplicate open tickets for the same user
  const existing = guild.channels.cache.find(
    (c) => c.topic === `pc-optimization-ticket:${member.id}`
  );
  if (existing) return existing;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  if (CONFIG.ADMIN_ROLE_ID) {
    overwrites.push({
      id: CONFIG.ADMIN_ROLE_ID,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: `pc-optim-${member.user.username}`.toLowerCase().slice(0, 90),
    type: ChannelType.GuildText,
    parent: CONFIG.TICKET_CATEGORY_ID || undefined,
    topic: `pc-optimization-ticket:${member.id}`,
    permissionOverwrites: overwrites,
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CONFIG.CLOSE_BUTTON_ID)
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );

  const introEmbed = new EmbedBuilder()
    .setTitle('PC Optimization Ticket')
    .setDescription(
      `Hi <@${member.id}>, thanks for opening a ticket! ` +
      'Please describe your PC specs and the issue you\'re running into, ' +
      'and an admin will be with you shortly.'
    )
    .setColor(0x57f287);

  await channel.send({
    content: CONFIG.ADMIN_ROLE_ID ? `<@&${CONFIG.ADMIN_ROLE_ID}>` : undefined,
    embeds: [introEmbed],
    components: [closeRow],
  });

  return channel;
}

// ---------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    // /setup command
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
      await interaction.reply(buildTicketPromptMessage());
      return;
    }

    // Open ticket button
    if (interaction.isButton() && interaction.customId === CONFIG.OPEN_BUTTON_ID) {
      await interaction.deferReply({ ephemeral: true });
      const channel = await createTicketChannel(interaction.guild, interaction.member);
      await interaction.editReply({
        content: `Your ticket has been created: ${channel}`,
      });
      return;
    }

    // Close ticket button
    if (interaction.isButton() && interaction.customId === CONFIG.CLOSE_BUTTON_ID) {
      await interaction.reply('Closing this ticket in 5 seconds...');
      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 5000);
      return;
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (interaction.isRepliable()) {
      const payload = { content: 'Something went wrong. Please try again.', ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
});

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
(async () => {
  await registerCommands();
  await client.login(process.env.DISCORD_TOKEN);
})();
