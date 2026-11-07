/*
    Facepunch closed the direct Rust+ socket (ws://ip:port). Servers are now reached through
    wss://companion-rust.facepunch.com/socket/{serverUuid}, authenticated with the Facepunch login token
    (sent as WebSocket subprotocols). The protobuf payload is unchanged.

    New-style servers are stored with serverIp = server UUID (pairing "id") and appPort = 0.
    Old-style servers (real ip + port) keep using the library's own connect().
*/

const Fs = require('fs');
const Path = require('path');
const WebSocket = require('ws');
const Protobuf = require('protobufjs');

const TOKEN_FILE = Path.join(__dirname, '..', '..', 'credentials', 'facepunch_tokens.json');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isCompanionId(value) {
    return typeof value === 'string' && UUID_REGEX.test(value);
}

/*  Key used in serverList. Discord limits button ids to 100 characters and the bot packs the server id and
    entity id into them, so a full UUID is too long: new-style servers get the first 12 hex characters of it. */
function getServerId(server, port) {
    if (isCompanionId(server)) return server.replace(/-/g, '').slice(0, 12);
    return `${server}-${port}`;
}

function getServerIdFromBody(body) {
    if (body.ip) return getServerId(body.ip, body.port);
    return getServerId(body.id, 0);
}

function readTokens() {
    try {
        return JSON.parse(Fs.readFileSync(TOKEN_FILE, 'utf8'));
    }
    catch (e) {
        return {};
    }
}

function getToken(steamId) {
    return readTokens()[String(steamId)] ?? null;
}

function setToken(steamId, token) {
    const tokens = readTokens();
    tokens[String(steamId)] = token;
    Fs.mkdirSync(Path.dirname(TOKEN_FILE), { recursive: true });
    Fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

function tokenExpiry(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString('utf8'));
        return payload.exp ? new Date(payload.exp * 1000) : null;
    }
    catch (e) {
        return null;
    }
}

const base64Url = (text) => Buffer.from(text, 'utf8').toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/*  Replaces instance.connect() so it uses the companion socket when instance.server is a server UUID.
    Mirrors the library's connect(), only the websocket creation differs. */
function applyCompanionConnect(instance) {
    if (!isCompanionId(instance.server)) return;

    instance.connect = function () {
        const protoPath = Path.join(Path.dirname(require.resolve('@liamcottle/rustplus.js')), 'rustplus.proto');

        Protobuf.load(protoPath).then((root) => {
            if (this.websocket) this.disconnect();

            this.AppRequest = root.lookupType('rustplus.AppRequest');
            this.AppMessage = root.lookupType('rustplus.AppMessage');

            this.emit('connecting');

            const token = getToken(this.playerId);
            if (!token) {
                this.emit('error', new Error(`No Facepunch login token for steamId ${this.playerId}, ` +
                    `run: node scripts/set_facepunch_token.js`));
                return;
            }

            this.websocket = new WebSocket(`${process.env.COMPANION_SOCKET_HOST || "wss://companion-rust.facepunch.com"}/socket/${this.server}`,
                ['rustplus.auth.v1', base64Url(token)]);

            this.websocket.on('open', () => this.emit('connected'));
            this.websocket.on('error', (e) => this.emit('error', e));
            this.websocket.on('unexpected-response', (req, res) => {
                this.emit('error', new Error(`Facepunch companion socket rejected the connection ` +
                    `(HTTP ${res.statusCode}), the login token may have expired`));
            });

            this.websocket.on('message', (data) => {
                const message = this.AppMessage.decode(data);

                if (message.response && message.response.seq && this.seqCallbacks[message.response.seq]) {
                    const callback = this.seqCallbacks[message.response.seq];
                    const result = callback(message);
                    delete this.seqCallbacks[message.response.seq];
                    if (result) return;
                }

                this.emit('message', this.AppMessage.decode(data));
            });

            this.websocket.on('close', () => this.emit('disconnected'));
        });
    };
}

/*  Accepts the login page's JSON ({"SteamId":"..","Token":".."}) or just the token itself.
    Returns { steamId, expires } or null when the text is not a valid token. */
function saveTokenFromText(text) {
    let token = String(text).trim();
    let steamId = null;
    try {
        const json = JSON.parse(token);
        token = json.Token ?? json.token ?? '';
        steamId = json.SteamId ?? json.steamId ?? null;
    }
    catch (e) { /* not JSON, treat as the raw token */ }

    token = String(token).trim();
    let payload;
    try {
        payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString('utf8'));
    }
    catch (e) {
        return null;
    }
    steamId = String(steamId ?? payload.steamId ?? '');
    if (!/^\d{17}$/.test(steamId) || !payload.exp) return null;

    setToken(steamId, token);
    return { steamId: steamId, expires: new Date(payload.exp * 1000) };
}

const REMIND_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REMIND_EVERY_MS = 24 * 60 * 60 * 1000;
const lastReminder = {};

/*  Posts a reminder in the servers channel when a Facepunch login token expires within 3 days (or already has).
    Repeats at most once per 24h per account. */
async function checkTokenExpiry(client) {
    const InstanceUtils = require('./instanceUtils.js');
    const DiscordTools = require('../discordTools/discordTools.js');

    for (const [steamId, token] of Object.entries(readTokens())) {
        const exp = tokenExpiry(token);
        if (!exp) continue;
        const left = exp.getTime() - Date.now();
        if (left > REMIND_BEFORE_MS) continue;
        if (Date.now() - (lastReminder[steamId] ?? 0) < REMIND_EVERY_MS) continue;

        for (const guild of client.guilds.cache.values()) {
            const credentials = InstanceUtils.readCredentialsFile(guild.id);
            if (!Object.keys(credentials).includes(steamId)) continue;

            const instance = client.getInstance(guild.id);
            const channel = DiscordTools.getTextChannelById(guild.id, instance.channelId.servers);
            if (!channel) continue;

            const when = exp.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
            const text = left > 0
                ? `Token logowania Facepunch (Steam ${steamId}) wygasa ${when}.`
                : `Token logowania Facepunch (Steam ${steamId}) wygasl ${when}, bot nie polaczy sie z serwerami.`;
            await client.messageSend(channel, {
                content: `${text} Zaloguj sie ponownie i uruchom na serwerze: node scripts/set_facepunch_token.js`
            });
            lastReminder[steamId] = Date.now();
        }
    }
}

function startExpiryReminder(client) {
    const run = () => checkTokenExpiry(client).catch(e => client.log('ERROR', `token expiry check: ${e}`, 'error'));
    run();
    return setInterval(run, CHECK_INTERVAL_MS);
}

module.exports = { getServerId, saveTokenFromText, startExpiryReminder, isCompanionId, getServerIdFromBody, getToken, setToken, tokenExpiry, applyCompanionConnect };
