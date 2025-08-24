// src/telegram/adminBot.js
import TelegramBot      from 'node-telegram-bot-api';
import { spawn, spawnSync } from 'child_process';
import path             from 'path';
import { fileURLToPath } from 'url';
import fs               from 'fs';
import { loadConfig }   from '../config/configManager.js';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { loadProxies, addProxy, saveProxies } from '../config/proxyManager.js';

// Перевірка «живості» проксі з жорстким 1с-таймаутом
async function isProxyAlive(proxyUrl) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 1000);

    try {
        const agent = new SocksProxyAgent(proxyUrl, { timeout: 1000 });
        await axios.get('http://ifconfig.me/ip', {
            httpAgent:  agent,
            httpsAgent: agent,
            signal:     controller.signal,
        });
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}


// ─── Settings ───────────────────────────────────────────────
const TOKEN = '7522596224:AAE1_1CpOFnqc3IRS3KAnVUxTTEIPOIgcV0';
const OWNER_ID = 477547206 ;

// ─── Paths ──────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseDir   = path.join(__dirname, '..'); // src/
const corePath  = path.join(baseDir, 'index.js');

// ─── Telegram init ──────────────────────────────────────────
const bot    = new TelegramBot(TOKEN, { polling: true });
const sendDM = (msg, opts) => bot.sendMessage(OWNER_ID, msg, opts).catch(() => {});
const isAdmin = id => id === OWNER_ID;

// ─── Core process management ────────────────────────────────
let coreProc = null;
function killProcessTree(pid) {
    if (!pid) return;
    if (process.platform === 'win32') {
        try { spawnSync('taskkill', ['/PID', pid, '/T', '/F']); } catch {};
    } else {
        try { process.kill(-pid, 'SIGKILL'); } catch {};
    }
}
function startCore() {
    if (!fs.existsSync(corePath)) {
        sendDM(`⛔️ core не знайдено: ${corePath}`);
        return;
    }
    if (coreProc && !coreProc.killed) killProcessTree(coreProc.pid);
    coreProc = spawn(process.execPath, [corePath], {
        cwd: baseDir,
        detached: false,
        stdio: 'inherit'
    });
    sendDM(`✅ core запущено (pid ${coreProc.pid})`);
    coreProc.on('exit', code => sendDM(`⚠️ core завершився (code ${code})`));
}
startCore();
sendDM('adminBot запущений, чекаю команд…');

// ─── BOT COMMANDS ──────────────────────────────────────────
// /start
// /start
bot.onText(/^\/start$/i, msg => {
    if (!isAdmin(msg.from.id)) return;
    sendDM('Для довідки натисніть кнопку нижче:', {
        reply_markup: {
            keyboard: [['/help']],
            resize_keyboard: true
        }
    });
});


// /list
bot.onText(/^\/list$/i, msg => {
    if (!isAdmin(msg.from.id)) return;
    const keys = Object.keys(loadConfig());
    sendDM(keys.length ? keys.join('\n') : '⛔️ сценарії відсутні');
});

// /get KEY
bot.onText(/^\/get (\S+)$/i, (msg, [, key]) => {
    if (!isAdmin(msg.from.id)) return;
    const data = loadConfig()[key];
    sendDM(
        data ? '```' + JSON.stringify(data, null, 2) + '```' : `⛔️ сценарій "${key}" не знайдено`,
        { parse_mode: 'Markdown' }
    );
});

// /set KEY\nJSON
bot.onText(/^\/set (\S+)\n([\s\S]+)$/i, (msg, [, key, json]) => {
    if (!isAdmin(msg.from.id)) return;
    let obj;
    try { obj = JSON.parse(json); } catch {
        return sendDM('⛔️ JSON невалідний');
    }
    const cfg = loadConfig();
    cfg[key] = obj;
    import('../config/configManager.js').then(m => m.saveConfig(cfg));
    sendDM(`✅ сценарій "${key}" збережено`);
});

// /delete KEY
bot.onText(/^\/delete (\S+)$/i, (msg, [, key]) => {
    if (!isAdmin(msg.from.id)) return;
    const cfg = loadConfig();
    if (!cfg[key]) return sendDM(`⛔️ сценарій "${key}" не знайдено`);
    delete cfg[key];
    import('../config/configManager.js').then(m => m.saveConfig(cfg));
    sendDM(`✅ сценарій "${key}" видалено`);
});


// /checkallproxy — перевірити всі проксі та вивести список з кнопками
bot.onText(/^\/checkallproxy$/i, async msg => {
    if (!isAdmin(msg.from.id)) return;
    sendDM('🔎 Перевіряю всі проксі…');

    const results = await Promise.all(
        Object.entries(loadProxies()).map(async ([key, url]) => {
            const ok = await isProxyAlive(url);
            return { key, url, ok };
        })
    );

    const keyboard = results.map(r => [{
        text: `${r.ok ? '✅' : '❌'} ${r.key}`,
        callback_data: `proxy:${r.key}`
    }]);

    bot.sendMessage(OWNER_ID,
        'Статус проксі (натисніть кнопку, щоб отримати URL):',
        { reply_markup: { inline_keyboard: keyboard } }
    );
});

// Обробник натискань на кнопки
bot.on('callback_query', async query => {
    if (!query.data?.startsWith('proxy:')) return;
    const key     = query.data.split(':')[1];
    const url     = loadProxies()[key];
    await bot.answerCallbackQuery(query.id);
    sendDM(`🔗 ${key}: ${url}`);
});
// /formatproxy RAW — перетворює IP:port:user:pass → socks5://user:pass@IP:port і надсилає в DM
bot.onText(/^\/formatproxy\s+(\S+)$/i, (msg, [, raw]) => {
    if (!isAdmin(msg.from.id)) return;

    const parts = raw.split(':');
    if (parts.length !== 4) {
        return sendDM(
            '⛔️ Невірний формат. Використання:\n' +
            '/formatproxy 130.0.234.165:8000:ps87616:BVCo0wh8BM'
        );
    }

    const [ip, port, user, pass] = parts;
    const formatted = `socks5://${user}:${pass}@${ip}:${port}`;

    sendDM(`🔄 Відформатовано:\n${formatted}`);
});

// /addproxy RAW — додає проксі (IP:port:user:pass або socks5://URI) під наступний flowN
bot.onText(/\/addproxy(?:@\w+)?\s+(.+)/i, async (msg, match) => {
    console.log('[DEBUG] /addproxy called by', msg.from.id, 'match:', match);
    if (!isAdmin(msg.from.id)) {
        console.log('[DEBUG] addproxy — non-admin, ignored');
        return;
    }

    const raw = match[1].trim();
    console.log('[DEBUG] raw proxy string:', raw);

    // Визначаємо формат
    let formatted;
    if (raw.startsWith('socks5://')) {
        formatted = raw;
    } else {
        const parts = raw.split(':');
        if (parts.length !== 4) {
            return sendDM(
                '⛔️ Невірний формат. Використання:\n' +
                '/addproxy 130.0.234.165:8000:ps87616:BVCo0wh8BM\n' +
                'або /addproxy socks5://user:pass@ip:port'
            );
        }
        const [ip, port, user, pass] = parts;
        formatted = `socks5://${user}:${pass}@${ip}:${port}`;
    }
    console.log('[DEBUG] formatted proxy:', formatted);

    // Генеруємо наступний ключ flowN
    const proxies = loadProxies();
    const maxIndex = Object.keys(proxies)
        .map(k => {
            const m = k.match(/^flow(\d+)$/);
            return m ? parseInt(m[1], 10) : 0;
        })
        .reduce((a, b) => Math.max(a, b), 0);
    const newKey = `flow${maxIndex + 1}`;
    console.log('[DEBUG] new key will be', newKey);

    // Записуємо в файл
    addProxy(newKey, formatted);
    console.log('[DEBUG] addProxy done');

    sendDM(`✅ Додано проксі "${newKey}":\n${formatted}`);
});
// /deleteproxy FLOWKEY — видаляє проксі та перенумеровує потоки
bot.onText(/^\/deleteproxy\s+(\S+)$/i, (msg, [, key]) => {
    if (!isAdmin(msg.from.id)) return;

    // 1) Завантажуємо всі проксі
    const proxies = loadProxies();
    if (!proxies[key]) {
        return sendDM(`⛔️ Проксі "${key}" не знайдено`);
    }

    // 2) Видаляємо вказаний ключ
    delete proxies[key];

    // 3) Перенумеровуємо залишок
    const entries = Object.entries(proxies)
        .map(([k, url]) => {
            const m = k.match(/^flow(\d+)$/);
            return m ? [parseInt(m[1],10), url] : null;
        })
        .filter(Boolean)
        .sort((a,b) => a[0] - b[0]);

    const newProxies = {};
    entries.forEach(([_, url], i) => {
        newProxies[`flow${i+1}`] = url;
    });

    // 4) Зберігаємо новий об’єкт
    saveProxies(newProxies);

    // 5) Підтверджуємо
    sendDM(`✅ Видалено ${key} і перенумеровано ${entries.length} проксі`);
});
// /check KEY — запустити core з аргументом
bot.onText(/^\/check\s+(\S+)$/i, (msg, [, key]) => {
    if (!isAdmin(msg.from.id)) return;
    const cfg = loadConfig();
    if (!cfg[key]) return sendDM(`⛔️ сценарій "${key}" не знайдено`);
    sendDM(`⏳ Запускаю сценарій "${key}"…`);
    const proc = spawn(process.execPath, [corePath, key], {
        cwd: baseDir,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    proc.stdout.on('data', chunk => {
        process.stdout.write(chunk);
        output += chunk.toString();
    });
    proc.stderr.on('data', chunk => {
        process.stderr.write(chunk);
        output += chunk.toString();
    });
    proc.on('close', code => {
        const text = output.trim() || `Process exited with code ${code}`;
        sendDM('```' + text + '```', { parse_mode: 'Markdown' });
    });
});

// /getconfig — відправити локальний config.json в особисті повідомлення
bot.onText(/^\/getconfig$/i, async msg => {
    if (!isAdmin(msg.from.id)) return;

    const filePath = path.join(__dirname, '../config/coins.json');
    try {
        await bot.sendDocument(OWNER_ID,
            fs.createReadStream(filePath),
            {}, // опції повідомлення
            {
                filename: 'config.json',
                contentType: 'application/json'
            }
        );
    } catch (err) {
        sendDM(`⛔️ Не вдалося відправити файл: ${err.message}`);
    }
});
// /measurement — виміряти час одного повного «круга» core
bot.onText(/^\/measurement$/i, msg => {
    if (!isAdmin(msg.from.id)) return;

    sendDM('⏳ Вимірюю швидкість наступного круга…');

    // запускаємо core в «режимі вимірювання»
    const proc = spawn(
        process.execPath,
        [corePath],                // ← лишаємо тільки шлях до index.js
        {
            cwd: baseDir,
            env: { ...process.env, MEASURE: '1' },   // прапор через ENV
            stdio: ['ignore', 'pipe', 'pipe']
        }
    );


    let output = '';
    proc.stdout.on('data', chunk => output += chunk.toString());
    proc.stderr.on('data', chunk => output += chunk.toString());

    proc.on('close', () => {
        const m = output.match(/MEASURE_TIME\s+([0-9.]+)/);
        if (m) {
            sendDM(`⚡️ Швидкість: ${parseFloat(m[1]).toFixed(2)} секунд`);
        } else {
            sendDM(
                '⛔️ Не вдалося визначити швидкість (лог нижче):\n```' +
                output.trim() + '```',
                { parse_mode: 'Markdown' }
            );
        }
    });
});


// /help — перелік всіх команд і короткі пояснення
bot.onText(/^\/help$/i, msg => {
    if (!isAdmin(msg.from.id)) return;
    const helpText = `
⚙️ *Адмін-бот PROJECTX*  
Ось список доступних команд:

/start               — відкрити меню  
/list                — перелік усіх сценаріїв  
/get <KEY>           — показати конфіг сценарію  
/set <KEY>\\n<JSON>  — додати/оновити сценарій  
/delete <KEY>        — видалити сценарій  
/check <KEY>         — запустити сценарій разово  
/restart             — перезапустити core
/getconfig           — відправити файл config.json
/help                — ця довідка  

🌐 *Проксі:*  
/checkallproxy       — статус усіх proxy (кнопки)  
/addproxy <RAW>      — додати proxy (IP:port:user:pass або URI)  
/formatproxy <RAW>   — відформатувати в socks5://…  
/deleteproxy <flowN> — видалити proxy і перенумерувати  
/measurement         — вимірює швидкість
`;
    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

// /restart — перезапуск core без аргументів
bot.onText(/^\/restart$/i, msg => {
    if (!isAdmin(msg.from.id)) return;
    sendDM('♻️ перезапускаю core...');
    killProcessTree(coreProc && coreProc.pid);
    startCore();
});