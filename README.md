# Olta Dutch Auction Drop

### What is this contract?
`DutchAuctionDrop` is an auction house that can be used for the initial sale/drop of [Olta NFT Editions](https://github.com/olta-art/olta-nft-editions). Heavily inspired by [Zora's Auction House](https://github.com/ourzora/auction-house) and artblocks dutch auction mechanic. Auctions are run in erc-20 tokens

Please reach out to us on [Olta's discord](https://discord.gg/CAXNKzMa5A) if you want to help out. Or feel free to raise an issue.

---

## Polygon Deployment
| Name | Address |
|---|---|
| DutchAuctionDrop | [0xfd63d938F82C94a30D940475f572ec10214ed907](https://polygonscan.com/address/0xfd63d938F82C94a30D940475f572ec10214ed907) |

## Mumbai Deployment

The contracts are deployed on mumbai at the following address's

DutchAuctionDrop: [0x57D9b13B8f5fFA5ba2002891001aBF33FCc4601b](https://mumbai.polygonscan.com/address/0x57D9b13B8f5fFA5ba2002891001aBF33FCc4601b)

---

### To Run Locally

The current setup is temporary while the contracts are still changing.
It relys on a [editions repo](https://github.com/olta-art/olta-nft-editions) to also be cloned and the path set in the .env file for PATH_TO_EDITIONS_CONTRACTS

Start a hardhat node to pull in the external abis under /deployments/localhost
```yarn hardhat node```

Note: you will need to run this in the external editions repo first
```yarn hardhat compile```

You can cancel the hardhat node as we only need it to create those abis.

Then run ```yarn typechain``` to generate the external editions types making it possible to run the tests.

To run the tests
```yarn test```