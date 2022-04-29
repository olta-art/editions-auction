import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "hardhat-deploy";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-dependency-compiler";
import { HardhatUserConfig } from "hardhat/config";
import networks from './networks';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Go to https://hardhat.org/config/ to learn more
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  gasReporter: {
    currency: 'GBP',
    gasPrice: 120,
    coinmarketcap: process.env.COINMARKETCAP_KEY,
    excludeContracts: [
      "WETH.sol",
      "BadERC721.sol",
      "SingleEditionMintable.sol",
      "SingleEditionMintableCreator.sol",
      "ERC721Upgradeable.sol"
    ]
  },
  networks,
  namedAccounts: {
    deployer: 0,
    purchaser: 0,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        }
      },
      {
        version: "0.6.8"
      },
    ],
  },
  typechain: {
    externalArtifacts: [
      "./deployments/localhost/*.json"
    ]
  },
  external: {
    contracts: [
      {
        artifacts: process.env.PATH_TO_EDITIONS_CONTRACTS + "artifacts",
        deploy:  process.env.PATH_TO_EDITIONS_CONTRACTS + "deploy"
      },
    ],
    deployments : {
      localhost: ["./deployments"]
    }
  }
};

export default config;

