// src/exchanges/Btse.js
import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

class Btse {
    constructor() {
        this.apiUrl = 'https://api.btse.com/spot/api/v3.2'; // Оновлений базовий URL
        this.proxyUrl = null;
    }

    /**
     * Налаштування проксі для запитів
     * @param {string} proxyUrl - URL проксі-сервера (socks5://...)
     */
    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl;
    }

    async getOrderBook(pair) {
        const url = `${this.apiUrl}/orderbook`;
        const params = new URLSearchParams({
            symbol: pair,  // Формат: ATH-USDT, DEFI-USDT
            depth: '100'
        });
        const fullUrl = `${url}?${params.toString()}`;

        const options = {};
        if (this.proxyUrl) {
            console.info(`Btse: using proxy ${this.proxyUrl} for request to ${fullUrl}`);
            options.agent = new SocksProxyAgent(this.proxyUrl);
        }

        try {
            console.info(`Btse getOrderBook URL: ${fullUrl}`);
            const response = await fetch(fullUrl, options);
            if (!response.ok) {
                console.error(`API error: ${response.status} ${response.statusText}`);
                return null;
            }
            const text = await response.text();
            if (!text) {
                console.error('Порожня відповідь від API BTSE');
                return null;
            }
            let data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                console.error('JSON parse error:', err.message);
                console.error('Отримано:', text);
                return null;
            }
            if (!data.buyQuote || !data.sellQuote) {
                console.error('Некоректна структура ордербуку:', data);
                return null;
            }
            return data;
        } catch (err) {
            console.error('Btse getOrderBook error:', err);
            return null;
        }
    }

    async simulateBuy(usdtAmount, pair, commissionRate = 0.0018) {
        const orderbook = await this.getOrderBook(pair);
        if (!orderbook) {
            console.error('simulateBuy: Orderbook is null');
            return null;
        }
        const asks = orderbook.sellQuote;
        let budget = usdtAmount;
        let tokensBought = 0.0;
        for (const ask of asks) {
            const price = parseFloat(ask.price);
            const available = parseFloat(ask.size);
            const costFull = price * available;
            if (budget <= 0) break;
            if (budget >= costFull) {
                const effectiveTokens = available * (1 - commissionRate);
                tokensBought += effectiveTokens;
                budget -= costFull;
            } else {
                const toBuy = budget / price;
                tokensBought += toBuy * (1 - commissionRate);
                budget = 0;
                break;
            }
        }
        console.log(`Симуляція покупки:\nЗа ${usdtAmount} USDT отримано: ${tokensBought.toFixed(8)} токенів (з урахуванням комісії)\nЗалишок бюджету: ${budget.toFixed(8)} USDT`);
        return { tokensBought, usdtSpent: usdtAmount - budget };
    }

    async simulateSell(tokensToSell, pair, commissionRate = 0.0018) {
        const orderbook = await this.getOrderBook(pair);
        if (!orderbook) {
            console.error('simulateSell: Orderbook is null');
            return null;
        }
        const bids = orderbook.buyQuote;
        let usdtReceived = 0.0;
        let remaining = tokensToSell;
        for (const bid of bids) {
            const price = parseFloat(bid.price);
            const available = parseFloat(bid.size);
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
        if (remaining > 0) console.warn('Попередження: не вистачає bid-ордерів для продажу всієї кількості токенів!');
        else console.log(`Симуляція продажу:\nОтримано USDT: ${usdtReceived.toFixed(8)} (з урахуванням комісії)`);
        return { usdtReceived, tokensSold: tokensToSell - remaining };
    }
}

export default Btse;