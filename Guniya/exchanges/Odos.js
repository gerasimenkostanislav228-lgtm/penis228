import axios from 'axios';
import Bottleneck from 'bottleneck';
import networkTags from '../networks/networkTags.js';
import USDTContracts from '../contracts/USDTContracts.js';
import { SocksProxyAgent } from 'socks-proxy-agent';

class Odos {
    static RATE_LIMIT = 480;
    static TIME_PERIOD = 60 * 1000; // період у мілісекундах

    constructor() {
        this._baseUrl = "https://api.odos.xyz/sor/quote/v2";
        this.limiter = new Bottleneck({
            maxConcurrent: 1,
            minTime: Odos.TIME_PERIOD / Odos.RATE_LIMIT,
        });
    }

    get baseUrl() {
        return this._baseUrl;
    }

    set baseUrl(value) {
        this._baseUrl = value;
    }

    async getQuote(params, proxyUrl, uniqueId) {
        const headers = { 'Content-Type': 'application/json' };
        console.info(`UUID: ${uniqueId} | Відправляємо запит з параметрами: ${JSON.stringify(params)}`);
        try {
            // build axios config with optional SOCKS proxy
            const axiosConfig = {
                headers,
                timeout: 15000,
            };
            if (proxyUrl) {
                const agent = new SocksProxyAgent(proxyUrl);
                axiosConfig.httpAgent = agent;
                axiosConfig.httpsAgent = agent;
            }
            console.info(`UUID: ${uniqueId} | Використовуємо axiosConfig: ${JSON.stringify({ headers, timeout: axiosConfig.timeout, proxyUrl })}`);
            const response = await this.limiter.schedule(() => axios.post(this._baseUrl, params, axiosConfig));
            return response.data;
        } catch (e) {
            console.error(`Failed to get quote from Odos | UUID: ${uniqueId} | error message: ${e.message}`);
            return null;
        }
    }

    getOutputAmount(response, pair, uniqueId) {
        try {
            const amount = parseInt(response.outAmounts[0], 10);
            const decimals = parseInt(pair.output.decimals, 10);
            return amount / Math.pow(10, decimals);
        } catch (e) {
            console.error(`Error processing response from Odos | UUID: ${uniqueId} | error message: ${e.message}`);
            return null;
        }
    }

    /**
     * Формуємо параметри запиту.
     * Якщо для вихідного токена не задано адресу, використовуємо адресу USDT з USDTContracts.
     * ВАЖЛИВО: inputTokens тепер формується на основі pair.input.address.
     */
    getParams(pair, amount, network, tokenContract) {
        console.info(`Original amount: ${amount}`);
        const inputDecimals = pair.input.decimals;
        const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputDecimals));
        const amountInSmallestUnitStr = amountInSmallestUnit.toLocaleString('fullwide', { useGrouping: false });
        console.info(`Amount in smallest unit: ${amountInSmallestUnitStr}`);

        // Отримуємо chainId із заданої мережі
        const net = networkTags[network];
        const chainId = net ? net.chainId : null;
        if (!chainId) {
            console.error(`Мережа ${network} не підтримується ODOS`);
        }

        // Якщо address для вихідного токена не задано, беремо USDT адресу з USDTContracts
        const outputTokenAddress = pair.output.address || USDTContracts[network];

        return {
            chainId,
            compact: true,
            gasPrice: 20,
            inputTokens: [
                {
                    amount: amountInSmallestUnitStr,
                    tokenAddress: pair.input.address,
                }
            ],
            outputTokens: [
                {
                    proportion: 1,
                    tokenAddress: outputTokenAddress,
                }
            ],
        };
    }

    async processing(pair, amount, proxyUrl, uniqueId, network, tokenContract) {
        if (!network) {
            console.error(`Мережа не задана для ODOS | UUID: ${uniqueId}`);
            return null;
        }
        const params = this.getParams(pair, amount, network, tokenContract);
        const quote = await this.getQuote(params, proxyUrl, uniqueId);
        console.info(`Quote | UUID: ${uniqueId} | Odos response data: ${JSON.stringify(quote)}`);
        if (quote) {
            return this.getOutputAmount(quote, pair, uniqueId);
        } else {
            console.error(`Failed to get quote from Odos | UUID: ${uniqueId}`);
            return null;
        }
    }
}

export default Odos;
