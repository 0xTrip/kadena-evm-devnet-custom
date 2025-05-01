// hardhat.config.js
// Disable SSL certificate validation globally
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require("@nomicfoundation/hardhat-toolbox");
require("@kadena/hardhat-chainweb");
require("dotenv").config();
const { readFileSync } = require("fs");

const devnetAccounts = JSON.parse(
  readFileSync("./devnet-accounts.json", "utf-8")
);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    devnet: {
      // Use the RPC URL from the .env file
      url: process.env.RPC_URL,
      chainId: 1789, // Using chainIdOffset from your chainweb config
      accounts: devnetAccounts.accounts.map((account) => account.privateKey),
      timeout: 60000, // Increased timeout for network operations
      gas: 8000000,
      gasPrice: "auto",
      httpHeaders: {
        "Content-Type": "application/json",
      },
    },
  },
  // Keep your existing chainweb configuration
  defaultChainweb: "devnet",
  chainweb: {
    hardhat: {
      chains: 2,
    },
    devnet: {
      chains: 2,
      type: "external",
      chainIdOffset: 1789,
      accounts: devnetAccounts.accounts.map((account) => account.privateKey),
      externalHostUrl:
        "https://evm-devnet.kadena.network/chainweb/0.0/evm-development",
    },
  },
};
