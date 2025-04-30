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
