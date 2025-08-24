// src/dexes/CoWSwap.js
import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';
import Bottleneck from 'bottleneck';

const cowLimiter = new Bottleneck({ maxConcurrent: 3, minTime: 400 });

/** Безвтратне перетворення десяткового amount -> ціле зі вказаними decimals */
function decimalToInt(amount, decimals) {
    // amount може бути number | string
    const s = String(amount);
    if (!s.includes('.')) return BigInt(s) * BigInt(10 ** 0) * BigInt(10) ** BigInt(decimals);
    const [int, fracRaw] = s.split('.');
    const frac = fracRaw.slice(0, decimals); // відкидаємо зайві
    const fracPad = frac + '0'.repeat(decimals - frac.length);
    return BigInt(int || '0') * (BigInt(10) ** BigInt(decimals)) + BigInt(fracPad || '0');
}

/** Зручний abort із тайм‑аутом */
function withTimeout(ms = 10000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(new Error(`Timeout ${ms}ms`)), ms);
    return { signal: controller.signal, clear: () => clearTimeout(t) };
}

/** Заголовки щоб менш імовірно впиратися у WAF */
const defaultHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Origin': 'https://api.cow.fi',
    'Referer': 'https://api.cow.fi/',
};

/** Створення SOCKS‑агента з параметрами з’єднання */
function makeSocksAgent(proxyUrl, keepAlive) {
    const agent = new SocksProxyAgent(proxyUrl, {
        keepAlive,
        // нижче опції проходять у внутрішній https.Agent
        timeout: 8000,
        keepAliveMsecs: 5000,
        maxSockets: 16,
        maxFreeSockets: 8,
    });
    return agent;
}

class CoWSwap {
    constructor() {
        this.proxyUrl = null;
    }

    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl || null;
    }

    /** Один запит із обраним агентом */
    async _postOnce(url, body, agent, tag) {
        const { signal, clear } = withTimeout(12000);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: defaultHeaders,
                body: JSON.stringify(body),
                agent,
                signal,
            });

            const text = await res.text(); // читаємо завжди, щоб мати тіло
            if (!res.ok) {
                // спробуємо JSON, якщо це він
                let errPayload = text;
                try { errPayload = JSON.stringify(JSON.parse(text)); } catch {}
                throw new Error(`HTTP ${res.status} ${res.statusText} — ${errPayload}`);
            }

            // успішна відповідь
            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error(`JSON parse error: ${e?.message || e}`);
            }
        } finally {
            clear();
        }
    }

    /** Робимо до 3 спроб: proxy keepalive → proxy close → direct */
    async _postWithFallback(url, body) {
        const attempts = [];
        if (this.proxyUrl) {
            attempts.push({
                name: 'proxy-keepalive',
                agent: makeSocksAgent(this.proxyUrl, true),
            });
            attempts.push({
                name: 'proxy-close',
                agent: makeSocksAgent(this.proxyUrl, false),
            });
        }
        // як крайній випадок — без проксі
        attempts.push({ name: 'direct', agent: undefined });

        let lastErr;
        for (const a of attempts) {
            try {
                return await this._postOnce(url, body, a.agent, a.name);
            } catch (e) {
                lastErr = e;
                console.error(`CoWSwap fetch error (${a.name}): ${e.message}`);
                // невеликий backoff перед наступною спробою
                await new Promise(r => setTimeout(r, 250));
            }
        }
        throw lastErr || new Error('Unknown CoWSwap error');
    }

    async getQuote(params, networkSlug, uniqueIdTag = '') {
        // ВАЖЛИВО: ми НЕ ліземо у твої мапи – тут вживається РІВНО те, що ти передав у network
        // (ти зберігаєш це у networkCow.js і прокидуєш сюди).
        const url = `https://api.cow.fi/${networkSlug}/api/v1/quote`;

        return cowLimiter.schedule(async () => {
            try {
                const data = await this._postWithFallback(url, params);
                return data;
            } catch (e) {
                console.error(`CoWSwap error (getQuote ${uniqueIdTag}, net=${networkSlug}): ${e.message}`);
                return null;
            }
        });
    }

    /** pair: { input: {address, decimals}, output: {...} } ; amount у "людських" одиницях */
    async processing(pair, amount, proxy, uniqueId, networkSlug) {
        if (proxy) this.setProxy(proxy);

        const sellAmount = decimalToInt(amount, pair.input.decimals).toString();

        const params = {
            sellToken: pair.input.address,
            buyToken: pair.output.address,
            from: '0x0000000000000000000000000000000000000000',
            receiver: '0x0000000000000000000000000000000000000000',
            kind: 'sell',
            sellAmountBeforeFee: sellAmount,
        };

        const quote = await this.getQuote(params, networkSlug, uniqueId);
        if (!quote) return null;

        if (quote.errorType || quote.description) {
            console.error(
                `CoWSwap error (${uniqueId}, net=${networkSlug}): ${quote.errorType || 'unknown'} ${quote.description || ''}`
            );
            return null;
        }

        const buyAmount =
            quote.buyAmount ?? quote?.quote?.buyAmount ?? quote?.order?.buyAmount;

        if (!buyAmount) {
            console.error(`CoWSwap error (${uniqueId}, net=${networkSlug}): empty buyAmount`);
            return null;
        }

        // повертаємо у "людських" одиницях
        const out = Number(buyAmount) / 10 ** pair.output.decimals;
        return out;
    }
}

export default CoWSwap;
