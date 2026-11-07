/*
    /facepunchtoken - opens a private form where the Facepunch login token (JSON from the login page) is pasted.
    The token is stored in credentials/facepunch_tokens.json. Administrators only.
    A form is used instead of a command option so the token never shows up in the channel.
*/

const Discord = require('discord.js');
const Builder = require('@discordjs/builders');

const DiscordEmbeds = require('../discordTools/discordEmbeds.js');

module.exports = {
    name: 'facepunchtoken',

    getData(client, guildId) {
        return new Builder.SlashCommandBuilder()
            .setName('facepunchtoken')
            .setDescription('Set the Facepunch login token (administrators only).');
    },

    async execute(client, interaction) {
        const verifyId = Math.floor(100000 + Math.random() * 900000);
        client.logInteraction(interaction, verifyId, 'slashCommand');

        if (!await client.validatePermissions(interaction)) return;

        if (!client.isAdministrator(interaction)) {
            const str = client.intlGet(interaction.guildId, 'missingPermission');
            await client.interactionReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
            return;
        }

        const modal = new Discord.ModalBuilder()
            .setCustomId('FacepunchToken')
            .setTitle('Facepunch login token');
        modal.addComponents(new Discord.ActionRowBuilder().addComponents(
            new Discord.TextInputBuilder()
                .setCustomId('token')
                .setLabel('JSON z strony logowania lub sam token')
                .setStyle(Discord.TextInputStyle.Paragraph)
                .setRequired(true)));

        await interaction.showModal(modal);
    },
};
