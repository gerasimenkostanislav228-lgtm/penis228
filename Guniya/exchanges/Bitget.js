import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

class Bitget {
    constructor() {
        this.apiUrl = 'https://api.bitget.com';
        this.proxyUrl = null;
        this.supportedSymbols = null;
    }

    /**
     * Налаштування проксі для запитів
     * @param {string} proxyUrl - URL проксі-сервера (socks5://...)
     */
    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl;
    }

    async fetchSupportedSymbols() {
        if (this.supportedSymbols) return this.supportedSymbols;
        const url = `${this.apiUrl}/api/v2/spot/public/symbols`;
        const options = {};
        if (this.proxyUrl) {
            console.info(`Bitget: using proxy ${this.proxyUrl} for request to ${url}`);
            options.agent = new SocksProxyAgent(this.proxyUrl);
        }
        try {
            const res = await fetch(url, options);
            const json = await res.json();
            if (json.code === '00000' && Array.isArray(json.data)) {
                this.supportedSymbols = json.data.map(s => s.symbol.toUpperCase());
            } else {
                console.warn('Bitget fetchSupportedSymbols failed, using empty list');
                this.supportedSymbols = [];
            }
        } catch (e) {
            console.error('Bitget fetchSupportedSymbols error:', e);
            this.supportedSymbols = [];
        }
        return this.supportedSymbols;
    }

    async getOrderBook(symbol, type = 'step0', limit = '100') {
        const supported = await this.fetchSupportedSymbols();
        if (!supported.includes(symbol.toUpperCase())) {
            console.warn(`Bitget: symbol ${symbol} not supported`);
            return null;
        }
        const options = {};
        const primaryUrl = `${this.apiUrl}/api/v2/spot/market/orderbook?symbol=${symbol}&type=${type}&limit=${limit}`;
        if (this.proxyUrl) {
            console.info(`Bitget: using proxy ${this.proxyUrl} for request to ${primaryUrl}`);
            options.agent = new SocksProxyAgent(this.proxyUrl);
        }
        try {
            const res = await fetch(primaryUrl, options);
            const json = await res.json();
            if (json.code === '00000' && json.data?.asks?.length && json.data?.bids?.length) {
                return json.data;
            }
        } catch (err) {
            console.error('Bitget getOrderBook primary error:', err);
        }

        // Fallback endpoint
        const fallbackUrl = `${this.apiUrl}/api/spot/v1/market/merge-depth?symbol=${symbol}&precision=scale0&limit=${limit}`;
        if (this.proxyUrl) {
            console.info(`Bitget: using proxy ${this.proxyUrl} for request to ${fallbackUrl}`);
            options.agent = new SocksProxyAgent(this.proxyUrl);
        }
        try {
            const res = await fetch(fallbackUrl, options);
            const json = await res.json();
            if (json.code === '00000' && json.data?.asks?.length && json.data?.bids?.length) {
                return { asks: json.data.asks, bids: json.data.bids };
            }
        } catch (err) {
            console.error('Bitget getOrderBook fallback error:', err);
        }

        return null;
    }

    /**
     * Симуляція покупки токенів за USDT
     */
    async simulateBuy(usdtAmount, symbol, commissionRate = 0.001) {
        const ob = await this.getOrderBook(symbol);
        if (!ob) return null;
        let budget = usdtAmount;
        let tokensGross = 0;
        for (const [priceStr, sizeStr] of ob.asks) {
            const price = parseFloat(priceStr);
            const available = parseFloat(sizeStr);
            const costFull = price * available;
            if (budget >= costFull) {
                tokensGross += available;
                budget -= costFull;
            } else {
                const toBuy = budget / price;
                tokensGross += toBuy;
                budget = 0;
                break;
            }
        }
        const commission = tokensGross * commissionRate;
        const tokensNet = tokensGross - commission;
        return { tokensBought: tokensNet, usdtSpent: usdtAmount - budget, commission };
    }

    /**
     * Симуляція продажу токенів за USDT
     */
    async simulateSell(tokensToSell, symbol, commissionRate = 0.001) {
        const ob = await this.getOrderBook(symbol);
        if (!ob) return null;
        let remaining = tokensToSell;
        let gross = 0;
        for (const [priceStr, sizeStr] of ob.bids) {
            const price = parseFloat(priceStr);
            const available = parseFloat(sizeStr);
            if (remaining > available) {
                gross += available * price;
                remaining -= available;
            } else {
                gross += remaining * price;
                remaining = 0;
                break;
            }
        }
        const commission = gross * commissionRate;
        const net = gross - commission;
        return { usdtReceived: net, tokensSold: tokensToSell - remaining, commission };
    }
}

export default Bitget;
