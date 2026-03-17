'use strict';

const { ethers } = require('ethers');
const chalk      = require('chalk');
const { HttpsProxyAgent } = require('https-proxy-agent');

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp WIB
// ─────────────────────────────────────────────────────────────────────────────
function wibNow() {
  return new Date().toLocaleString('id-ID', {
    timeZone:   'Asia/Jakarta',
    day:   '2-digit', month: '2-digit', year: '2-digit',
    hour:  '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────
const log = {
  info:    (msg) => console.log(chalk.cyan(`  [ ${wibNow()} ] ${msg}`)),
  success: (msg) => console.log(chalk.green(`  [ ${wibNow()} ] ✔ ${msg}`)),
  warn:    (msg) => console.log(chalk.yellow(`  [ ${wibNow()} ] ⚠ ${msg}`)),
  error:   (msg) => console.log(chalk.red(`  [ ${wibNow()} ] ✘ ${msg}`)),
  tx:      (hash, explorerBase) => {
    const url = `${explorerBase}/tx/${hash}`;
    console.log(chalk.magenta(`  [ ${wibNow()} ] 🔗 TX: ${url}`));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sleep
// ─────────────────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Random delay antara min-max ms
function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return sleep(ms);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build provider (dengan proxy opsional)
// ─────────────────────────────────────────────────────────────────────────────
function buildProvider(rpcUrl, proxyUrl = null) {
  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    const fetchFunc = (url, opts) => fetch(url, { ...opts, agent });
    return new ethers.JsonRpcProvider(rpcUrl, undefined, { fetchFunc });
  }
  return new ethers.JsonRpcProvider(rpcUrl);
}

// ─────────────────────────────────────────────────────────────────────────────
// Approve token dengan check allowance terlebih dahulu
// ─────────────────────────────────────────────────────────────────────────────
async function approveToken(tokenContract, spender, amount, wallet, gasLimit) {
  const current = await tokenContract.allowance(wallet.address, spender);
  if (current >= amount) {
    log.info(`Allowance sudah cukup untuk ${await tokenContract.symbol()}`);
    return null;
  }
  log.info(`Approving ${await tokenContract.symbol()} ke ${spender.slice(0,8)}...`);
  const tx = await tokenContract.connect(wallet).approve(spender, ethers.MaxUint256, {
    gasLimit: gasLimit || 100000,
  });
  await tx.wait();
  log.success(`Approve OK: ${tx.hash}`);
  return tx.hash;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tick helpers (Uniswap V3 math)
// ─────────────────────────────────────────────────────────────────────────────
function nearestUsableTick(tick, tickSpacing) {
  const rounded = Math.round(tick / tickSpacing) * tickSpacing;
  if (rounded < -887272) return -887272 + tickSpacing - ((-887272) % tickSpacing);
  if (rounded > 887272)  return  887272 - (887272 % tickSpacing);
  return rounded;
}

function getTickRange(currentTick, tickSpacing, ticksAway = 10) {
  const tickLower = nearestUsableTick(currentTick - ticksAway * tickSpacing, tickSpacing);
  const tickUpper = nearestUsableTick(currentTick + ticksAway * tickSpacing, tickSpacing);
  return { tickLower, tickUpper };
}

function feeToTickSpacing(fee) {
  const map = { 500: 10, 3000: 60, 10000: 200 };
  return map[fee] || 60;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort token addresses (Uniswap V3 selalu token0 < token1)
// ─────────────────────────────────────────────────────────────────────────────
function sortTokens(addrA, addrB) {
  return addrA.toLowerCase() < addrB.toLowerCase()
    ? [addrA, addrB]
    : [addrB, addrA];
}

// ─────────────────────────────────────────────────────────────────────────────
// Format angka besar
// ─────────────────────────────────────────────────────────────────────────────
function fmt(val, decimals = 18) {
  return ethers.formatUnits(val, decimals);
}

function parse(val, decimals = 18) {
  return ethers.parseUnits(String(val), decimals);
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrap ETH helper
// ─────────────────────────────────────────────────────────────────────────────
async function wrapETH(wethContract, wallet, amountWei) {
  const balance = await wethContract.balanceOf(wallet.address);
  if (balance >= amountWei) return null;

  const missing = amountWei - balance;
  if (missing <= 0n) return null;

  log.info(`Wrapping ${ethers.formatEther(missing)} ETH → WETH...`);
  const tx = await wethContract.connect(wallet).deposit({ value: missing });
  await tx.wait();
  log.success(`Wrap ETH OK: ${tx.hash}`);
  return tx.hash;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deadline helper (default 20 menit dari sekarang)
// ─────────────────────────────────────────────────────────────────────────────
function deadline(minutes = 20) {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

module.exports = {
  wibNow, log, sleep, randomDelay,
  buildProvider, approveToken, wrapETH,
  nearestUsableTick, getTickRange, feeToTickSpacing, sortTokens,
  fmt, parse, deadline,
};
