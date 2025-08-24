import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

class Mexc {
    constructor() {
        // Використовуємо публічний endpoint для отримання ордербуку (depth)
        this.apiUrl = 'https://api.mexc.com/api/v3/depth';
        this.proxyUrl = null;
    }

    /**
     * Налаштування проксі для запитів
     * @param {string} proxyUrl - URL проксі-сервера (socks5://...)
     */
    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl;
    }

    // Метод для отримання ордербуку для заданої торгової пари
    async getOrderBook(pair) {
        const url = `${this.apiUrl}?symbol=${pair}&limit=200`;
        const options = {};
        if (this.proxyUrl) {
            console.info(`Mexc: using proxy ${this.proxyUrl} for request to ${url}`);
            options.agent = new SocksProxyAgent(this.proxyUrl);
        }
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            const data = await response.json();
            // Припускаємо, що відповідь має формат:
            // { lastUpdateId, bids: [ [price, quantity], ... ], asks: [ [price, quantity], ... ] }
            return data;
        } catch (err) {
            console.error('Mexc getOrderBook error:', err);
            return null;
        }
    }

    // Симуляція покупки токенів за USDT
    async simulateBuy(usdtAmount, pair, commissionRate = 0.001) {
        const orderBook = await this.getOrderBook(pair);
        if (!orderBook) {
            console.error('simulateBuy: Orderbook is null');
            return null;
        }
        const asks = orderBook.asks; // ордери на продаж, у форматі [price, quantity]
        let budget = usdtAmount;
        let tokensBought = 0.0;

        for (const [priceStr, quantityStr] of asks) {
            const price = parseFloat(priceStr);
            const available = parseFloat(quantityStr);
            const costFull = price * available;

            if (budget <= 0) break;

            if (budget >= costFull) {
                // Купуємо весь рівень
                const tokensPurchased = available;
                const effectiveTokens = tokensPurchased * (1 - commissionRate);
                tokensBought += effectiveTokens;
                budget -= costFull;
            } else {
                // Купуємо лише частину рівня, що покривається бюджетом
                const tokensToBuy = budget / price;
                const effectiveTokens = tokensToBuy * (1 - commissionRate);
                tokensBought += effectiveTokens;
                budget = 0;
                break;
            }
        }

        console.log(`Mexc simulateBuy:\nЗа ${usdtAmount} USDT отримано: ${tokensBought.toFixed(8)} токенів (з урахуванням комісії)\nЗалишок бюджету: ${budget.toFixed(8)} USDT`);

        return {
            tokensBought,
            usdtSpent: usdtAmount - budget
        };
    }

    // Симуляція продажу токенів за USDT
    async simulateSell(tokensToSell, pair, commissionRate = 0.001) {
        const orderBook = await this.getOrderBook(pair);
        if (!orderBook) {
            console.error('simulateSell: Orderbook is null');
            return null;
        }
        const bids = orderBook.bids; // ордери на купівлю, у форматі [price, quantity]
        let usdtReceived = 0.0;
        let tokensRemaining = tokensToSell;

        for (const [priceStr, quantityStr] of bids) {
            const price = parseFloat(priceStr);
            const available = parseFloat(quantityStr);

            if (tokensRemaining <= 0) break;

            if (tokensRemaining > available) {
                // Продаємо весь доступний обсяг цього рівня
                const tokensSold = available;
                const effectiveProceeds = tokensSold * price * (1 - commissionRate);
                usdtReceived += effectiveProceeds;
                tokensRemaining -= tokensSold;
            } else {
                // Продаємо решту токенів
                const tokensSold = tokensRemaining;
                const effectiveProceeds = tokensSold * price * (1 - commissionRate);
                usdtReceived += effectiveProceeds;
                tokensRemaining = 0;
                break;
            }
        }

        if (tokensRemaining > 0) {
            console.warn("Mexc simulateSell: не вистачає bid-ордерів для продажу всієї кількості токенів!");
        } else {
            console.log(`Mexc simulateSell:\nОтримано USDT: ${usdtReceived.toFixed(8)} (з урахуванням комісії)`);
        }

        return {
            usdtReceived,
            tokensSold: tokensToSell - tokensRemaining
        };
    }
}

export default Mexc;
