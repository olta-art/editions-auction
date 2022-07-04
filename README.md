# Olta Editions Auction (WIP)

This is a work in progress please don't use :)

### What is this contract?
`EditionsAuction` is an auction house that can be used for the initial sale of [Zora NFT Edition contracts](https://github.com/ourzora/nft-editions). Heavily inspired by [Zora's Auction House](https://github.com/ourzora/auction-house) and artblocks dutch auction mechanic. Auctions are run in erc-20 tokens

The current intetion is to deploy on mumbai testnet ASAP

Please reach out to us on [Olta's discord](https://discord.gg/CAXNKzMa5A) if you want to help out. Or feel free to raise an issue.

### TODO's:

- [x] Make ERC-20 comptable
- [x] curator assigned when creating an auction rather than on construction?
- [x] curator approval
- [x] mumbai deployment
- [ ] polygon deployment

---

## Mumbai Deployment

> **Warning:** These contracts are still in development so details are likley to change

The contracts are deployed on mumbai at the following address's

~~EditionsAuction: [0xF4baA49b69EA15107d78AD097d2457cDF470E25B](https://mumbai.polygonscan.com/address/0xF4baA49b69EA15107d78AD097d2457cDF470E25B)~~

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