/*
    Finds a Rust server's game address (ip:port) through Steam's master server list, by server name.
    Needed because Facepunch's pairing notification no longer includes ip/port.
    Requires a free Steam Web API key in RPP_STEAM_API_KEY (https://steamcommunity.com/dev/apikey).
*/

const RUST_APP_ID = 252490;

/* Returns "connect ip:port" or null (no key, no match, ambiguous match or request failure). */
async function findConnectString(apiKey, serverName) {
    if (!apiKey || !serverName) return null;

    /* "\" separates filter parts in Steam's filter string, so it cannot be part of the name. */
    const namePart = serverName.replace(/\\/g, '*');
    const filter = `\\appid\\${RUST_APP_ID}\\name_match\\${namePart}`;
    const url = 'https://api.steampowered.com/IGameServersService/GetServerList/v1/' +
        `?key=${encodeURIComponent(apiKey)}&filter=${encodeURIComponent(filter)}&limit=20`;

    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return null;
        const servers = (await res.json())?.response?.servers ?? [];

        const exact = servers.filter(s => s.name === serverName);
        if (exact.length !== 1) return null;

        const ip = String(exact[0].addr).split(':')[0];
        const port = exact[0].gameport || String(exact[0].addr).split(':')[1];
        if (!ip || !port) return null;
        return `connect ${ip}:${port}`;
    }
    catch (e) {
        return null;
    }
}

module.exports = { findConnectString };
