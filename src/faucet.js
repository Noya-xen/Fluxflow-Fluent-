'use strict';

const axios  = require('axios');
const { log } = require('./utils');

/**
 * Coba claim faucet dari FluxFlow UI
 * Berdasarkan request yang terlihat di devtools: tRPC endpoint
 */
async function claimFaucet(walletAddress, config) {
  const { api } = config;
  try {
    log.info(`Claim faucet untuk ${walletAddress.slice(0,8)}...`);
    const res = await axios.post(
      `${api.baseUrl}/faucet.claim`,
      { json: { walletAddress } },
      {
        headers: {
          'Content-Type': 'application/json',
          'origin':       'https://app.fluxflow.fi',
          'referer':      'https://app.fluxflow.fi/',
        },
        timeout: 20000,
      }
    );
    const data = res.data?.result?.data;
    if (data?.success || data?.txHash) {
      log.success(`Faucet claimed! Hash: ${data.txHash || 'pending'}`);
      return { success: true, hash: data.txHash };
    }
    log.warn(`Faucet response: ${JSON.stringify(data)}`);
    return { success: false };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    log.warn(`Faucet skip: ${msg?.slice(0, 80)}`);
    return { success: false, error: msg };
  }
}

module.exports = { claimFaucet };
