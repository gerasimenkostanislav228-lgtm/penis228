// src/index.js

import { loadConfig } from './config/configManager.js';;
import ExchangeAdapter from './adapters/ExchangeAdapter.js';

// DEX adapters
import Odos from './exchanges/Odos.js';
import Jupiter from './exchanges/Jupiter.js';
import OpenOcean from './exchanges/Openocean.js';
import CoWSwap from './exchanges/CoWSwap.js';
import Magpie from './exchanges/Magpie.js';
import SushiSwap from './exchanges/SushiSwap.js';
import Raydium from './exchanges/Raydium.js';
import Relay from './exchanges/Relay.js';
import KyberSwap from './exchanges/KyberSwap.js' ;
import Hercules from './exchanges/Hercules.js';
import Migration from './exchanges/Migration.js';



// CEX adapters
import Bybit from './exchanges/Bybit.js';
import Gate from './exchanges/Gate.js';
import Mexc from './exchanges/Mexc.js';
import Kucoin from './exchanges/Kucoin.js';
import Btse from './exchanges/Btse.js';
import Bitget from './exchanges/Bitget.js';
import CryptoCom from './exchanges/CryptoCom.js';
import Bitmart from './exchanges/Bitmart.js';
import Kraken from './exchanges/Kraken.js';
import Binance from './exchanges/Binance.js';
import Okx from './exchanges/Okx.js';
import Coinex from './exchanges/Coinex.js';

import { calculateProfitPercentage } from './utils/calcProfit.js';
import TelegramNotifier from './telegram/telegramNotifier.js';
import { loadProxies } from './config/proxyManager.js';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { sendErrorDM, sendScenarioErrorFile } from './telegram/errorNotifier.js';


// ────────────────────────────────────────────────────────────────
// ProxyScheduler  — керує лімітами запитів на IP
// ────────────────────────────────────────────────────────────────
class ProxyScheduler {

    constructor(proxyUrls) {
        this.windowMs = 1_000;                         // «вікно» 1 с
        this.defaultLimits = {CEX: 5, DEX: 2};       // дефолт, якщо біржі нема в мапі
        this._cycle = 0;        // номер поточної «глобальної» ітерації

        // Індивідуальні ліміти (req/s)  ──────────────────────────
        this.limitsPerEx = {
            // CEX
            Binance: 100, Bybit: 120, Gate: 20, Mexc: 10, Kucoin: 20,
            Btse: 15, Bitget: 20, CryptoCom: 10, Bitmart: 30, Kraken: 2,
            Okx: 30, Coinex: 30,
            // DEX / агрегатори
            Odos: 2, Jupiter: 10, OpenOcean: 5, CoWSwap: 10, Magpie: 5,
            SushiSwap: 10, Raydium: 10, Relay: 3, KyberSwap: 10,

        };

        this.setProxies(proxyUrls);
    }

    setProxies(proxyUrls = []) {
        this.proxies = proxyUrls.map(url => ({
            url,
            stats: {CEX: 0, DEX: 0, windowStart: Date.now()}
        }));
        if (!this.proxies.length) this.proxies.push({
            url: null, stats: {CEX: 0, DEX: 0, windowStart: Date.now()}
        });
    }

    _refresh(p) {
        const now = Date.now();
        if (now - p.stats.windowStart >= this.windowMs) {
            p.stats.CEX = p.stats.DEX = 0;
            p.stats.windowStart = now;
        }
    }

    /**
     * @param {'CEX'|'DEX'} type  — клас біржі (для лічильника)
     * @param {string} exName     — конкретна біржа (для індивідуального ліміту)
     */

    async acquire(type, exName, timeoutMs = Number(process.env.ACQ_TIMEOUT_MS || 2500)) {
        const limit = this.limitsPerEx[exName] ?? this.defaultLimits[type];
        const start = Date.now();
        while (true) {
            let best = null;
            for (const p of this.proxies) {
                this._refresh(p);
                if (p.stats[type] < limit &&
                    (!best || p.stats[type] < best.stats[type])) best = p;
            }
            if (best) {
                best.stats[type] += 1;
                return best.url;
            }
            if (Date.now() - start > timeoutMs) {
                throw new Error(`Acquire timeout (${type}/${exName})`);
            }
            await new Promise(r => setTimeout(r, 30));
        }
    }
}

// ────────────────────────────────────────────────────────────────
// runParallel — виконує items пачками по N паралельно
// ────────────────────────────────────────────────────────────────
async function runParallel(items, fn, concurrency = 10) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const slice = items.slice(i, i + concurrency);
        const part  = await Promise.all(slice.map(fn));   // максимум N одночасно
        results.push(...part);
    }
    return results;
}


const telegram = new TelegramNotifier();
let combinedLogs = [];

const _origConsoleError = console.error;
console.error = (...args) => {
    const first = args[0];
    const text = first instanceof Error ? first.message : first;
    if (typeof text === 'string' && text.includes('ETELEGRAM: 429 Too Many Requests')) {
        return;
    }
    _origConsoleError(...args);
};

const dexList = ['Odos','Jupiter','OpenOcean','CoWSwap','Magpie','SushiSwap','Raydium','Relay','KyberSwap','Hercules'];
const proxyFlows = Object.values(loadProxies());
let scheduler;    // ми будемо робити new ProxyScheduler(...) у кожному колі


// ────────────────────────────────────────────────────────────────
// Timeout-wrapper для будь-якого промісу
// ────────────────────────────────────────────────────────────────
/**
 * Обгортає будь-який проміс, кидаючи помилку, якщо він не встиг викона­тись за ms мс
 * @param {Promise<any>} promise
 * @param {number} ms
 */
function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timeout after ${ms} ms`));
        }, ms);

        promise
            .then((res) => {
                clearTimeout(timer);
                resolve(res);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}
// ────────────────────────────────────────────────────────────────
// Retry з експоненційним бекаффом
// ────────────────────────────────────────────────────────────────
/**
 * @param {() => Promise<any>} fn      — функція, що повертає проміс
 * @param {number} retries             — кількість спроб
 * @param {number} delay               — початковий інтервал у мс
 */
async function withRetry(fn, retries = 3, delay = 500) {
    try {
        return await fn();
    } catch (err) {
        if (retries <= 0) throw err;
        console.warn(`Retrying after error: ${err.message}, attempts left: ${retries}`);
        await new Promise(res => setTimeout(res, delay));
        return withRetry(fn, retries - 1, delay * 2);
    }
}

// ────────────────────────────────────────────────────────────────
// Далі йде решта твоїх хелперів (getFeeRate, runOneDexSwap тощо)


// ────────────────────────────────────────────────────────────────────────────────
// Helper: commission for DEX
// ────────────────────────────────────────────────────────────────────────────────
function getFeeRate(ex) {
    if (!ex || typeof ex !== 'object') return 0;
    const raw = ex.Fee ?? ex.fee;
    const pct = parseFloat(raw);
    return Number.isFinite(pct) && pct > 0 ? pct / 100 : 0;
}
// ────────────────────────────────────────────────────────────────────────────
// STEP-SWAPS helpers
// ────────────────────────────────────────────────────────────────────────────
async function runOneDexSwap(ex, amountIn, scheduler) {
    const feeRate = getFeeRate(ex);
    const funds   = amountIn * (1 - feeRate);

    let inst;
    switch (ex.name) {
        case 'Odos':      inst = new Odos();      break;
        case 'Jupiter':   inst = new Jupiter({ slippageBps: 50 }); break;
        case 'OpenOcean': inst = new OpenOcean(); break;
        case 'CoWSwap':   inst = new CoWSwap();   break;
        case 'Magpie':    inst = new Magpie();    break;
        case 'SushiSwap': inst = new SushiSwap(); break;
        case 'Raydium':   inst = new Raydium();   break;
        case 'Relay':     inst = new Relay();     break;
        case 'KyberSwap': inst = new KyberSwap(); break;
        case 'Migration':
            inst = new Migration(ex.multiplier || 1);
            break;
        default:          return 0;               // unknown DEX
    }

    let proxyUrl = null;
    try { proxyUrl = await scheduler.acquire('DEX', ex.name, 1500); } catch {}
    if (proxyUrl && typeof inst.setProxy === 'function') inst.setProxy(proxyUrl);



    const pair = {
        chain:  ex.network,
        input:  { address: ex.inputToken.address,  decimals: ex.inputToken.decimals },
        output: { address: ex.outputToken.address, decimals: ex.outputToken.decimals }
    };

    // таймаут + 1 ретрай; fallback на DIRECT якщо через проксі не вийшло
    const tryOnce = (pUrl) =>
        withTimeout(
            inst.processing(pair, funds, pUrl, `step-${ex.name}`, ex.network),
            15000
        );

    let out = await withRetry(() => tryOnce(proxyUrl), 1, 300)
        .catch(err => {
            console.warn(`runOneDexSwap error on ${ex.name}: ${err.message}`);
            return 0;
        });

    // Якщо через проксі не вдалося — пробуємо без проксі (як у /check)
    if (!out && proxyUrl) {
        if (typeof inst.setProxy === 'function') inst.setProxy(null);
        out = await withRetry(() => tryOnce(null), 1, 300).catch(() => 0);
    }
    return out || 0;
}

async function runStepSwaps(stepSwaps = [], startAmount, scheduler) {
    let qty = startAmount;
    for (const ex of stepSwaps) {
        qty = await runOneDexSwap(ex, qty, scheduler);
        if (!qty || qty <= 0) return null;   // ланцюжок зламався
    }
    return qty;
}

// ────────────────────────────────────────────────────────────────────────────────
// Helper: network + address для DEX-об’єкта
// side = 'buy'  → беремо outputToken  (токен, який отримуємо)
// side = 'sell' → беремо inputToken   (токен, який продаємо)
function dexInfo(ex, side) {
    if (!ex || typeof ex !== 'object') return null;
    const t = side === 'buy' ? ex.outputToken : ex.inputToken;
    return { network: ex.network, address: t.address };
}

// ────────────────────────────────────────────────────────────────────────────────
// Check if a proxy is alive by fetching an external IP.
// ────────────────────────────────────────────────────────────────────────────────
async function isProxyAlive(proxyUrl) {
    // AbortController для власного 1с-таймауту
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 1000);

    try {
        // SocksProxyAgent з таймаутом handshake 1с
        const agent = new SocksProxyAgent(proxyUrl, { timeout: 1000 });

        await axios.get('http://ifconfig.me/ip', {
            httpAgent:   agent,
            httpsAgent:  agent,
            signal:      controller.signal,
        });

        clearTimeout(timeoutId);
        console.log(`Proxy ${proxyUrl} OK`);
        return true;
    } catch (err) {
        clearTimeout(timeoutId);
        console.error(`Proxy ${proxyUrl} failed: ${err.message}`);
        return false;
    }
}

// ────────────────────────────────────────────────────────────────────────────────
// Prepare CEX instances & cache order-books
// ────────────────────────────────────────────────────────────────────────────────
async function prepareCexInstances(token, buyExList, sellExList, scheduler, noFreeze = false) {
    const allCexNames = new Set();
    for (const ex of buyExList) if (typeof ex === 'string') allCexNames.add(ex);
    for (const ex of sellExList) if (typeof ex === 'string') allCexNames.add(ex);

    const insts = {};
    for (const name of allCexNames) {
        let inst;
        switch (name) {
            case 'Bybit':     inst = new Bybit();     break;
            case 'Gate':      inst = new Gate();      break;
            case 'Mexc':      inst = new Mexc();      break;
            case 'Kucoin':    inst = new Kucoin();    break;
            case 'Btse':      inst = new Btse();      break;
            case 'Bitget':    inst = new Bitget();    break;
            case 'CryptoCom': inst = new CryptoCom(); break;
            case 'Bitmart':   inst = new Bitmart();   break;
            case 'Kraken':    inst = new Kraken();    break;
            case 'Binance':   inst = new Binance();   break;
            case 'Okx':       inst = new Okx();       break;
            case 'Coinex':    inst = new Coinex();    break;
            default:
                console.warn(`Skip unknown CEX: ${name}`);
                continue;
        }

        const proxyUrl = await scheduler.acquire('CEX', name, 1500);
        if (proxyUrl && typeof inst.setProxy === 'function') {
            inst.setProxy(proxyUrl);
        }



        if (typeof inst.getOrderBook === 'function') {
            const symbol = ExchangeAdapter.adaptSymbol(token, name);
            let book;
            try {
                // Гарантуємо таймаут 3с на отримання order book
                book = await withRetry(
                    () => withTimeout(inst.getOrderBook(symbol), 15000),
                    2,    // дві повторні спроби
                    300   // стартовий інтервал 300ms
                );
            } catch (err) {
                console.error(`[${name}] getOrderBook (${symbol}) error via proxy ${proxyUrl || 'DIRECT'}: ${err.message}`);


                // Пропускаємо цей CEX, якщо не змогли завантажити книгу
                continue;
            }
            // Заморожуємо результат, щоб не запитувати його знову
            if (!noFreeze) inst.getOrderBook = async () => book;
        }

        insts[name] = inst;
    }

    return insts;
}

// ────────────────────────────────────────────────────────────────────────────────
// Find best BUY (CEX or DEX)
// ────────────────────────────────────────────────────────────────────────────────
async function getBestBuyOption(token, buyExList, amount, scheduler, cexInsts) {
    let bestExchange = null, bestResult = 0;

    await runParallel(buyExList, async (ex) => {
        /* ───── CEX ───── */
        if (typeof ex === 'string') {
            const inst = cexInsts[ex]; if (!inst) return;
            const proxyUrl = await scheduler.acquire('CEX', ex, 1500);
            if (proxyUrl && typeof inst.setProxy === 'function') inst.setProxy(proxyUrl);

            const symbol = ExchangeAdapter.adaptSymbol(token, ex);
            const res = await withRetry(
                () => withTimeout(inst.simulateBuy(amount, symbol), 15000),
                2,
                300
            ).catch(err => {
                console.warn(`Final failure on CEX buy ${ex}:`, err.message);
                return null;
            });

            const bought = res?.tokensBought || 0;
            if (bought > bestResult) { bestResult = bought; bestExchange = ex; }
            return;
        }

        /* ───── DEX ───── */
        if (ex && ex.inputToken && ex.outputToken && dexList.includes(ex.name)) {
            const fee = getFeeRate(ex);
            const funds = amount * (1 - fee);

            let inst = null;
            switch (ex.name) {
                case 'Odos':      inst = new Odos();      break;
                case 'Jupiter':   inst = new Jupiter({ slippageBps: 50 }); break;
                case 'OpenOcean': inst = new OpenOcean(); break;
                case 'CoWSwap':   inst = new CoWSwap();   break;
                case 'Magpie':    inst = new Magpie();    break;
                case 'SushiSwap': inst = new SushiSwap(); break;
                case 'Raydium':   inst = new Raydium();   break;
                case 'Relay':     inst = new Relay();     break;
                case 'KyberSwap': inst = new KyberSwap(); break;
                case 'Hercules':  inst = new Hercules(); break;




            }
            if (!inst) return;

            const proxyUrl = await scheduler.acquire('DEX', ex.name, 1500);
            if (proxyUrl && typeof inst.setProxy === 'function') inst.setProxy(proxyUrl);


            const pair = {
                chain: ex.network,
                input:  { address: ex.inputToken.address,  decimals: ex.inputToken.decimals },
                output: { address: ex.outputToken.address, decimals: ex.outputToken.decimals }
            };

            const tokens = await withRetry(
                () => withTimeout(
                    inst.processing(pair, funds, proxyUrl, `buy-${ex.name}`, ex.network),
                    15000
                ).catch(err => { throw err; }),
                2,
                300
            ).catch(err => {
                console.warn(`Final failure on DEX ${ex.name}:`, err.message);
                return 0;
            });

            if (tokens > bestResult) { bestResult = tokens; bestExchange = ex; }
        }
    });

    return { bestExchange, bestResult };
}


// ────────────────────────────────────────────────────────────────────────────────
// Find best SELL (CEX або DEX) — бере найменш навантажений проксі через scheduler
// ────────────────────────────────────────────────────────────────────────────────
async function getBestSellOption(token, sellExList, tokenAmount, scheduler, cexInsts) {
    let bestExchange = null, bestResult = 0;   // bestResult — це USDT, який отримаємо

    await runParallel(sellExList, async (ex) => {

        /* ───── CEX (рядок) ───── */
        if (typeof ex === 'string') {
            const inst = cexInsts[ex]; if (!inst) return;

            const proxyUrl = await scheduler.acquire('CEX', ex, 1500);
            if (proxyUrl && typeof inst.setProxy === 'function') inst.setProxy(proxyUrl);

            const symbol = ExchangeAdapter.adaptSymbol(token, ex);
            const res = await withRetry(
                () => withTimeout(inst.simulateSell(tokenAmount, symbol), 15000),
                2,
                300
            ).catch(err => {
                console.warn(`Final failure on CEX sell ${ex}:`, err.message);
                return null;
            });

            const usdt = res?.usdtReceived || 0;
            if (usdt > bestResult) { bestResult = usdt; bestExchange = ex; }
            return;
        }

        /* ───── DEX (об’єкт) ───── */
        if (ex && ex.inputToken && ex.outputToken && dexList.includes(ex.name)) {
            const feeRate   = getFeeRate(ex);                     // наприклад, 0.02
            const tokensNet = tokenAmount * (1 - feeRate);

            let inst = null;
            switch (ex.name) {
                case 'Odos':      inst = new Odos();      break;
                case 'Jupiter':   inst = new Jupiter({ slippageBps: 50 }); break;
                case 'OpenOcean': inst = new OpenOcean(); break;
                case 'CoWSwap':   inst = new CoWSwap();   break;
                case 'Magpie':    inst = new Magpie();    break;
                case 'SushiSwap': inst = new SushiSwap(); break;
                case 'Raydium':   inst = new Raydium();   break;
                case 'Relay':     inst = new Relay();     break;
                case 'KyberSwap': inst = new KyberSwap(); break;
                case 'Hercules':  inst = new Hercules(); break;



            }
            if (!inst) return;

            const proxyUrl = await scheduler.acquire('DEX', ex.name, 1500);
            if (proxyUrl && typeof inst.setProxy === 'function') inst.setProxy(proxyUrl);

            const pair = {
                chain: ex.network,
                input:  { address: ex.inputToken.address,  decimals: ex.inputToken.decimals },
                output: { address: ex.outputToken.address, decimals: ex.outputToken.decimals }
            };

            const usdt = await withRetry(
                () => withTimeout(
                    inst.processing(pair, tokensNet, proxyUrl, `sell-${ex.name}`, ex.network),
                    15000
                ).catch(err => { throw err; }),
                2,
                300
            ).catch(err => {
                console.warn(`Final failure on DEX sell ${ex.name}:`, err.message);
                return 0;
            });


            if (usdt > bestResult) { bestResult = usdt; bestExchange = ex; }
        }
    });

    return { bestExchange, bestResult };
}
// ────────────────────────────────────────────────────────────────────────────────
// Run a single scenario (using one proxy). Logs include proxyIndex as “P#”
// ────────────────────────────────────────────────────────────────────────────────
async function recheckSpread(cfg, amount, scheduler) {
    const { token, buyExchange, sellExchange } = cfg;

    const insts = await prepareCexInstances(
        token, buyExchange, sellExchange, scheduler, true   // noFreeze=true
    );

    // BUY
    const { bestResult: tokensBought } =
        await getBestBuyOption(token, buyExchange, amount, scheduler, insts);
    if (!tokensBought) return null;

    // STEP-SWAPS
    let tokensAfterSteps = tokensBought;
    if (Array.isArray(cfg.stepSwaps) && cfg.stepSwaps.length) {
        tokensAfterSteps = await runStepSwaps(cfg.stepSwaps, tokensBought, scheduler);
        if (!tokensAfterSteps) return null;
    }

    // SELL
    const { bestResult: usdt } =
        await getBestSellOption(token, sellExchange, tokensAfterSteps, scheduler, insts);
    if (!usdt) return null;

    return { tokens: tokensAfterSteps, usdt };
}

// ────────────────────────────────────────────────────────────────────────────────
//                                 recheckSpread
// ────────────────────────────────────────────────────────────────────────────────
async function runTrade(scenarioName, scheduler, log = console.log) {
    const cfg = loadConfig()[scenarioName];
    if (!cfg) { log(`No config for ${scenarioName}`); return; }

    const { token, buyExchange, sellExchange, buyAmounts, Bridge, network: scenarioNetwork } = cfg;
    log(`=== Start processing token: ${token} ===`);
    log(`Scenario ${scenarioName} (token ${token}${scenarioNetwork ? `, net ${scenarioNetwork}` : ''})`);
    // ───── Підготовка CEX інстансів ─────
    let cexInsts;
    try {
        cexInsts = await prepareCexInstances(token, buyExchange, sellExchange, scheduler);
    } catch (e) {
        const payload = { scenario: scenarioName, error: e.stack || e.message || e, config: cfg };
        await sendErrorDM('```json\n' + JSON.stringify(payload, null, 2) + '\n```');
        log(`prepareCexInstances error: ${e.message}`);
        return;
    }

    // ───── Обходимо всі buy-amounts ─────
    for (const { amount, notificationThreshold } of buyAmounts) {
        log(`Amount ${amount} USDT`);

        const { bestExchange: buyEx, bestResult: tokensBought } =
            await getBestBuyOption(token, buyExchange, amount, scheduler, cexInsts);

        if (!buyEx || tokensBought <= 0) {
            log(`Buy failed`);
            combinedLogs.push(`Сценарій ${scenarioName} ${amount.toFixed(0)} USDT | BUY FAIL`);
            continue;
        }

        const buyLabel = typeof buyEx === 'string'
            ? buyEx
            : `${buyEx.name} (${buyEx.network})`;

        /* ───── step-swaps + трасування ───── */
        let swapTrace = [];
        let tokensForSell = tokensBought;

        if (Array.isArray(cfg.stepSwaps) && cfg.stepSwaps.length) {
            const trace = [];
            let qtyIn = tokensBought;

            for (const ex of cfg.stepSwaps) {
                const qtyOut = await runOneDexSwap(ex, qtyIn, scheduler);
                if (!qtyOut) {
                    log('Step-swap failed');
                    combinedLogs.push(`Сценарій ${scenarioName} ${amount.toFixed(0)} USDT | STEP FAIL на ${ex.name} (${ex.network})`);
                    trace.length = 0;
                    break;
                }

                trace.push({
                    qtyIn,
                    symbolIn:  ex.inputToken.symbol,
                    qtyOut,
                    symbolOut: ex.outputToken.symbol,
                    name:      ex.name,
                    network:   ex.network,
                    outContract: ex.outputToken.address
                });

                qtyIn = qtyOut;
            }
            if (!trace.length) {
                combinedLogs.push(`Сценарій ${scenarioName} ${amount.toFixed(0)} USDT | STEP CHAIN BROKEN`);
                continue;   // ланцюжок зламався
            }
            swapTrace     = trace;
            tokensForSell = qtyIn;
        }

        const swapsText = swapTrace.length
            ? swapTrace.map(({ qtyIn, symbolIn, qtyOut, symbolOut, name, network }, i) =>
            `Свап-${i + 1}:  ${qtyIn.toFixed(2)} ${symbolIn} → ${qtyOut.toFixed(2)} ${symbolOut}   (${name}, ${network})`
        ).join('\n') + '\n'
            : '';

        const { bestExchange: sellEx, bestResult: usdtReceived } =
            await getBestSellOption(token, sellExchange, tokensForSell, scheduler, cexInsts);

        if (!sellEx || usdtReceived <= 0) {
            log(`Sell failed`);
            combinedLogs.push(`Сценарій ${scenarioName} ${amount.toFixed(0)} USDT | SELL FAIL`);
            continue;
        }

        const sellLabel = typeof sellEx === 'string'
            ? sellEx
            : `${sellEx.name} (${sellEx.network})`;

        log(`Sold → ${usdtReceived.toFixed(4)} USDT on ${sellLabel}`);

        const pathText =
            `Купівля: ${buyLabel}\n` +
            (swapTrace.length ? swapTrace.map((_, i) =>
                `Свап-${i + 1}: ${swapTrace[i].name} (${swapTrace[i].network})`).join('\n') + '\n' : '') +
            `Продаж:  ${sellLabel}\n`;

        // ───── Контракти DEX для повідомлення ─────
        const dexBlocks = [];
        if (typeof buyEx === 'object') {
            const { network, address } = dexInfo(buyEx, 'buy');
            dexBlocks.push(`${token.toUpperCase()} [${network}]\n\`\`\`\n${address}\n\`\`\``);
        }
        if (typeof sellEx === 'object') {
            const { network, address } = dexInfo(sellEx, 'sell');
            dexBlocks.push(`${token.toUpperCase()} [${network}]\n\`\`\`\n${address}\n\`\`\``);
        }
        const contractsText = dexBlocks.length ? dexBlocks.join('\n\n') + '\n' : '';

        // ───── Блок CHECK із конфіга ─────
        let checkText = '';
        if (Array.isArray(cfg.CHECK) && cfg.CHECK.length) {
            checkText = '*── TRANSACTION CHECKING ──*\n';
            for (const item of cfg.CHECK) {
                const [label, url] = Object.entries(item)[0] || [];
                if (label && url) checkText += `${label}\n[LINK](${url})\n`;
            }
            checkText += '\n';
        }

        // ───── Підрахунок прибутку ─────
        const profit    = usdtReceived - amount;
        const profitPct = calculateProfitPercentage(amount, usdtReceived);
        log(`Profit: ${profit.toFixed(4)} USDT (${profitPct.toFixed(2)} %)`);

// ───── Подвійна перевірка + сповіщення ─────
        if (profitPct >= notificationThreshold) {

            // ❶ маленька пауза, щоб DEX-агрегатори/біржі встигли оновитись
            await new Promise(r => setTimeout(r, 600));

            // ❷ повторно рахуємо спред на свіжих котируваннях
            const confirm = await recheckSpread(cfg, amount, scheduler);
            if (!confirm) {
                log('Phantom spread: повторна котирівка не підтвердилась');
                continue;            // пропускаємо
            }

            const profitPct2 = calculateProfitPercentage(amount, confirm.usdt);
            if (profitPct2 < notificationThreshold) {
                log(`Phantom spread: було ${profitPct.toFixed(2)} %, стало ${profitPct2.toFixed(2)} %`);
                continue;            // теж пропускаємо
            }

            // ❸ якщо дійшли сюди — спред підтверджений, формуємо повідомлення
            const netText = scenarioNetwork ? `Мережа: ${scenarioNetwork}\n` : '';
            const msg =
                `${token} - Повідомлення!\n` +
                netText +
                `Прибуток: ${profit.toFixed(2)} USDT (${profitPct2.toFixed(2)}%)\n\n` +
                `Купівля: ${amount.toFixed(2)} USDT → ${tokensBought.toFixed(2)} ${token}\n` +
                swapsText +
                `Отримано: ${confirm.usdt.toFixed(2)} USDT\n\n` +
                pathText + '\n' +
                contractsText +
                checkText;

            let buttons = [];
            if (Array.isArray(Bridge))       buttons = Bridge.map(b => typeof b === 'string' ? { text: 'Bridge', url: b } : b);
            else if (typeof Bridge === 'string') buttons = [{ text: 'Bridge', url: Bridge }];

            await telegram.sendMainMessage(msg, buttons);
        }

        // ───── Запис у лог-чат ─────
        const simpleLine =
            `Сценарій  ${scenarioName} ${amount.toFixed(0)} USDT | ${profit.toFixed(2)} $ | ${profitPct.toFixed(2)}% |\n` +
            `Куплено ${buyLabel}  ${tokensBought.toFixed(2)} ${token}\n` +
            `Продано ${sellLabel} ${usdtReceived.toFixed(2)} USDT (${profitPct.toFixed(2)}%)\n`;

        combinedLogs.push(simpleLine);
        log(`=== Finished processing token: ${token} ===`);
    }
}

// ────────────────────────────────────────────────────────────────────────────────
// Main loop: check proxies every 20 cycles, assign scenarios, run in parallel
// ────────────────────────────────────────────────────────────────────────────────
async function runTradeWithLogging(scenarioName, proxy, proxyIndex) {
    const logLines = [];
    const log = (msg) => {
        const line = `[P${proxyIndex}] ${msg}`;
        console.log(line);
        logLines.push(line);
    };

    try {
        await runTrade(scenarioName, scheduler, log);
    } catch (e) {
        if (typeof e?.message === 'string' && e.message.includes('ETELEGRAM: 429')) return;

        logLines.push('');
        logLines.push('❌ ' + (e.stack || e.message || e));
        await sendErrorDM('```log\n' + logLines.join('\n') + '\n```');
        console.error(`[P${proxyIndex}] Error in scenario ${scenarioName}:`, e);
    }
}
async function main() {
    const allProxies = Object.values(loadProxies());
    let aliveProxies = [...allProxies];
    const firstCheck = await Promise.all(allProxies.map(url =>
        isProxyAlive(url).then(ok => ok ? url : null).catch(() => null)
    ));
    aliveProxies = firstCheck.filter(Boolean);
    scheduler = new ProxyScheduler(aliveProxies);            // ← тепер у пулі лише робочі
    console.log(`Active proxies (initial): ${aliveProxies.length}`);

    scheduler.setProxies(aliveProxies);
    let cycleCount = 0;

    function estimateScenarioWeight(cfg) {
        const runs = cfg.buyAmounts?.length || 1;
        let dexBuy = 0, dexSell = 0, dexSteps = 0,
            cexBuy = 0, cexSell = 0;

        if (Array.isArray(cfg.stepSwaps)) dexSteps = cfg.stepSwaps.length;

        for (const ex of cfg.buyExchange) {
            if (typeof ex === 'object') dexBuy++;
            else cexBuy++;
        }

        for (const ex of cfg.sellExchange) {
            if (typeof ex === 'object') dexSell++;
            else cexSell++;
        }

        const dexWeight = runs * (dexBuy + dexSell + dexSteps);
        const cexWeight = (cexBuy + cexSell) * 0.5;

        return Math.max(1, Math.round(dexWeight + cexWeight));
    }

    while (true) {
        combinedLogs.length = 0;
        const scenarios = Object.keys(loadConfig());
        console.log('Active scenarios:', scenarios);
        try {
            // … ваша логіка …
            const loopStart = Date.now();


            // на початку кожного кола перевіряємо проксі й збираємо aliveProxies
            if (cycleCount % 20 === 0) {
                const toCheck = aliveProxies.length ? aliveProxies : allProxies;
                const checks = toCheck.map(url =>
                    isProxyAlive(url).then(ok => ok ? url : null).catch(() => null)
                );
                const results = await Promise.all(checks);
                aliveProxies = results.filter(Boolean);
                console.log(`Active proxies (rechecked): ${aliveProxies.length}`);
            }
            scheduler = new ProxyScheduler(aliveProxies);



            if (!aliveProxies.length) {
                console.error('No active proxies available — чекаємо наступної перевірки');
                await new Promise(r => setTimeout(r, 2000));
                cycleCount++;
                continue;
            }

            const proxyLoads = Array(aliveProxies.length).fill(0);
            const proxyAssignments = Array.from({ length: aliveProxies.length }, () => []);

            for (const scenarioName of scenarios) {
                const cfg = loadConfig()[scenarioName];
                if (!cfg) continue;

                const weight = estimateScenarioWeight(cfg);
                let minIdx = 0;
                for (let i = 1; i < proxyLoads.length; i++) {
                    if (proxyLoads[i] < proxyLoads[minIdx]) {
                        minIdx = i;
                    }
                }

                proxyLoads[minIdx] += weight;
                proxyAssignments[minIdx].push(scenarioName);
            }

            const tasks = proxyAssignments.flatMap((scenariosForProxy, proxyIdx) => {
                return scenariosForProxy.map((scenarioName) => {
                    const logLines = [];
                    const log = (msg) => {
                        const line = `[P${proxyIdx + 1}] ${msg}`;
                        console.log(line);
                        logLines.push(line);
                    };

                    return runTrade(scenarioName, scheduler, log).catch((e) => {
                        if (typeof e?.message === 'string' && e.message.includes('ETELEGRAM: 429')) return;

                        const payload = {
                            scenario: scenarioName,
                            proxy:    aliveProxies[proxyIdx],
                            error:    e?.stack || e?.message || String(e)
                        };

                        return sendErrorDM('```json\n' + JSON.stringify(payload, null, 2) + '\n```')
                            .finally(() => {
                                console.error(`[P${proxyIdx + 1}] Error in scenario ${scenarioName}:`, e);
                            });
                    });
                });
            });

            await Promise.allSettled(tasks);
            if (combinedLogs.length > 0) {
                let msg = '';
                for (const line of combinedLogs) {
                    if ((msg + line).length > 4000) {
                        await telegram.sendLog(msg);
                        msg = '';
                    }
                    msg += line + '\n';
                }
                if (msg.trim()) {
                    await telegram.sendLog(msg);
                }
                combinedLogs = [];
            }

            // --- вимірювання ---
            if (measureMode) {
                const secs = ((Date.now() - loopStart) / 1000).toFixed(2);
                console.log('MEASURE_TIME ' + secs);
                process.exit(0);        // завершуємо після першого виміряного круга
            }


            cycleCount++;
        } catch (e) {
            console.error(`Main loop error: ${e.message}`);
            await new Promise(r => setTimeout(r, 15000));
            cycleCount++;
        }
    }
}
const keyArg = process.argv.slice(2).find(a => !a.startsWith('--'));
if (keyArg) {
    // Одноразовий запуск без проксі (proxy = null, proxyIndex = 1)
    // Одноразовий запуск — робимо примітивний scheduler
    const singleScheduler = new ProxyScheduler([]); // або Object.values(loadProxies())
    runTrade(keyArg, singleScheduler)
        .catch(err => console.error(err))
        .then(() => process.exit(0));
} else {
    // Стандартний нескінченний цикл
    main().catch(err => console.error(`Fatal error: ${err.message}`));
}