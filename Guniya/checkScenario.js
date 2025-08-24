import TelegramBot      from 'node-telegram-bot-api';
import { spawn }        from 'child_process';
import path             from 'path';
import { fileURLToPath } from 'url';
import { loadConfig }   from '../config/configManager.js';
import fs               from 'fs';

// ─── Налаштування ───────────────────────────────────────────
const TOKEN    = ''; // ваш токен
const OWNER_ID = ;                                       // ваш ID

// ─── Ініціалізація бота ──────────────────────────────────────
const bot     = new TelegramBot(TOKEN, { polling: true });
const sendDM  = (txt, opts) => bot.sendMessage(OWNER_ID, txt, opts).catch(()=>{});
const isAdmin = id => id === OWNER_ID;

// ─── Шлях до core (index.js) ─────────────────────────────────
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const coreDir    = path.join(__dirname, '..');
const coreScript = path.join(coreDir, 'index.js');
let coreProc;

function killCore(pid) {
    if (!pid) return;
    try {
        process.platform === 'win32'
            ? spawnSync('taskkill', ['/PID', pid, '/T', '/F'])
            : process.kill(-pid, 'SIGKILL');
    } catch {}
}

function startCore() {
    if (!fs.existsSync(coreScript)) {
        console.error(`⛔️ core не знайдено: ${coreScript}`);
        return;
    }
    if (coreProc && !coreProc.killed) killCore(coreProc.pid);
    coreProc = spawn(process.execPath, [coreScript], {
        cwd: coreDir,
        detached: false,
        stdio: 'inherit'
    });
    console.log(`✅ core запущено (pid ${coreProc.pid})`);
    coreProc.on('exit', code => console.log(`⚠️ core завершився (code ${code})`));
}

// Запускаємо core одразу
startCore();

// ─── Команди бота ───────────────────────────────────────────
// /id
bot.onText(/^\/id$/i, msg => {
    if (!isAdmin(msg.from.id)) return;
    sendDM(`Ваш Telegram-ID: ${msg.from.id}`);
});

// /start
bot.onText(/^\/start$/i, msg => {
    if (!isAdmin(msg.from.id)) return;
    sendDM('Меню команд:', {
        reply_markup: {
            keyboard: [['/list', '/check'], ['/get <KEY>', '/set <KEY>\n<JSON>'], ['/delete <KEY>', '/restart']],
            resize_keyboard: true
        }
    });
});

// /list
bot.onText(/^\/list$/i, msg => {
    if (!isAdmin(msg.from.id)) return;
    const keys = Object.keys(loadConfig());
    sendDM(keys.length ? keys.join('\n') : '⛔️ Сценарії відсутні');
});

// /get KEY
bot.onText(/^\/get (\S+)$/i, (msg, [, key]) => {
    if (!isAdmin(msg.from.id)) return;
    const data = loadConfig()[key];
    sendDM(
        data
            ? '```' + JSON.stringify(data, null, 2) + '```'
            : `⛔️ Сценарій "${key}" не знайдено`,
        { parse_mode: 'Markdown' }
    );
});

// /set KEY\nJSON
bot.onText(/^\/set (\S+)\n([\s\S]+)$/i, (msg, [, key, json]) => {
    if (!isAdmin(msg.from.id)) return;
    let obj;
    try { obj = JSON.parse(json); } catch {
        return sendDM('⛔️ JSON невалидний');
    }
    const cfg = loadConfig();
    cfg[key] = obj;
    import('../config/configManager.js').then(m => m.saveConfig(cfg));
    sendDM(`✅ Сценарій "${key}" збережено`);
});

// /delete KEY
bot.onText(/^\/delete (\S+)$/i, (msg, [, key]) => {
    if (!isAdmin(msg.from.id)) return;
    const cfg = loadConfig();
    if (!cfg[key]) return sendDM(`⛔️ Сценарій "${key}" не знайдено`);
    delete cfg[key];
    import('../config/configManager.js').then(m => m.saveConfig(cfg));
    sendDM(`✅ Сценарій "${key}" видалено`);
});

// /check KEY — викликає перевірку сценарію
bot.onText(/^\/check(?:\s+(\S+))?$/i, (msg, [, key]) => {
    if (!isAdmin(msg.from.id)) return;
    if (!key) {
        sendDM('⛔️ Вкажіть ключ сценарію');
        return;
    }
    const cfg = loadConfig();
    if (!cfg[key]) {
        return sendDM(`⛔️ Сценарій "${key}" не знайдено`);
    }
    sendDM(`⏳ Перевірка сценарію "${key}" запущена в терміналі…`);
    // Логи процесу checkScenario.js виводяться в консоль
    const checkScript = path.join(__dirname, '..', 'checkScenario.js');
    const proc = spawn(process.execPath, [checkScript, key], {
        cwd: coreDir,
        stdio: 'inherit'
    });
});

// /restart — перезапуск core
bot.onText(/^\/restart$/i, msg => {
    if (!isAdmin(msg.from.id)) return;
    sendDM('♻️ core перезапускається…');
    killCore(coreProc && coreProc.pid);
    startCore();
});

console.log('adminBot запущений, чекаю команд…');
