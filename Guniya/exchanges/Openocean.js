import axios from 'axios';
import Bottleneck from 'bottleneck';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { OPENOCEAN_NETWORKS } from '../networks/networksOpenocean.js';

class OpenOcean {
    static RATE_LIMIT      = 120;
    static TIME_PERIOD     = 60 * 1000; // мілісекунди
    static BASE_SWAP_URL   = 'https://app.openocean.finance/swap/';

    constructor() {
        this._baseUrl = 'https://open-api.openocean.finance/v4/';
        this.limiter  = new Bottleneck({
            reservoir:              OpenOcean.RATE_LIMIT,
            reservoirRefreshAmount: OpenOcean.RATE_LIMIT,
            reservoirRefreshInterval: OpenOcean.TIME_PERIOD,
            maxConcurrent:          1
        });
    }

    get baseUrl() {
        return this._baseUrl;
    }

    set baseUrl(value) {
        this._baseUrl = value;
    }

    async getQuote(chain, params, proxy, uniqueId) {
        const url = `${this._baseUrl}${chain}/quote`;
        try {
            const config = { params, timeout: 5000 };
            if (proxy) {
                const agent = new SocksProxyAgent(proxy);
                config.httpAgent = agent;
                config.httpsAgent = agent;
                config.proxy = false;
            }
            const response = await this.limiter.schedule(() => axios.get(url, config));
            console.info(`Quote | UUID: ${uniqueId} | OpenOcean response:`, response.data);
            return response.data;
        } catch (e) {
            console.error(`Failed to get quote OpenOcean | UUID: ${uniqueId} | error:`, e.message);
            return null;
        }
    }

    getOutputAmount(response, uniqueId) {
        try {
            let outAmt, decimals;
            if (response.outAmount != null) {
                outAmt   = response.outAmount;
                decimals = response.outToken?.decimals;
            } else if (response.data?.outAmount != null) {
                outAmt   = response.data.outAmount;
                decimals = response.data.outToken?.decimals;
            } else {
                throw new Error('Response missing outAmount or data.outAmount');
            }
            return Number(outAmt) / (10 ** Number(decimals));
        } catch (e) {
            console.error(`Error processing response OpenOcean | UUID: ${uniqueId} | error:`, e.message);
            return null;
        }
    }

    getParams(pair, amount) {
        return {
            inTokenAddress:  pair.input.address,
            outTokenAddress: pair.output.address,
            amount,
            gasPrice:        pair.gasPrice || 20,
        };
    }

    async processing(pair, amount, proxy, uniqueId) {
        if (!OPENOCEAN_NETWORKS.includes(pair.chain)) {
            console.error(`Network ${pair.chain} is not supported by OpenOcean | UUID: ${uniqueId}`);
            return null;
        }
        const params = this.getParams(pair, amount);
        const quote  = await this.getQuote(pair.chain, params, proxy, uniqueId);
        if (quote) {
            return this.getOutputAmount(quote, uniqueId);
        }
        return null;
    }

    generateSwapUrl(chain, fromAddress, toAddress) {
        return `${OpenOcean.BASE_SWAP_URL}${chain}/${fromAddress}/${toAddress}`;
    }
}

export default OpenOcean;
