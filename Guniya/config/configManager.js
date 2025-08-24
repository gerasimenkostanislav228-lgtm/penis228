import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// абсолютний шлях до директорії, де лежить configManager.js
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// coins.json у тій самій теці
const CFG_PATH  = path.join(__dirname, 'coins.json');

let cache = null;
let mtime = 0;

export function loadConfig() {
    const stat = fs.statSync(CFG_PATH);
    if (!cache || stat.mtimeMs !== mtime) {
        cache = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
        mtime  = stat.mtimeMs;
    }
    return cache;
}

export function saveConfig(newCfg) {
    fs.writeFileSync(CFG_PATH, JSON.stringify(newCfg, null, 2));
    cache = newCfg;
    mtime = Date.now();
}
