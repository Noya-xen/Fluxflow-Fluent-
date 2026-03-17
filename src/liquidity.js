'use strict';

const { ethers } = require('ethers');
const {
  log, sleep, approveToken, wrapETH,
  getTickRange, feeToTickSpacing, sortTokens,
  parse, fmt, deadline,
} = require('./utils');

/**
 * Ambil tick saat ini dari pool address
 */
async function getCurrentTick(poolAddress, poolAbi, provider) {
  const pool   = new ethers.Contract(poolAddress, poolAbi, provider);
  const slot0  = await pool.slot0();
  return { tick: Number(slot0.tick), sqrtPriceX96: slot0.sqrtPriceX96 };
}

/**
 * Cari pool address dari factory
 */
async function getPoolAddress(factory, token0, token1, fee) {
  try {
    const pool = await factory.getPool(token0, token1, fee);
    if (pool === ethers.ZeroAddress) return null;
    return pool;
  } catch (_) {
    return null;
  }
}

/**
 * Tambah liquidity V3 (mint position baru)
 */
async function addLiquidity(wallet, contracts, params) {
  const {
    nftManager, factory, wethContract,
    tokenAContract, tokenBContract,
    poolAbi, provider,
  } = contracts;

  const {
    amountA, amountB,
    fee, tickRangeMultiplier,
    gasLimit, explorer,
    slippageBps,
  } = params;

  const symA = await tokenAContract.symbol().catch(() => '?');
  const symB = await tokenBContract.symbol().catch(() => '?');
  const decA = await tokenAContract.decimals().catch(() => 18);
  const decB = await tokenBContract.decimals().catch(() => 18);

  log.info(`Add Liquidity: ${amountA} ${symA} + ${amountB} ${symB}`);

  const [token0Addr, token1Addr] = sortTokens(tokenAContract.target, tokenBContract.target);
  const isAToken0 = tokenAContract.target.toLowerCase() === token0Addr.toLowerCase();

  const amount0Desired = parse(isAToken0 ? amountA : amountB, isAToken0 ? decA : decB);
  const amount1Desired = parse(isAToken0 ? amountB : amountA, isAToken0 ? decB : decA);

  // Dapatkan pool address
  const poolAddr = await getPoolAddress(factory, token0Addr, token1Addr, fee);
  if (!poolAddr) {
    log.error(`Pool ${symA}/${symB} fee ${fee} tidak ditemukan di factory`);
    return { success: false };
  }
  log.info(`Pool: ${poolAddr}`);

  // Dapatkan current tick
  const { tick: currentTick } = await getCurrentTick(poolAddr, poolAbi, provider);
  const tickSpacing = feeToTickSpacing(fee);

  // Hitung tick range — tight range untuk max points
  const ticksAway = tickRangeMultiplier || 10; // 10 tick spacing di masing-masing arah
  const { tickLower, tickUpper } = getTickRange(currentTick, tickSpacing, ticksAway);

  log.info(`Tick: current=${currentTick}, lower=${tickLower}, upper=${tickUpper}`);

  // Approve kedua token ke nftManager
  const isNativeA = tokenAContract.target.toLowerCase() === wethContract.target.toLowerCase();
  const isNativeB = tokenBContract.target.toLowerCase() === wethContract.target.toLowerCase();

  // Jika ada native ETH terlibat, wrap ke WETH dulu
  // (Uniswap V3 NftPositionManager menerima WETH, bukan ETH langsung)
  if (isNativeA) await wrapETH(wethContract, wallet, amount0Desired > amount1Desired ? amount0Desired : amount1Desired);
  if (isNativeB) await wrapETH(wethContract, wallet, amount0Desired > amount1Desired ? amount0Desired : amount1Desired);

  await approveToken(tokenAContract, nftManager.target, amount0Desired > amount1Desired ? amount0Desired : amount1Desired, wallet, 120000);
  await sleep(1000);
  await approveToken(tokenBContract, nftManager.target, amount0Desired > amount1Desired ? amount0Desired : amount1Desired, wallet, 120000);
  await sleep(1000);

  const mintParams = {
    token0:           token0Addr,
    token1:           token1Addr,
    fee:              fee,
    tickLower:        tickLower,
    tickUpper:        tickUpper,
    amount0Desired:   amount0Desired,
    amount1Desired:   amount1Desired,
    amount0Min:       0n,
    amount1Min:       0n,
    recipient:        wallet.address,
    deadline:         deadline(20),
  };

  try {
    const tx = await nftManager.connect(wallet).mint(mintParams, {
      gasLimit: Math.floor(Number(gasLimit) * 1.5), // Increase gas limit for minting
    });
    const receipt = await tx.wait();

    if (receipt.status === 1) {
      // Parse tokenId dari logs
      let tokenId = '?';
      for (const log_ of receipt.logs) {
        // Transfer event dari NFT: topic[3] = tokenId
        if (log_.topics.length === 4 && log_.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
          tokenId = BigInt(log_.topics[3]).toString();
        }
      }
      log.success(`LP Ditambahkan! TokenId: ${tokenId}`);
      log.tx(tx.hash, explorer);
      return { success: true, hash: tx.hash, tokenId };
    } else {
      log.error(`Mint TX reverted: ${tx.hash}`);
      return { success: false, hash: tx.hash };
    }
  } catch (err) {
    log.error(`AddLiquidity error: ${err.message?.slice(0, 150)}`);
    return { success: false };
  }
}

module.exports = { addLiquidity, getPoolAddress, getCurrentTick };
