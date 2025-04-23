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
    devnet: {
      type: 'external',
      chains: 2,
      externalHostUrl: 'http://some.domain',
      precompiles: { // only need if addresses are diferent from default
        chainwebChainId: '0x0000000000000000000000000000000000000100',
        spvVerify: '0x0000000000000000000000000000000000000101',
        create2Proxy: '0x0000000000000000000000000000000000000101',
      },
    },

  },
};
