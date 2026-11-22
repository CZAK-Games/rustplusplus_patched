/*
    The Rust+ web app (app.playrust.com) shows the notification history of an account. It is read with
    POST https://companion-rust.facepunch.com/api/history/read, body {"AuthToken": "<Facepunch login token>"}.
    The history holds the pairing notifications (servers and devices) of the last days, with the same data the
    phone receives when a server or a device is paired, so servers and devices can be rebuilt from it.
*/

const Https = require('https');

const API_HOST = process.env.COMPANION_API_HOST || 'companion-rust.facepunch.com';

/*  Resolves to an array of notifications ({ notificationId, date, serverId, title, body, data, channel }). */
function fetchHistory(token) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ AuthToken: token });
        const req = Https.request({
            hostname: API_HOST,
            path: '/api/history/read',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 15000
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    const hint = (res.statusCode === 401 || res.statusCode === 403) ?
                        ', the login token may have expired' : '';
                    return reject(new Error(`history/read HTTP ${res.statusCode}${hint}`));
                }
                try {
                    const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    resolve(Array.isArray(json) ? json : []);
                }
                catch (e) {
                    reject(new Error('history/read returned invalid JSON'));
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error('history/read timed out')));
        req.on('error', reject);
        req.end(payload);
    });
}

/*  Picks the server and device pairings of one Steam account out of the history. Only the newest pairing of every
    server and of every device is kept. Returns { servers: [...], entities: [...] }, each item being
    { id, title, body, data } where data is the parsed pairing body, as the FCM listener receives it. */
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

module.exports = { fetchHistory, extractPairings };
