import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

class Kucoin {
    constructor() {
        this.baseUrl = 'https://api.kucoin.com';
        this.proxyUrl = null;
    }

    /**
     * Встановити URL проксі (SOCKS5)
     * @param {string} proxyUrl - URL проксі-сервера
     */
    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl;
        console.info(`Kucoin proxy set to: ${this.proxyUrl}`);
    }

    /**
     * Отримати книгу ордерів
     * @param {string} symbol - торговий символ (наприклад, 'BTC-USDT')
     * @param {number} limit - кількість рівнів
     */
    async getOrderBook(symbol, limit = 100) {
        let endpoint = '/api/v1/market/orderbook/level2';
        let url = `${this.baseUrl}${endpoint}?symbol=${symbol}&limit=${limit}`;
        const options = {};
        if (this.proxyUrl) {
            options.agent = new SocksProxyAgent(this.proxyUrl);
            console.info(`Kucoin getOrderBook: using proxy ${this.proxyUrl}`);
        } else {
            console.info('Kucoin getOrderBook: no proxy configured');
        }
        try {
            let res = await fetch(url, options);
            if (res.status === 404) {
                // Якщо перший endpoint повернув 404, спробувати альтернативний
                endpoint = '/api/v1/market/orderbook/level2_20';
                url = `${this.baseUrl}${endpoint}?symbol=${symbol}&limit=${limit}`;
                console.info(`Kucoin getOrderBook: retrying with fallback endpoint, URL: ${url}`);
                res = await fetch(url, options);
            }
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
            const data = await res.json();
            if (data.code !== '200000') throw new Error(`Kucoin API error: ${data.msg}`);
            return data.data; // містить bids та asks
        } catch (err) {
            console.error('Kucoin getOrderBook error:', err);
            return null;
        }
    }

    /**
     * Симуляція продажу токенів
     */
    async simulateSell(tokensToSell, symbol, commissionRate = 0.001) {
        const orderBook = await this.getOrderBook(symbol);
        if (!orderBook) {
            console.error('Kucoin simulateSell: Orderbook is null');
            return null;
        }
        let usdtReceived = 0;
        let tokensRemaining = tokensToSell;
        for (const [priceStr, sizeStr] of orderBook.bids) {
            const price = parseFloat(priceStr);
            const size = parseFloat(sizeStr);
            if (tokensRemaining <= 0) break;
            if (tokensRemaining > size) {
                usdtReceived += size * price * (1 - commissionRate);
                tokensRemaining -= size;
            } else {
                usdtReceived += tokensRemaining * price * (1 - commissionRate);
                tokensRemaining = 0;
                break;
            }
        }
        console.log(`Kucoin simulateSell: Отримано USDT: ${usdtReceived.toFixed(8)}`);
        return { usdtReceived, tokensSold: tokensToSell - tokensRemaining };
    }

    /**
     * Симуляція покупки токенів
     */
    async simulateBuy(usdtAmount, symbol, commissionRate = 0.001) {
        const orderBook = await this.getOrderBook(symbol);
        if (!orderBook) {
            console.error('Kucoin simulateBuy: Orderbook is null');
            return null;
        }
        let budget = usdtAmount;
        let tokensBought = 0;
        for (const [priceStr, sizeStr] of orderBook.asks) {
            const price = parseFloat(priceStr);
            const size = parseFloat(sizeStr);
            const cost = price * size;
            if (budget <= 0) break;
            if (budget >= cost) {
                tokensBought += size * (1 - commissionRate);
                budget -= cost;
            } else {
                const tokensToBuy = budget / price;
                tokensBought += tokensToBuy * (1 - commissionRate);
                budget = 0;
                break;
            }
        }
        console.log(`Kucoin simulateBuy: За ${usdtAmount} USDT отримано: ${tokensBought.toFixed(8)} токенів, залишок: ${budget.toFixed(8)} USDT`);
        return { tokensBought, usdtSpent: usdtAmount - budget };
    }

    /**
     * Повна симуляція торгівлі: купівля + продаж
     */
    async simulateTrade(usdtAmount, symbol, commissionRate = 0.001) {
        const buyResult = await this.simulateBuy(usdtAmount, symbol, commissionRate);
        if (!buyResult || !buyResult.tokensBought) {
            console.error('Kucoin simulateTrade: Покупку не вдалося виконати');
            return null;
        }
        const sellResult = await this.simulateSell(buyResult.tokensBought, symbol, commissionRate);
        if (!sellResult) {
            console.error('Kucoin simulateTrade: Продаж не вдалося виконати');
            return null;
        }
        return {
            tokensBought: buyResult.tokensBought,
            usdtReceived: sellResult.usdtReceived,
            usdtSpent: buyResult.usdtSpent,
        };
    }
}

export default Kucoin;