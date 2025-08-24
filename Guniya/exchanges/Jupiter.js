// src/exchanges/Jupiter.js
import axios from 'axios';
import Bottleneck from 'bottleneck';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { JupNetwork } from '../networks/JupNetwork.js';

class Jupiter {
    static RATE_LIMIT  = 480;
    static TIME_PERIOD = 60 * 1000;

    constructor({ slippageBps = 50 } = {}) {
        this._baseUrl    = 'https://lite-api.jup.ag/swap/v1';
        this.slippageBps = slippageBps;
        this.limiter     = new Bottleneck({
            reservoir:              Jupiter.RATE_LIMIT,
            reservoirRefreshAmount: Jupiter.RATE_LIMIT,
            reservoirRefreshInterval: Jupiter.TIME_PERIOD,
            maxConcurrent:          1,
        });
    }

    async getQuote(params, proxy, uid) {
        const url = `${this._baseUrl}/quote`;
        const config = { params, timeout: 3000 };
        if (proxy) {
            const agent = new SocksProxyAgent(proxy);
            config.httpAgent = agent;
            config.httpsAgent = agent;
            config.proxy = false;
        }
        try {
            const res = await this.limiter.schedule(() => axios.get(url, config));
            return res.data;
        } catch (e) {
            console.error(`Jupiter quote error | UUID:${uid} |`, e.response?.data || e.message);
            return null;
        }
    }

    getOutputAmount(resp, pair, uid) {
        try {
            const amt = parseInt(resp.outAmount, 10);
            return amt / 10 ** pair.output.decimals;
        } catch (e) {
            console.error(`Jupiter parse error | UUID:${uid} |`, e.message);
            return null;
        }
    }

    getParams(pair, amount) {
        return {
            inputMint:                  pair.input.address,
            outputMint:                 pair.output.address,
            amount:                     Math.floor(amount * 10 ** pair.input.decimals).toString(),
            slippageBps:                this.slippageBps,
            restrictIntermediateTokens: true,
        };
    }

    async processing(pair, amount, proxy, uid) {
        if (!JupNetwork.includes(pair.chain)) {
            console.error(`Jupiter: network ${pair.chain} not supported | UUID:${uid}`);
            return null;
        }
        const params = this.getParams(pair, amount);
        const quote  = await this.getQuote(params, proxy, uid);
        return quote ? this.getOutputAmount(quote, pair, uid) : null;
    }

    generateSwapUrl(from, to) {
        return `https://jup.ag/swap/${from}-${to}`;
    }
}

export default Jupiter;
