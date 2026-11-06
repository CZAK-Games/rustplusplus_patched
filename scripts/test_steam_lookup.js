/*
    Tests the Steam server lookup.
    Usage: node scripts/test_steam_lookup.js <steamWebApiKey> "<exact server name>"
*/
const { findConnectString } = require('../src/util/steamServerLookup.js');
const [key, name] = process.argv.slice(2);
if (!key || !name) { console.log('Usage: node scripts/test_steam_lookup.js <key> "<server name>"'); process.exit(1); }
findConnectString(key, name).then(r => console.log(r ?? 'No unique match (or the request failed)'));
