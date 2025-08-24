import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

class Kraken {
    constructor() {
        this.apiUrl = 'https://api.kraken.com/0/public';
        this.proxyUrl = null;
    }

    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl;
    }

    async getOrderBook(pair) {
        const url = `${this.apiUrl}/Depth?pair=${pair}&count=100`;
        const options = {};
        if (this.proxyUrl) {
            options.agent = new SocksProxyAgent(this.proxyUrl);
            console.info(`Kraken: using proxy ${this.proxyUrl} for request to ${url}`);
        }
        try {
            const res = await fetch(url, options);
            const json = await res.json();
            if (!json.result || Object.keys(json.result).length === 0) {
                console.warn('Kraken getOrderBook: empty result');
                return null;
            }
            const data = Object.values(json.result)[0];
            return {
                asks: data.asks.map(([price, volume]) => [price, volume]),
                bids: data.bids.map(([price, volume]) => [price, volume]),
            };
        } catch (err) {
            console.error('Kraken getOrderBook error:', err);
            return null;
        }
    }

    async simulateBuy(usdtAmount, pair, commissionRate = 0.0026) {
        const ob = await this.getOrderBook(pair);
        if (!ob) return null;
        let budget = usdtAmount;
        let tokensGross = 0;

        for (const [priceStr, volumeStr] of ob.asks) {
            const price = parseFloat(priceStr);
            const volume = parseFloat(volumeStr);
            const cost = price * volume;
            if (budget >= cost) {
                tokensGross += volume;
                budget -= cost;
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

    async simulateSell(tokensToSell, pair, commissionRate = 0.0026) {
        const ob = await this.getOrderBook(pair);
        if (!ob) return null;
        let remaining = tokensToSell;
        let gross = 0;

        for (const [priceStr, volumeStr] of ob.bids) {
            const price = parseFloat(priceStr);
            const volume = parseFloat(volumeStr);
            if (remaining > volume) {
                gross += volume * price;
                remaining -= volume;
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

export default Kraken;
