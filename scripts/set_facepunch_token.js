/*
    Saves the Facepunch login token (needed for the companion socket) for a Steam account.

    Usage (from the bot folder):
        node scripts/set_facepunch_token.js <steamId> <token>
        node scripts/set_facepunch_token.js '<{"SteamId":"...","Token":"..."}>'
        node scripts/set_facepunch_token.js          (then paste the JSON and press Enter)
*/
const Companion = require('../src/util/companionSocket.js');

function save(steamId, token) {
    Companion.setToken(steamId, token);
    const exp = Companion.tokenExpiry(token);
    console.log(`Saved token for ${steamId}. Expires: ${exp ? exp.toISOString() : 'unknown'}`);
    console.log('No restart needed, the bot reads the token on every connect.');
}

const args = process.argv.slice(2);
if (args.length === 2) save(args[0], args[1]);
else {
    const handle = (text) => {
        try {
            const json = JSON.parse(text.trim());
            save(json.SteamId, json.Token);
        }
        catch (e) {
            console.log('Could not read that. Expected {"SteamId":"...","Token":"..."}');
            process.exit(1);
        }
    };
    if (args.length === 1) handle(args[0]);
    else {
        console.log('Paste the JSON from the login page and press Enter:');
        process.stdin.once('data', (d) => { handle(d.toString()); process.exit(0); });
    }
}
