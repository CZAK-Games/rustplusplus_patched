/*
    Copyright (C) 2022 Alexander Emanuelsson (alexemanuelol)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

    https://github.com/alexemanuelol/rustplusplus

*/

const Info = require('../structures/Info');
const InformationHandler = require('../handlers/informationHandler.js');
const MapMarkers = require('../structures/MapMarkers.js');
const SmartAlarmHandler = require('../handlers/smartAlarmHandler.js');
const SmartSwitchHandler = require('../handlers/smartSwitchHandler.js');
const StorageMonitorHandler = require('../handlers/storageMonitorHandler.js');
const Team = require('../structures/Team');
const TeamHandler = require('../handlers/teamHandler.js');
const Time = require('../structures/Time');
const TimeHandler = require('../handlers/timeHandler.js');
const VendingMachines = require('../handlers/vendingMachineHandler.js');

module.exports = {
    /*  A websocket can stay open while the server (or the Facepunch companion proxy in between) no longer answers.
        No 'close' event follows, so no reconnect would ever be scheduled and every poll just times out forever.
        After this many failed polls in a row the connection is dropped to force the normal reconnect. */
    MAX_POLL_FAILURES: 3,
    DISCONNECT_FALLBACK_MS: 5000,

    pollFailed: function (rustplus, client) {
        rustplus.pollFailures = (rustplus.pollFailures || 0) + 1;
        if (rustplus.pollFailures < module.exports.MAX_POLL_FAILURES || rustplus.isRecyclingConnection) return;

        rustplus.isRecyclingConnection = true;
        const socketState = rustplus.websocket ? rustplus.websocket.readyState : 'none';
        rustplus.log(client.intlGet(null, 'errorCap'),
            `No valid response from the server for ${rustplus.pollFailures} polls in a row, reconnecting ` +
            `(websocket state: ${socketState}).`, 'error');

        /*  Terminates the websocket, which emits 'close' -> 'disconnected' -> the normal reconnect path.
            An already closed socket (state 3) never emits 'close' again, so there the fallback runs right away. */
        const alreadyClosed = !rustplus.websocket || rustplus.websocket.readyState >= 2;
        try { rustplus.disconnect(); }
        catch (e) {
            rustplus.log(client.intlGet(null, 'errorCap'), `disconnect() failed: ${e}`, 'error');
        }

        /*  Do not rely on that 'close' event alone. If it never arrives (nothing to terminate, or the socket
            never reports closing) no reconnect would ever be scheduled and the bot stays dead. After a short
            grace period run the disconnected handler ourselves; it ignores a second call. */
        setTimeout(() => {
            if (rustplus.disconnectedHandled || rustplus.isDeleted) return;

            rustplus.log(client.intlGet(null, 'errorCap'),
                'The connection did not report that it closed, forcing the reconnect.', 'error');
            rustplus.emit('disconnected');
        }, alreadyClosed ? 0 : module.exports.DISCONNECT_FALLBACK_MS);

        /*  Last resort: if this instance is still the registered one a minute later, nothing scheduled a reconnect
            (the disconnected handler failed half way, for example). Reset the guard and run it again. */
        setTimeout(() => {
            if (rustplus.isDeleted) return;
            if (client.rustplusInstances[rustplus.guildId] !== rustplus) return;

            rustplus.log(client.intlGet(null, 'errorCap'),
                'Still no reconnect after 60s, forcing it again.', 'error');
            rustplus.disconnectedHandled = false;
            rustplus.emit('disconnected');
        }, 60 * 1000);
    },

    pollingHandler: async function (rustplus, client) {
        if (rustplus.isRecyclingConnection) return;

        /* Poll information such as info, mapMarkers, teamInfo and time */
        let info = await rustplus.getInfoAsync();
        if (!(await rustplus.isResponseValid(info))) return module.exports.pollFailed(rustplus, client);
        let mapMarkers = await rustplus.getMapMarkersAsync();
        if (!(await rustplus.isResponseValid(mapMarkers))) return module.exports.pollFailed(rustplus, client);
        let teamInfo = await rustplus.getTeamInfoAsync();
        if (!(await rustplus.isResponseValid(teamInfo))) return module.exports.pollFailed(rustplus, client);
        let time = await rustplus.getTimeAsync();
        if (!(await rustplus.isResponseValid(time))) return module.exports.pollFailed(rustplus, client);

        rustplus.pollFailures = 0;

        if (rustplus.isFirstPoll) {
            rustplus.info = new Info(info.info);
            rustplus.time = new Time(time.time, rustplus, client);
            rustplus.team = new Team(teamInfo.teamInfo, rustplus);
            rustplus.mapMarkers = new MapMarkers(mapMarkers.mapMarkers, rustplus, client);
            rustplus.restorePersistentRuntimeState();
        }

        await module.exports.handlers(rustplus, client, info, mapMarkers, teamInfo, time);
        rustplus.isFirstPoll = false;
    },

    handlers: async function (rustplus, client, info, mapMarkers, teamInfo, time) {
        await TeamHandler.handler(rustplus, client, teamInfo.teamInfo);
        rustplus.team.updateTeam(teamInfo.teamInfo);

        await SmartSwitchHandler.handler(rustplus, client, time.time);
        TimeHandler.handler(rustplus, client, time.time);
        await VendingMachines.handler(rustplus, client, mapMarkers.mapMarkers);

        rustplus.time.updateTime(time.time);
        rustplus.info.updateInfo(info.info);
        rustplus.mapMarkers.updateMapMarkers(mapMarkers.mapMarkers);

        await InformationHandler.handler(rustplus);
        await StorageMonitorHandler.handler(rustplus, client);
        await SmartAlarmHandler.handler(rustplus, client);
    },
};
