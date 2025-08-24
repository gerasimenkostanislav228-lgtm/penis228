import axios from 'axios';
import Bottleneck from 'bottleneck';
import { SocksProxyAgent } from 'socks-proxy-agent';
import magpieNetworks from '../networks/networkMagpie.js';

class Magpie {
    constructor() {
        this.apiUrl = 'https://api.fly.trade/aggregator/quote';
        this.proxyUrl = null;
        this.limiter = new Bottleneck({ maxConcurrent: 1, minTime: 120 });
    }

    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl;
    }

    async getQuote(params) {
        const config = {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        };

        if (this.proxyUrl) {
            const agent = new SocksProxyAgent(this.proxyUrl);
            config.httpAgent = agent;
            config.httpsAgent = agent;
        }

        try {
            const response = await this.limiter.schedule(() =>
                axios.get(this.apiUrl, { ...config, params })
            );
            return response.data;
        } catch (error) {
            console.error('Magpie getQuote error:', error.message);
            return null;
        }
    }

    async processing(pair, amount, proxy, uniqueId, network) {
        if (!magpieNetworks[network]) {
            console.error(`Magpie does not support network: ${network}`);
            return null;
        }

        if (proxy) this.setProxy(proxy);

        const fromAddress = '0x0000000000000000000000000000000000000000';
        const amountStr = BigInt(Math.floor(amount * 10 ** pair.input.decimals)).toString();

        const params = {
            network: magpieNetworks[network].chain,
            fromTokenAddress: pair.input.address,
            toTokenAddress: pair.output.address,
            sellAmount: amountStr,
            slippage: '0.01',
            fromAddress,
            toAddress: fromAddress,
            gasless: 'false'
        };

        const quote = await this.getQuote(params);
        if (!quote || (!quote.toTokenAmount && !quote.amountOut)) {
            console.error(`Magpie quote failed for ${uniqueId}`, quote);
            return null;
        }

        try {
            const raw = quote.amountOut ?? quote.toTokenAmount;
            const decimals = pair.output.decimals;
            return Number(raw) / Math.pow(10, decimals);
        } catch (e) {
            console.error(`Magpie parse error (${uniqueId}):`, e.message);
            return null;
        }
    }
}

export default Magpie;
