import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

class Gate {
    constructor() {
        this.apiUrl = 'https://api.gateio.ws/api/v4/spot/order_book';
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
     * @param {string} pair - Символ пари, напр. 'BTC_USDT'
     * @param {number} limit - Кількість рівнів (дефолт 100)
     * @returns {Promise<{asks: Array, bids: Array}|null>}
     */
    async getOrderBook(pair, limit = 100) {
        const url = `${this.apiUrl}?currency_pair=${pair}&limit=${limit}`;
        const options = {};

        if (this.proxyUrl) {
            console.info(`Gate: використовується проксі → ${this.proxyUrl}`);
            options.agent = new SocksProxyAgent(this.proxyUrl);
            // Логування IP через проксі
            try {
                const ipRes = await fetch('https://ifconfig.me/ip', options);
                const ip = (await ipRes.text()).trim();
                console.info(`Gate IP через проксі: ${ip}`);
            } catch (e) {
                console.warn('Gate: не вдалося отримати IP через проксі:', e.message);
            }
        }

        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            const data = await response.json();
            return data;
        } catch (err) {
            console.error('Gate getOrderBook error:', err);
            return null;
        }
    }

    /**
     * Симуляція покупки токенів за USDT з урахуванням комісії
     * @param {number} usdtAmount
     * @param {string} pair
     * @param {number} commissionRate
     */
    async simulateBuy(usdtAmount, pair, commissionRate = 0.0001) {
        const orderBook = await this.getOrderBook(pair);
        if (!orderBook) {
            console.error('simulateBuy: Orderbook is null');
            return null;
        }
        const asks = orderBook.asks;
        let budget = usdtAmount;
        let tokensBought = 0.0;

        for (const [priceStr, amountStr] of asks) {
            const price = parseFloat(priceStr);
            const available = parseFloat(amountStr);
            const costFull = price * available;
            if (budget <= 0) break;

            if (budget >= costFull) {
                tokensBought += available * (1 - commissionRate);
                budget -= costFull;
            } else {
                const toBuy = budget / price;
                tokensBought += toBuy * (1 - commissionRate);
                budget = 0;
                break;
            }
        }

        console.info(`Gate simulateBuy: куплено ${tokensBought.toFixed(8)} токенів за ${usdtAmount} USDT`);
        return { tokensBought, usdtSpent: usdtAmount - budget };
    }

    /**
     * Симуляція продажу токенів за USDT з урахуванням комісії
     * @param {number} tokensToSell
     * @param {string} pair
     * @param {number} commissionRate
     */
    async simulateSell(tokensToSell, pair, commissionRate = 0.0001) {
        const orderBook = await this.getOrderBook(pair);
        if (!orderBook) {
            console.error('simulateSell: Orderbook is null');
            return null;
        }
        const bids = orderBook.bids;
        let remaining = tokensToSell;
        let usdtReceived = 0.0;

        for (const [priceStr, amountStr] of bids) {
            const price = parseFloat(priceStr);
            const available = parseFloat(amountStr);
            if (remaining <= 0) break;

            if (remaining > available) {
                usdtReceived += available * price * (1 - commissionRate);
                remaining -= available;
            } else {
                usdtReceived += remaining * price * (1 - commissionRate);
                remaining = 0;
                break;
            }
        }

        console.info(`Gate simulateSell: отримано ${usdtReceived.toFixed(8)} USDT за ${tokensToSell} токенів`);
        return { usdtReceived, tokensSold: tokensToSell - remaining };
    }
}

export default Gate;