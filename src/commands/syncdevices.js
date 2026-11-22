/*
    /syncdevices - fetches the servers and devices (Smart Switch, Smart Alarm, Storage Monitor) that were paired
    recently from the Rust+ history (what app.playrust.com shows) and adds the ones the bot does not have yet.
    Needs the Facepunch login token (/facepunchtoken). Administrators only.
*/

const Builder = require('@discordjs/builders');

const DiscordEmbeds = require('../discordTools/discordEmbeds.js');

module.exports = {
    name: 'syncdevices',

    getData(client, guildId) {
        return new Builder.SlashCommandBuilder()
            .setName('syncdevices')
            .setDescription('Fetch recently paired servers and devices from the Rust+ history (administrators only).');
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

        await interaction.deferReply({ ephemeral: true });

        let str, failed = true;
        try {
            const result = await require('../util/FcmListener.js').syncPairingHistory(client, interaction.guild);

            if (result.error === 'noToken') {
                str = 'Brak tokenu Facepunch. Najpierw wklej go przez /facepunchtoken.';
            }
            else if (result.error) {
                str = 'Nie ustawiono konta (hoster) dla tego serwera Discord, najpierw dodaj dane logowania.';
            }
            else {
                failed = false;
                str = `Dodano: serwery ${result.servers}, przelaczniki ${result.switches}, ` +
                    `alarmy ${result.alarms}, monitory skrzynek ${result.storageMonitors}. ` +
                    `Pominieto (juz w bocie): ${result.existing}.`;
                if (result.noServer > 0) {
                    str += ` ${result.noServer} urzadzen bez serwera w bocie, sparuj ten serwer w grze i uruchom komende ` +
                        `jeszcze raz.`;
                }
                if (result.failed > 0) str += ` Bledy: ${result.failed}, szczegoly w logu.`;
                str += ' Historia Rust+ obejmuje tylko ostatnie dni, starsze urzadzenia trzeba sparowac w grze.';
            }
        }
        catch (e) {
            client.log('ERROR', `/syncdevices: ${e}`, 'error');
            str = `Nie udalo sie pobrac historii: ${e.message}`;
        }

        await client.interactionEditReply(interaction, DiscordEmbeds.getActionInfoEmbed(failed ? 1 : 0, str));
    },
};
