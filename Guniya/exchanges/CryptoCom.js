import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

class CryptoCom {
    constructor() {
        this.ORDER_BOOK_URL = 'https://api.crypto.com/v2/public/get-book';
        this.proxyUrl = null;
    }

    /**
     * Встановлює проксі-сервер для запитів
     */
    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl;
    }

    /**
     * Отримує книгу ордерів через проксі (якщо задано)
     * @param {string} symbol - Символ інструменту, напр. 'BTC_USDT'
     * @param {number} depth - Глибина (кількість рівнів) книги ордерів
     * @returns {{asks: Array, bids: Array}|null}
     */
    async getOrderBook(symbol, depth = 100) {
        const params = new URLSearchParams({ instrument_name: symbol, depth });
        const url = `${this.ORDER_BOOK_URL}?${params.toString()}`;
        const options = {};

        if (this.proxyUrl) {
            console.info(`Crypto.com: використовується проксі → ${this.proxyUrl}`);
            options.agent = new SocksProxyAgent(this.proxyUrl);
            // Перевірка вихідного IP через проксі
            try {
                const ipRes = await fetch('https://ifconfig.me/ip', options);
                const ip = (await ipRes.text()).trim();
                console.info(`Crypto.com IP через проксі: ${ip}`);
            } catch (e) {
                console.warn('Crypto.com: не вдалося отримати IP через проксі:', e.message);
            }
        }

        try {
            const res = await fetch(url, options);
            if (!res.ok) {
                console.error(`Crypto.com getOrderBook HTTP error: ${res.status}`);
                return null;
            }
            const json = await res.json();
            if (json.code !== 0 || !json.result || !Array.isArray(json.result.data) || json.result.data.length === 0) {
                console.error(`Crypto.com getOrderBook API error або відсутні дані: code=${json.code}, msg=${json.msg}`);
                return null;
            }
            const book = json.result.data[0];
            if (!Array.isArray(book.asks) || !Array.isArray(book.bids)) {
                console.error(`Crypto.com getOrderBook: некоректна структура для ${symbol}`);
                return null;
            }
            return { asks: book.asks, bids: book.bids };
        } catch (err) {
            console.error('Crypto.com getOrderBook exception:', err);
            return null;
        }
    }

    /**
     * Симуляція покупки токенів за USDT з урахуванням комісії
     * @param {number} usdtAmount - Сума в USDT
     * @param {string} symbol - Символ пари, напр. 'BTC_USDT'
     * @param {number} commissionRate - Комісія (в долях), дефолт 0.5%
     * @returns {{tokensBought: number, usdtSpent: number}|null}
     */
    async simulateBuy(usdtAmount, symbol, commissionRate = 0.005) {
        const ob = await this.getOrderBook(symbol);
        if (!ob) return null;
        const { asks } = ob;
        let budget = usdtAmount;
        let totalCoin = 0;

        for (const [priceStr, sizeStr] of asks) {
            const price = parseFloat(priceStr);
            const available = parseFloat(sizeStr);
            if (isNaN(price) || isNaN(available) || budget <= 0) continue;

            const maxCost = price * available;
            if (budget >= maxCost) {
                totalCoin += available;
                budget -= maxCost;
            } else {
                const qty = budget / price;
                totalCoin += qty;
                budget = 0;
                break;
            }
        }

        const netCoin = totalCoin * (1 - commissionRate);
        console.info(`Crypto.com simulateBuy: куплено ${netCoin.toFixed(8)} токенів за ${usdtAmount} USDT`);
        return { tokensBought: netCoin, usdtSpent: usdtAmount - budget };
    }

    /**
     * Симуляція продажу токенів за USDT з урахуванням комісії
     * @param {number} tokenAmount - Кількість токенів для продажу
     * @param {string} symbol - Символ пари, напр. 'BTC_USDT'
     * @param {number} commissionRate - Комісія (в долях), дефолт 0.5%
     * @returns {{usdtReceived: number, tokensSold: number}|null}
     */
    async simulateSell(tokenAmount, symbol, commissionRate = 0.005) {
        const ob = await this.getOrderBook(symbol);
        if (!ob) return null;
        const { bids } = ob;
        let remaining = tokenAmount;
        let totalUsd = 0;

        for (const [priceStr, sizeStr] of bids) {
            const price = parseFloat(priceStr);
            const available = parseFloat(sizeStr);
            if (isNaN(price) || isNaN(available) || remaining <= 0) continue;

            if (remaining > available) {
                totalUsd += available * price;
                remaining -= available;
            } else {
                totalUsd += remaining * price;
                remaining = 0;
                break;
            }
        }

        const netUsd = totalUsd * (1 - commissionRate);
        console.info(`Crypto.com simulateSell: отримано ${netUsd.toFixed(8)} USDT за ${tokenAmount} токенів`);
        return { usdtReceived: netUsd, tokensSold: tokenAmount - remaining };
    }
}

export default CryptoCom;
