/*
    /restartbot - restarts the bot process (administrators only).

    The command only exits the process. The bot comes back up if it is started
    through a loop or a process manager (see run.sh / pm2), otherwise it just stops.
*/

const Builder = require('@discordjs/builders');

const DiscordEmbeds = require('../discordTools/discordEmbeds.js');

module.exports = {
	name: 'restartbot',

	getData(client, guildId) {
		return new Builder.SlashCommandBuilder()
			.setName('restartbot')
			.setDescription('Restart the bot (administrators only).');
	},

	async execute(client, interaction) {
		const guildId = interaction.guildId;

		const verifyId = Math.floor(100000 + Math.random() * 900000);
		client.logInteraction(interaction, verifyId, 'slashCommand');

		if (!await client.validatePermissions(interaction)) return;

		if (!client.isAdministrator(interaction)) {
			const str = client.intlGet(guildId, 'missingPermission');
			await client.interactionReply(interaction, DiscordEmbeds.getActionInfoEmbed(1, str));
			client.log(client.intlGet(null, 'warningCap'), str);
			return;
		}

		await interaction.deferReply({ ephemeral: true });

		const str = 'Restarting the bot...';
		await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(0, str));
		client.log('INFO', `Restart requested by ${interaction.user.tag}`);

		/* Give Discord a moment to deliver the reply, then exit. A wrapper starts the bot again. */
		setTimeout(() => process.exit(0), 2000);
	},
};
