// PC Optimization Ticket Bot
// -----------------------------------------------------------------------
// Features:
//   /setup             -> posts an embed with two buttons:
//                          "PC Optimization" and "Other PC Services"
//   Button click        -> creates a private ticket channel (creator + admin
//                          role only), with a "Close Ticket" button inside
//   Close button         -> deletes the ticket channel after a short delay
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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  REST,
  Routes,
} = require('discord.js');

const fs = require('fs');
require('dotenv').config();

// ---------------------------------------------------------------------
// CONFIG - edit these to match your server
// ---------------------------------------------------------------------
const CONFIG = {
  // Category new ticket channels get created under (optional, set to null to skip)
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || null,

  // Role ID that should be able to see every ticket (your support/admin role)
  ADMIN_ROLE_ID: process.env.ADMIN_ROLE_ID,

  CLOSE_BUTTON_ID: 'close_ticket',
  SPECS_BUTTON_ID: 'submit_pc_specs',
  SPECS_MODAL_ID: 'pc_specs_modal',
  PAYMENT_SELECT_ID: 'payment_method_select',

  // Pricing
  BASE_PRICE_PHP: 250,
  PAYPAL_PRICE_PHP: 265,
  PAYPAL_EMAIL: 'saif282005@gmail.com',
};

// ---------------------------------------------------------------------
// Ticket type definitions - add more entries here for more buttons
// ---------------------------------------------------------------------
const TICKET_TYPES = {
  pc_optimization: {
    buttonId: 'open_pc_optimization_ticket',
    buttonLabel: 'PC Optimization',
    buttonEmoji: '🛠️',
    buttonStyle: ButtonStyle.Primary,
    channelPrefix: 'pc-optim',
    topicPrefix: 'pc-optimization-ticket',
    ticketTitle: 'PC Optimization Ticket',
    ticketIntro:
      `This is a paid service — **₱${CONFIG.BASE_PRICE_PHP}** (PayPal: ₱${CONFIG.PAYPAL_PRICE_PHP}, includes a processing fee). ` +
      'Please choose a payment method from the dropdown below, complete payment, ' +
      'then send a screenshot of your payment as proof. Once that\'s done, click ' +
      '**Submit PC Specs** below to fill out your PC details so we can get started.',
    specsForm: true,
    paymentRequired: true,
  },
  other_pc_services: {
    buttonId: 'open_other_pc_services_ticket',
    buttonLabel: 'Other PC Services',
    buttonEmoji: '🖥️',
    buttonStyle: ButtonStyle.Secondary,
    channelPrefix: 'pc-other',
    topicPrefix: 'other-pc-services-ticket',
    ticketTitle: 'Other PC Services Ticket',
    ticketIntro:
      'Please describe what you need help with, and an admin will be ' +
      'with you shortly.',
  },
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

// ---------------------------------------------------------------------
// Slash command: /setup
// Posts the embed + buttons in whatever channel it's run in.
// ---------------------------------------------------------------------
const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Post the PC support ticket buttons in this channel')
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
// Helper: build the initial embed + buttons message
// ---------------------------------------------------------------------
function buildTicketPromptMessage() {
  const embed = new EmbedBuilder()
    .setTitle('PC Support')
    .setDescription(
      'Need help with your PC? Click a button below to open a private ' +
      'ticket. Only you and our admins will be able to see it.'
    )
    .setColor(0x5865f2);

  const row = new ActionRowBuilder().addComponents(
    ...Object.values(TICKET_TYPES).map((type) =>
      new ButtonBuilder()
        .setCustomId(type.buttonId)
        .setLabel(type.buttonLabel)
        .setEmoji(type.buttonEmoji)
        .setStyle(type.buttonStyle)
    )
  );

  return { embeds: [embed], components: [row] };
}

// ---------------------------------------------------------------------
// Helper: create a private ticket channel for a given user + ticket type
// ---------------------------------------------------------------------
async function createTicketChannel(guild, member, type) {
  // Avoid duplicate open tickets of this type for the same user
  const existing = guild.channels.cache.find(
    (c) => c.topic === `${type.topicPrefix}:${member.id}`
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
    name: `${type.channelPrefix}-${member.user.username}`.toLowerCase().slice(0, 90),
    type: ChannelType.GuildText,
    parent: CONFIG.TICKET_CATEGORY_ID || undefined,
    topic: `${type.topicPrefix}:${member.id}`,
    permissionOverwrites: overwrites,
  });

  const actionButtons = [
    new ButtonBuilder()
      .setCustomId(CONFIG.CLOSE_BUTTON_ID)
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  ];

  if (type.specsForm) {
    actionButtons.unshift(
      new ButtonBuilder()
        .setCustomId(CONFIG.SPECS_BUTTON_ID)
        .setLabel('Submit PC Specs')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Success)
    );
  }

  const actionRow = new ActionRowBuilder().addComponents(...actionButtons);

  const components = type.paymentRequired
    ? [buildPaymentSelectRow(), actionRow]
    : [actionRow];

  const introEmbed = new EmbedBuilder()
    .setTitle(type.ticketTitle)
    .setDescription(`Hi <@${member.id}>, thanks for opening a ticket! ${type.ticketIntro}`)
    .setColor(0x57f287);

  await channel.send({
    content: CONFIG.ADMIN_ROLE_ID ? `<@&${CONFIG.ADMIN_ROLE_ID}>` : undefined,
    embeds: [introEmbed],
    components,
  });

  return channel;
}

// ---------------------------------------------------------------------
// Helper: build the payment method dropdown
// ---------------------------------------------------------------------
function buildPaymentSelectRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId(CONFIG.PAYMENT_SELECT_ID)
    .setPlaceholder('Choose a payment method')
    .addOptions(
      { label: 'GCash', value: 'gcash', description: `₱${CONFIG.BASE_PRICE_PHP}`, emoji: '💙' },
      { label: 'Maya', value: 'maya', description: `₱${CONFIG.BASE_PRICE_PHP}`, emoji: '💚' },
      { label: 'PayPal', value: 'paypal', description: `₱${CONFIG.PAYPAL_PRICE_PHP} (incl. fee)`, emoji: '💛' }
    );

  return new ActionRowBuilder().addComponents(select);
}

// ---------------------------------------------------------------------
// Helper: build the PC specs modal (max 5 fields per Discord modal, so
// closely related items are paired up)
// ---------------------------------------------------------------------
function buildSpecsModal() {
  const modal = new ModalBuilder()
    .setCustomId(CONFIG.SPECS_MODAL_ID)
    .setTitle('PC Specs Form');

  const fields = [
    { id: 'processor', label: 'Processor (Intel / AMD)', style: TextInputStyle.Short },
    { id: 'gpu', label: 'GPU (NVIDIA / AMD)', style: TextInputStyle.Short },
    { id: 'ram_motherboard', label: 'RAM (8GB/16GB) & Motherboard', style: TextInputStyle.Short },
    { id: 'os_refresh', label: 'OS (Win 10/11) & Monitor Refresh Rate', style: TextInputStyle.Short },
    { id: 'problem', label: 'PC Problem', style: TextInputStyle.Paragraph },
  ];

  const rows = fields.map((f) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(f.id)
        .setLabel(f.label)
        .setStyle(f.style)
        .setRequired(true)
    )
  );

  modal.addComponents(...rows);
  return modal;
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
      await interaction.channel.send(buildTicketPromptMessage());
      await interaction.reply({ content: 'Ticket panel posted.', ephemeral: true });
      return;
    }

    // Open ticket buttons (any type)
    if (interaction.isButton()) {
      const type = Object.values(TICKET_TYPES).find(
        (t) => t.buttonId === interaction.customId
      );
      if (type) {
        await interaction.deferReply({ ephemeral: true });
        const channel = await createTicketChannel(interaction.guild, interaction.member, type);
        await interaction.editReply({
          content: `Your ticket has been created: ${channel}`,
        });
        return;
      }

      // Close ticket button
      if (interaction.customId === CONFIG.CLOSE_BUTTON_ID) {
        await interaction.reply('Closing this ticket in 5 seconds...');
        setTimeout(() => {
          interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // Submit PC Specs button -> open the modal form
      if (interaction.customId === CONFIG.SPECS_BUTTON_ID) {
        await interaction.showModal(buildSpecsModal());
        return;
      }
    }

    // Payment method dropdown selected
    if (interaction.isStringSelectMenu() && interaction.customId === CONFIG.PAYMENT_SELECT_ID) {
      const choice = interaction.values[0];

      if (choice === 'gcash') {
        const attachment = new AttachmentBuilder('./assets/gcash-qr.png', { name: 'gcash-qr.png' });
        const embed = new EmbedBuilder()
          .setTitle('GCash Payment')
          .setDescription(`Amount: **₱${CONFIG.BASE_PRICE_PHP}**\nScan the QR code below to pay.`)
          .setImage('attachment://gcash-qr.png')
          .setColor(0x0072ce);
        await interaction.reply({ embeds: [embed], files: [attachment], ephemeral: true });
        return;
      }

      if (choice === 'maya') {
        const embed = new EmbedBuilder()
          .setTitle('Maya Payment')
          .setColor(0x00b140);

        const mayaQrExists = fs.existsSync('./assets/maya-qr.png');
        if (mayaQrExists) {
          const attachment = new AttachmentBuilder('./assets/maya-qr.png', { name: 'maya-qr.png' });
          embed
            .setDescription(`Amount: **₱${CONFIG.BASE_PRICE_PHP}**\nScan the QR code below to pay.`)
            .setImage('attachment://maya-qr.png');
          await interaction.reply({ embeds: [embed], files: [attachment], ephemeral: true });
        } else {
          embed.setDescription(
            `Amount: **₱${CONFIG.BASE_PRICE_PHP}**\n` +
            'Maya QR is not set up yet — please contact an admin for payment details.'
          );
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        return;
      }

      if (choice === 'paypal') {
        const embed = new EmbedBuilder()
          .setTitle('PayPal Payment')
          .setDescription(
            `Send **₱${CONFIG.PAYPAL_PRICE_PHP}** (includes a small processing fee) to:\n` +
            `**${CONFIG.PAYPAL_EMAIL}**`
          )
          .setColor(0x003087);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
    }

    // PC specs modal submitted
    if (interaction.isModalSubmit() && interaction.customId === CONFIG.SPECS_MODAL_ID) {
      const processor = interaction.fields.getTextInputValue('processor');
      const gpu = interaction.fields.getTextInputValue('gpu');
      const ramMobo = interaction.fields.getTextInputValue('ram_motherboard');
      const osRefresh = interaction.fields.getTextInputValue('os_refresh');
      const problem = interaction.fields.getTextInputValue('problem');

      const specsEmbed = new EmbedBuilder()
        .setTitle('PC Specs Submitted')
        .setColor(0x5865f2)
        .addFields(
          { name: 'Processor', value: processor },
          { name: 'GPU', value: gpu },
          { name: 'RAM & Motherboard', value: ramMobo },
          { name: 'OS & Monitor Refresh Rate', value: osRefresh },
          { name: 'PC Problem', value: problem }
        )
        .setFooter({ text: `Submitted by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [specsEmbed] });
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
