/*
    Two sources on companion-rust.facepunch.com that the Rust+ web app (app.playrust.com) uses, both read with the
    Facepunch login token:

    - POST /api/syncData, body {"AuthToken": ".."}  ->  { payload: "<json string>", version: N } (204 when empty)
      The whole app state of the account: servers, and per server the devices (entityCategories -> entities, with the
      names given in the app). The bot only ever reads it, it never writes (PUT) so the app state is never touched.
    - POST /api/history/read, body {"AuthToken": ".."}  ->  array of the latest notifications of the account.
      Holds the pairing notifications (servers and devices) of the last days, same data the phone receives.

    Both are turned into the "body" objects the FCM pairing handlers in FcmListener.js already understand.
*/

const Https = require('https');

const API_HOST = process.env.COMPANION_API_HOST || 'companion-rust.facepunch.com';
const ENTITY_NAMES = { 1: 'Smart Switch', 2: 'Smart Alarm', 3: 'Storage Monitor' };

/*  Resolves to { status, json } (json is null for an empty body). Rejects on network errors and non 2xx. */
function postJson(path, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = Https.request({
            hostname: API_HOST,
            path: path,
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 15000
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    const hint = (res.statusCode === 401 || res.statusCode === 403) ?
                        ', the login token may have expired' : '';
                    return reject(new Error(`${path} HTTP ${res.statusCode}${hint}`));
                }
                if (res.statusCode === 204 || text.trim() === '') return resolve({ status: res.statusCode, json: null });
                try {
                    resolve({ status: res.statusCode, json: JSON.parse(text) });
                }
                catch (e) {
                    reject(new Error(`${path} returned invalid JSON`));
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error(`${path} timed out`)));
        req.on('error', reject);
        req.end(payload);
    });
}

/*  Resolves to an array of notifications ({ notificationId, date, serverId, title, body, data, channel }). */
async function fetchHistory(token) {
    const response = await postJson('/api/history/read', { AuthToken: token });
    return Array.isArray(response.json) ? response.json : [];
}

/*  Resolves to { payload, version } or null when the account has no saved app state. */
async function fetchAppState(token) {
    const response = await postJson('/api/syncData', { AuthToken: token });
    return response.json;
}

/*  protobuf 64 bit values are saved as { low, high } (signed 32 bit halves). */
function longToString(value) {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'object') return String(value);
    return ((BigInt(value.high >>> 0) << 32n) | BigInt(value.low >>> 0)).toString();
}

/*  Picks the newest pairing of every server and device of one Steam account out of the notification history.
    Returns { servers: [...], entities: [...] }, each item being { id, title, body, data } where data is the parsed
    pairing body, as the FCM listener receives it. */
function extractPairings(history, steamId) {
    const pairings = [];
    for (const notification of history) {
        let data;
        try {
            data = JSON.parse(notification.data);
        }
        catch (e) {
            continue;
        }
        if (!data || String(data.playerId) !== String(steamId)) continue;
        if (data.type !== 'server' && !(data.type === 'entity' && data.entityId)) continue;

        pairings.push({
            id: Number(notification.notificationId),
            title: notification.title,
            body: notification.body,
            data: data
        });
    }
    pairings.sort((a, b) => a.id - b.id);

    const servers = new Map();
    const entities = new Map();
    for (const pairing of pairings) {
        if (pairing.data.type === 'server') servers.set(pairing.data.id, pairing);
        else entities.set(`${pairing.data.id}/${pairing.data.entityId}`, pairing);
    }

    return { servers: [...servers.values()], entities: [...entities.values()] };
}

/*  Same output as extractPairings, from the app state (fetchAppState). Devices carry customName, the name given
    in the app. Only servers of this Steam account are used. */
function extractAppState(state, steamId) {
    const result = { servers: [], entities: [] };
    if (!state || typeof state.payload !== 'string') return result;

    let model;
    try {
        model = JSON.parse(state.payload);
    }
    catch (e) {
        return result;
    }

    for (const server of model.servers ?? []) {
        if (longToString(server.playerId) !== String(steamId)) continue;

        const base = {
            id: server.id,
            name: server.name,
            desc: server.desc ?? '',
            img: server.headerImage ?? '',
            logo: server.logoImage ?? '',
            url: server.url ?? '',
            playerId: String(steamId),
            playerToken: String(server.playerToken)
        };
        result.servers.push({ id: 0, title: server.name, body: '', data: { ...base, type: 'server' } });

        for (const category of server.entityCategories ?? []) {
            for (const entity of category.entities ?? []) {
                const entityName = ENTITY_NAMES[entity.type];
                if (!entityName) continue;

                result.entities.push({
                    id: 0,
                    title: entityName,
                    body: '',
                    data: {
                        ...base,
                        entityId: longToString(entity.entityId),
                        entityType: String(entity.type),
                        entityName: entityName,
                        customName: entity.name || undefined,
                        type: 'entity'
                    }
                });
            }
        }
    }

    return result;
}

module.exports = { fetchHistory, fetchAppState, extractPairings, extractAppState, longToString };
