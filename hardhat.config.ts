import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "hardhat-deploy";
import "hardhat-abi-exporter";
import "@nomiclabs/hardhat-etherscan";
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
    // @ts-expect-error
    customChains: [
      {
        network: "mumbai",
        chainId: 80001,
        urls: {
          apiURL: "https://api-testnet.polygonscan.com",
          browserURL: "https://mumbai.polygonscan.com"
        }
      },
      {
        network: "polygon",
        chainId: 137,
        urls: {
          apiURL: "https://api.polygonscan.com",
          browserURL: "https://polygonscan.com"
        }
      }
    ]
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
      "ERC721Upgradeable.sol",
      "ExposedInternals"
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
    // note: comment out to deploy to live networks
    // contracts: [
    //   {
    //     artifacts: process.env.PATH_TO_EDITIONS_CONTRACTS + "artifacts",
    //     deploy:  process.env.PATH_TO_EDITIONS_CONTRACTS + "deploy"
    //   },
    // ],
    // deployments : {
    //   localhost: ["./deployments/localhost"],
    //   mumbai: [process.env.REL_PATH_TO_EDITIONS_CONTRACTS + "deployments/mumbai"]
    // }
  }
};

export default config;

