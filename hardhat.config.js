require("@nomicfoundation/hardhat-toolbox");
require('@kadena/hardhat-chainweb');
require('dotenv').config();



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
  chainweb: {
    hardhat: {
      chains: 2,
    },
  },
};
