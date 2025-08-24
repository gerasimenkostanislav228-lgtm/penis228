import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

class Bitmart {
    constructor() {
        this.apiUrl = 'https://api-cloud.bitmart.com';
        this.proxyUrl = null;
    }

    /**
     * Налаштування проксі для запитів
     * @param {string} proxyUrl - URL проксі-сервера (socks5://...)
     */
    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl;
    }

    /**
     * Fetches ticker data for a specific symbol via public REST v3 endpoint.
     * Endpoint: GET /spot/quotation/v3/ticker?symbol={symbol}
     */
    async getTicker(symbol) {
        const url = `${this.apiUrl}/spot/quotation/v3/ticker?symbol=${symbol}`;
        const options = {};
        if (this.proxyUrl) {
            console.info(`Bitmart: using proxy ${this.proxyUrl} for request to ${url}`);
            options.agent = new SocksProxyAgent(this.proxyUrl);
        }
        try {
            const res = await fetch(url, options);
            const json = await res.json();
            if (json.code !== 1000) {
                console.error(`Bitmart ticker API error: code=${json.code}, msg=${json.message}`);
                return null;
            }
            return json.data;  // contains ask_px, bid_px, etc.
        } catch (err) {
            console.error('Bitmart getTicker exception:', err);
            return null;
        }
    }

    /**
     * Simulates buying tokens using ask price.
     * Commission defaults to 0.1%.
     */
    async simulateBuy(usdtAmount, symbol, commissionRate = 0.001) {
        const ticker = await this.getTicker(symbol);
        if (!ticker || !ticker.ask_px) return null;
        const price = parseFloat(ticker.ask_px);
        if (isNaN(price) || price <= 0) return null;
        const gross = usdtAmount / price;
        const net = gross * (1 - commissionRate);
        return { tokensBought: net, usdtSpent: usdtAmount };
    }

    /**
     * Simulates selling tokens using bid price.
     * Commission defaults to 0.1%.
     */
    async simulateSell(tokenAmount, symbol, commissionRate = 0.001) {
        const ticker = await this.getTicker(symbol);
        if (!ticker || !ticker.bid_px) return null;
        const price = parseFloat(ticker.bid_px);
        if (isNaN(price) || price <= 0) return null;
        const gross = tokenAmount * price;
        const net = gross * (1 - commissionRate);
        return { usdtReceived: net, tokensSold: tokenAmount };
    }
}

export default Bitmart;
