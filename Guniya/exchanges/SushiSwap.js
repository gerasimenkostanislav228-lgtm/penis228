import { fetch } from 'undici';
import { formatUnits } from 'viem/utils';
import Bottleneck from 'bottleneck';
import { SocksProxyAgent } from 'socks-proxy-agent';
import sushiChains from '../networks/networkSushi.js';

class SushiSwap {
    constructor() {
        this.baseUrl = 'https://api.sushi.com/quote/v7';
        this.proxyUrl = null;
        this.limiter = new Bottleneck({ maxConcurrent: 1, minTime: 250 });
    }

    setProxy(proxyUrl) {
        this.proxyUrl = proxyUrl;
    }

    async getQuote(params, proxyUrl) {
        const { chainId, tokenIn, tokenOut, amountInWei, maxSlippage = 0.005 } = params;
        const url = new URL(`${this.baseUrl}/${chainId}`);
        url.searchParams.set('tokenIn', tokenIn);
        url.searchParams.set('tokenOut', tokenOut);
        url.searchParams.set('amount', amountInWei.toString());
        url.searchParams.set('maxSlippage', maxSlippage.toString());

        const options = {};
        if (proxyUrl) {
            const agent = new SocksProxyAgent(proxyUrl);
            options.dispatch = agent;
        }

        try {
            return await this.limiter.schedule(async () => {
                const response = await fetch(url, options);
                return await response.json();
            });
        } catch (error) {
            console.error('SushiSwap getQuote error:', error.message);
            return null;
        }
    }

    async processing(pair, amount, proxy, uniqueId, network) {
        const net = sushiChains[network];
        if (!net) {
            console.error(`SushiSwap does not support network: ${network}`);
            return null;
        }

        if (proxy) this.setProxy(proxy);

        const amountInWei = BigInt(Math.floor(amount * 10 ** pair.input.decimals));

        const quote = await this.getQuote({
            chainId: net.chainId,
            tokenIn: pair.input.address,
            tokenOut: pair.output.address,
            amountInWei
        }, this.proxyUrl);

        if (!quote || quote.status !== 'Success') {
            console.error(`SushiSwap quote failed for ${uniqueId}`, quote);
            return null;
        }

        try {
            const decimals = quote.tokens[quote.tokenTo].decimals;
            const outWei = BigInt(quote.assumedAmountOut);
            return Number(formatUnits(outWei, decimals));
        } catch (e) {
            console.error(`SushiSwap parse error (${uniqueId}):`, e.message);
            return null;
        }
    }
}

export default SushiSwap;
