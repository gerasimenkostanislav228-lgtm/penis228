import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

class Binance {
    constructor() {
        this.apiUrl = 'https://api.binance.com';
        this.proxyUrl = null;
    }

    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl;
    }

    async getOrderBook(symbol) {
        const url = `${this.apiUrl}/api/v3/depth?symbol=${symbol}&limit=100`;
        const options = {};
        if (this.proxyUrl) {
            console.info(`Binance: using proxy ${this.proxyUrl} for request to ${url}`);
            options.agent = new SocksProxyAgent(this.proxyUrl);
        }
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            const data = await response.json();
            return { asks: data.asks, bids: data.bids };
        } catch (err) {
            console.error('Binance getOrderBook error:', err);
            return null;
        }
    }

    async simulateBuy(usdtAmount, symbol, commissionRate = 0.001) {
        const ob = await this.getOrderBook(symbol);
        if (!ob) return null;

        let budget = usdtAmount;
        let tokensGross = 0;

        for (const [priceStr, qtyStr] of ob.asks) {
            const price = parseFloat(priceStr);
            const qty = parseFloat(qtyStr);
            const cost = price * qty;

            if (budget >= cost) {
                tokensGross += qty;
                budget -= cost;
            } else {
                const partialQty = budget / price;
                tokensGross += partialQty;
                budget = 0;
                break;
            }
        }

        const commission = tokensGross * commissionRate;
        const tokensNet = tokensGross - commission;
        return { tokensBought: tokensNet, usdtSpent: usdtAmount - budget, commission };
    }

    async simulateSell(tokensToSell, symbol, commissionRate = 0.001) {
        const ob = await this.getOrderBook(symbol);
        if (!ob) return null;

        let remaining = tokensToSell;
        let gross = 0;

        for (const [priceStr, qtyStr] of ob.bids) {
            const price = parseFloat(priceStr);
            const qty = parseFloat(qtyStr);

            if (remaining > qty) {
                gross += qty * price;
                remaining -= qty;
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

export default Binance;
