import axios from 'axios';
import Bottleneck from 'bottleneck';
import supportedNetworks from '../networks/KyberSwapNetwork.js';
import USDTContracts from '../contracts/USDTContracts.js';
import { SocksProxyAgent } from 'socks-proxy-agent';

// ──────────────────────────────────────────────────────────────────────────────
// Utility helpers – no ethers.js needed
// ──────────────────────────────────────────────────────────────────────────────
const parseUnits = (value, decimals) => {
    const [intPart, fracPart = ''] = value.toString().split('.');
    const frac = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
    return BigInt(intPart + frac);
};
const formatUnits = (value, decimals) => {
    const str = value.toString().padStart(decimals + 1, '0');
    const intPart = str.slice(0, -decimals) || '0';
    const fracPart = str.slice(-decimals).replace(/0+$/, '');
    return fracPart ? `${intPart}.${fracPart}` : intPart;
};

// Kyber API uses `bsc`, а не `bnb`
const NETWORK_ALIAS = { bnb: 'bsc', binance: 'bsc', 'binance-smart-chain': 'bsc' };
const SUPPORTED_SET = new Set(supportedNetworks);

class KyberSwap {
    static RATE_LIMIT = 120;          // 120 req/min
    static TIME_PERIOD = 60_000;      // ms in a minute

    constructor() {
        this._baseUrl = 'https://aggregator-api.kyberswap.com';
        this.slippage = 0.5;            // 0.5 %
        this.limiter = new Bottleneck({
            maxConcurrent: 1,
            minTime: KyberSwap.TIME_PERIOD / KyberSwap.RATE_LIMIT,
        });
    }

    // ————————————————————————————————————————————————————————————————
    // Build query params
    // ————————————————————————————————————————————————————————————————
    getParams(pair, amount, network) {
        const amountInSmallest = parseUnits(amount, pair.input.decimals).toString();
        const tokenOut = pair.output.address || USDTContracts[network];
        return {
            tokenIn: pair.input.address,
            tokenOut,
            amountIn: amountInSmallest,
            slippageTolerance: this.slippage,
        };
    }

    // ————————————————————————————————————————————————————————————————
    // HTTP GET (rate‑limited, proxy aware)
    // ————————————————————————————————————————————————————————————————
    async getQuote(params, network, proxyUrl, uuid) {
        const query = new URLSearchParams(params).toString();
        const url = `${this._baseUrl}/${network}/api/v1/routes?${query}`;

        const axiosCfg = { timeout: 5_000 };
        if (proxyUrl) {
            const agent = new SocksProxyAgent(proxyUrl);
            axiosCfg.httpAgent = agent;
            axiosCfg.httpsAgent = agent;
        }

        console.info(`UUID ${uuid} | Kyber GET ${url}`);
        try {
            const res = await this.limiter.schedule(() => axios.get(url, axiosCfg));
            return res.data;
        } catch (err) {
            console.error(`Kyber GET fail | UUID ${uuid} | ${err.message}`);
            return null;
        }
    }

    // ————————————————————————————————————————————————————————————————
    // Extract amountOut
    // ————————————————————————————————————————————————————————————————
    getOutputAmount(resp, pair) {
        const raw = resp?.data?.routeSummary?.amountOut;
        if (!raw) return null;
        return parseFloat(formatUnits(BigInt(raw), pair.output.decimals));
    }

    // ————————————————————————————————————————————————————————————————
    // Main entry
    // ————————————————————————————————————————————————————————————————
    async processing(pair, amount, proxyUrl, uuid, network) {
        const net = NETWORK_ALIAS[network] || network;

        if (!SUPPORTED_SET.has(net)) {
            console.warn(`KyberSwap: мережу ${net} немає у supported list, але пробуємо | UUID ${uuid}`);
        }

        const params = this.getParams(pair, amount, net);
        const quote  = await this.getQuote(params, net, proxyUrl, uuid);
        if (!quote) return 0;

        const out = this.getOutputAmount(quote, pair);
        return out || 0;
    }
}

export default KyberSwap;
