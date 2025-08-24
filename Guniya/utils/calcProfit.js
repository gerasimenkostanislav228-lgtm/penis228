// src/utils/calcProfit.js
export function calculateProfitPercentage(usdtSpent, usdtReceived) {
    if (usdtSpent === 0) {
        return 0;
    }
    const profit = usdtReceived - usdtSpent;
    return (profit / usdtSpent) * 100;
}
