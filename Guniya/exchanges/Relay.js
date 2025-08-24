
import axios from 'axios';
import Bottleneck from 'bottleneck';
import networkTags from '../networks/networkRelay.js';
import { SocksProxyAgent } from 'socks-proxy-agent';

class Relay {
    static RATE_LIMIT = 300;
    static TIME_PERIOD = 60 * 1000;

    constructor() {
        this._baseUrl = 'https://api.relay.link/quote';
        this.limiter = new Bottleneck({
            maxConcurrent: 1,
            minTime: Relay.TIME_PERIOD / Relay.RATE_LIMIT,
        });
    }

    async getQuote(params, proxyUrl, uniqueId) {
        const headers = { 'Content-Type': 'application/json' };
        try {
            const axiosConfig = {
                headers,
                timeout: 15000,
            };
            if (proxyUrl) {
                const agent = new SocksProxyAgent(proxyUrl);
                axiosConfig.httpAgent = agent;
                axiosConfig.httpsAgent = agent;
            }
            console.info(`Relay [${uniqueId}] - Request params: ${JSON.stringify(params)}`);
            const response = await this.limiter.schedule(() => axios.post(this._baseUrl, params, axiosConfig));
            return response.data;
        } catch (e) {
            console.error(`Relay [${uniqueId}] - Request failed: ${e.message}`);
            return null;
        }
    }

    getOutputAmount(response, pair, uniqueId) {
        try {
            const amount = parseFloat(response.details?.currencyOut?.amount || '0');
            const decimals = pair.output.decimals;
            return amount / Math.pow(10, decimals);
        } catch (e) {
            console.error(`Relay [${uniqueId}] - Failed to parse output amount: ${e.message}`);
            return null;
        }
    }

    getParams(pair, amount, network) {
        const inputDecimals = pair.input.decimals;
        const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputDecimals)).toLocaleString('fullwide', { useGrouping: false });

        const net = networkTags[network];
        const chainId = net?.chainId;
        if (!chainId) {
            console.error(`Relay - Unsupported network ${network}`);
        }

        return {
            originChainId: chainId,
            destinationChainId: chainId,
            originCurrency: pair.input.address,
            destinationCurrency: pair.output.address,
            amount: amountInSmallestUnit,
            user: '0x000000000000000000000000000000000000dEaD',
            tradeType: 'EXACT_INPUT',
            slippage: 1
        };
    }

    async processing(pair, amount, proxyUrl, uniqueId, network) {
        const params = this.getParams(pair, amount, network);
        const quote = await this.getQuote(params, proxyUrl, uniqueId);
        if (quote) {
            return this.getOutputAmount(quote, pair, uniqueId);
        } else {
            console.error(`Relay [${uniqueId}] - No quote received`);
            return null;
        }
    }
}

export default Relay;
