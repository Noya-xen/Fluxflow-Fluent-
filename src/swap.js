'use strict';

const { ethers } = require('ethers');
const { log, sleep, approveToken, wrapETH, parse, deadline } = require('./utils');

async function doSwap(wallet, contracts, params) {
  const { router, tokenIn, tokenOut, wethContract } = contracts;
  const { amountIn, fee, gasLimit, explorer }        = params;

  const tokenInSymbol  = await tokenIn.symbol();
  const tokenOutSymbol = await tokenOut.symbol();
  const tokenInDec     = await tokenIn.decimals();
  const amountInParsed = parse(amountIn, tokenInDec);
  const isWethIn       = tokenIn.target.toLowerCase() === wethContract.target.toLowerCase();

  // Jika input adalah WETH, pastikan kita punya balance WETH (wrap jika perlu)
  if (isWethIn) {
    await wrapETH(wethContract, wallet, amountInParsed);
  }

  // Approve tokenIn ke router (selalu perlu untuk ERC20, termasuk WETH)
  await approveToken(tokenIn, router.target, amountInParsed, wallet, 120000);
  await sleep(2000);

  const swapParams = {
    tokenIn:           tokenIn.target,
    tokenOut:          tokenOut.target,
    fee:               fee,
    recipient:         wallet.address,
    deadline:          deadline(20),
    amountIn:          amountInParsed,
    amountOutMinimum:  0n,
    sqrtPriceLimitX96: 0n,
  };

  const txOpts = { gasLimit };
  // Note: Kita tidak lagi mengirim value: amountInParsed karena swapRouter FluxFlow 
  // di V3 Testnet biasanya mengharapkan WETH sebagai tokenIn, bukan native ETH directly 
  // (atau butuh multicall wrapETH). Menggunakan WETH adalah cara paling aman agar tidak STF.

  const tx      = await router.connect(wallet).exactInputSingle(swapParams, txOpts);
  const receipt = await tx.wait();

  if (receipt.status === 1) {
    log.success(`Swap OK: ${tokenInSymbol} → ${tokenOutSymbol}`);
    log.tx(tx.hash, explorer);
    return { success: true, hash: tx.hash };
  } else {
    log.error(`Swap TX reverted: ${tx.hash}`);
    return { success: false, hash: tx.hash };
  }
}

/**
 * mode: 'eth_fusd' | 'eth_wbtc' | 'both' (default)
 */
async function runSwapSession(wallet, contracts, config) {
  const {
    swapAmountETH, swapAmountFUSD, swapAmountWBTC,
    swapCount, fee, gasLimit, delayMs,
    explorer, mode = 'both',
  } = config;
  const { router, wethContract, fUSDContract, wbtcContract } = contracts;

  const tasks = [];
  for (let i = 0; i < swapCount; i++) {
    if (mode === 'eth_fusd') {
      tasks.push(i % 2 === 0
        ? { from: wethContract, to: fUSDContract,  amount: swapAmountETH,  label: 'ETH→fUSD' }
        : { from: fUSDContract, to: wethContract,  amount: swapAmountFUSD, label: 'fUSD→ETH' });
    } else if (mode === 'eth_wbtc') {
      tasks.push(i % 2 === 0
        ? { from: wethContract, to: wbtcContract,  amount: swapAmountETH,  label: 'ETH→WBTC' }
        : { from: wbtcContract, to: wethContract,  amount: swapAmountWBTC, label: 'WBTC→ETH' });
    } else {
      const c = i % 4;
      if (c === 0) tasks.push({ from: wethContract, to: fUSDContract, amount: swapAmountETH,  label: 'ETH→fUSD'  });
      if (c === 1) tasks.push({ from: fUSDContract, to: wethContract, amount: swapAmountFUSD, label: 'fUSD→ETH'  });
      if (c === 2) tasks.push({ from: wethContract, to: wbtcContract, amount: swapAmountETH,  label: 'ETH→WBTC'  });
      if (c === 3) tasks.push({ from: wbtcContract, to: wethContract, amount: swapAmountWBTC, label: 'WBTC→ETH'  });
    }
  }

  let successCount = 0;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    log.info(`[${wallet.address.slice(0,8)}] Swap ${i+1}/${tasks.length} — ${t.label}`);
    try {
      const r = await doSwap(wallet, { router, tokenIn: t.from, tokenOut: t.to, wethContract },
        { amountIn: t.amount, fee, gasLimit, explorer });
      if (r.success) successCount++;
    } catch (err) {
      log.error(`Swap ${i+1} error: ${err.message?.slice(0, 120)}`);
    }
    if (i < tasks.length - 1) {
      const delay = delayMs + Math.floor(Math.random() * 5000);
      log.info(`Jeda ${(delay/1000).toFixed(1)}s...`);
      await sleep(delay);
    }
  }
  return successCount;
}

module.exports = { doSwap, runSwapSession };
