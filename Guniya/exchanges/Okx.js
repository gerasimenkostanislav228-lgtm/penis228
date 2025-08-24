// src/exchanges/Okx.js

import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

/**
 * Minimal public‑REST adapter for OKX spot (no API key required).
 * Docs: https://www.okx.com/docs-v5/en/#overview
 */
class Okx {
    constructor () {
        this.apiUrl = 'https://www.okx.com';
        this.proxyUrl = null;
        this.supportedSymbols = null; // cache of instIds like BTC-USDT
    }

    /**
     * @param {string} proxyUrl socks5://host:port or http://
     */
    setProxy (proxyUrl) {
        this.proxyUrl = proxyUrl;
    }

    /**
     * OKX calls trading pairs *instruments* (instId) with dash, e.g. BTC-USDT.
     * We fetch once and cache full list so further symbol checks are local.
     */
    async fetchSupportedSymbols () {
        if (this.supportedSymbols) return this.supportedSymbols;

        const url = `${this.apiUrl}/api/v5/market/tickers?instType=SPOT`;
        const opts = {};
        if (this.proxyUrl) opts.agent = new SocksProxyAgent(this.proxyUrl);

        try {
            const res = await fetch(url, opts);
            const json = await res.json();
            if (json.code !== '0') throw new Error(`Code ${json.code}`);
            this.supportedSymbols = json.data.map(t => t.instId.toUpperCase());
        } catch (e) {
            console.error('OKX fetchSupportedSymbols error:', e.message);
            this.supportedSymbols = [];
        }
        return this.supportedSymbols;
    }

    /**
     * Order book depth.
     * @param {string} instId like "BTC-USDT"
     * @param {number|string} sz book size (1‒400)
     * @returns {{asks: Array<[string,string]>, bids: Array<[string,string]>}|null}
     */
    async getOrderBook (instId, sz = 200) {
        const list = await this.fetchSupportedSymbols();
        if (!list.includes(instId.toUpperCase())) {
            console.warn(`OKX: instId ${instId} not supported`);
            return null;
        }

        const url = `${this.apiUrl}/api/v5/market/books?instId=${instId}&sz=${sz}`;
        const opts = {};
        if (this.proxyUrl) opts.agent = new SocksProxyAgent(this.proxyUrl);

        try {
            const res = await fetch(url, opts);
            const json = await res.json();
            if (json.code !== '0' || !json.data?.length) return null;
            const book = json.data[0]; // { asks:[[p,q, …],…], bids:[[p,q,…],…] }
            return { asks: book.asks.map(a => [a[0], a[1]]), bids: book.bids.map(b => [b[0], b[1]]) };
        } catch (e) {
            console.error('OKX getOrderBook error:', e.message);
            return null;
        }
    }

    /**
     * Simple depth walk simulation (same as Mexc/Bitget).
     */
    async simulateBuy (usdtAmount, instId, commissionRate = 0.001) {
        const ob = await this.getOrderBook(instId);
        if (!ob) return null;

        let budget = usdtAmount;
        let tokensGross = 0;
        for (const [priceStr, qtyStr] of ob.asks) {
            const price = parseFloat(priceStr);
            const avail = parseFloat(qtyStr);
            const cost = price * avail;
            if (budget >= cost) {
                tokensGross += avail;
                budget -= cost;
            } else {
                const part = budget / price;
                tokensGross += part;
                budget = 0;
                break;
            }
        }
        const tokensNet = tokensGross * (1 - commissionRate);
        return { tokensBought: tokensNet, usdtSpent: usdtAmount - budget, commission: tokensGross - tokensNet };
    }

    async simulateSell (tokenQty, instId, commissionRate = 0.001) {
        const ob = await this.getOrderBook(instId);
        if (!ob) return null;

        let qtyLeft = tokenQty;
        let gross = 0;
        for (const [priceStr, qtyStr] of ob.bids) {
            const price = parseFloat(priceStr);
            const avail = parseFloat(qtyStr);
            if (qtyLeft > avail) {
                gross += avail * price;
                qtyLeft -= avail;
            } else {
                gross += qtyLeft * price;
                qtyLeft = 0;
                break;
            }
        }
        const net = gross * (1 - commissionRate);
        return { usdtReceived: net, tokensSold: tokenQty - qtyLeft, commission: gross - net };
    }
}

export default Okx;
