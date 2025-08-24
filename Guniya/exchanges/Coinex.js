// src/exchanges/Coinex.js

import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

/**
 * Thin public-REST adapter for CoinEx spot API v2 (no API-key needed).
 * Docs: https://docs.coinex.com/api/v2/
 */
class Coinex {
    constructor () {
        this.apiUrl = 'https://api.coinex.com';
        this.proxyUrl = null;
        this.supported = null; // cache of market strings, e.g. BTCUSDT
    }

    /**
     * Attach a SOCKS / HTTP proxy (same convention as other CEX files).
     * @param {string} proxyUrl "socks5://host:port" | "http://host:port"
     */
    setProxy (proxyUrl) {
        this.proxyUrl = proxyUrl;
    }

    // ───────────────────────────────── fetch symbols
    async fetchSupportedSymbols () {
        if (this.supported) return this.supported;

        const url = `${this.apiUrl}/v2/spot/ticker`; // returns all markets
        const opts = {};
        if (this.proxyUrl) opts.agent = new SocksProxyAgent(this.proxyUrl);

        try {
            const res = await fetch(url, opts);
            const json = await res.json();
            if (json.code !== 0 && json.code !== '0') throw new Error(`Code ${json.code}`);
            // data.ticker is array of { market:"BTCUSDT", … }
            this.supported = json.data.ticker.map(t => t.market.toUpperCase());
        } catch (e) {
            console.error('Coinex fetchSupportedSymbols error:', e.message);
            this.supported = [];
        }
        return this.supported;
    }

    // ───────────────────────────────── depth endpoint
    async getOrderBook (market, limit = 200, interval = 0) {
        const list = await this.fetchSupportedSymbols();
        if (!list.includes(market.toUpperCase())) {
            console.warn(`Coinex: market ${market} not supported`);
            return null;
        }
        const url = `${this.apiUrl}/v2/spot/market/depth?market=${market}&limit=${limit}&interval=${interval}`;
        const opts = {};
        if (this.proxyUrl) opts.agent = new SocksProxyAgent(this.proxyUrl);

        try {
            const res = await fetch(url, opts);
            const json = await res.json();
            if (json.code !== 0 && json.code !== '0') return null;
            const { asks, bids } = json.data;
            return { asks, bids };
        } catch (e) {
            console.error('Coinex getOrderBook error:', e.message);
            return null;
        }
    }

    // ───────────────────────────────── quick depth-walk sim
    async simulateBuy (usdtAmount, market, commissionRate = 0.001) {
        const ob = await this.getOrderBook(market);
        if (!ob) return null;
        let budget = usdtAmount;
        let bought = 0;
        for (const [priceStr, qtyStr] of ob.asks) {
            const price = parseFloat(priceStr);
            const avail = parseFloat(qtyStr);
            const costFull = price * avail;
            if (budget >= costFull) {
                bought += avail;
                budget -= costFull;
            } else {
                const partial = budget / price;
                bought += partial;
                budget = 0;
                break;
            }
        }
        const net = bought * (1 - commissionRate);
        return { tokensBought: net, usdtSpent: usdtAmount - budget, commission: bought - net };
    }

    async simulateSell (tokenQty, market, commissionRate = 0.001) {
        const ob = await this.getOrderBook(market);
        if (!ob) return null;
        let left = tokenQty;
        let gross = 0;
        for (const [priceStr, qtyStr] of ob.bids) {
            const price = parseFloat(priceStr);
            const avail = parseFloat(qtyStr);
            if (left > avail) {
                gross += avail * price;
                left -= avail;
            } else {
                gross += left * price;
                left = 0;
                break;
            }
        }
        const net = gross * (1 - commissionRate);
        return { usdtReceived: net, tokensSold: tokenQty - left, commission: gross - net };
    }
}

export default Coinex;
