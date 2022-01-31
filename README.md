# Olta Editions Auction (WIP)

This is a work in progress please don't use :)

### What is this contract?
`EditionsAuction` is an auction house that can be used for the initial sale of [Zora NFT Edition contracts](https://github.com/ourzora/nft-editions). Heavily inspired by [Zora's Auction House](https://github.com/ourzora/auction-house) and artblocks dutch auction mechanic. Splits royalties between creator and curator and utilizes a [pull payment stratergy](https://docs.openzeppelin.com/contracts/2.x/api/payment#PullPayment).

Olta will use this contract when it is ready but we are keen to see if there is interest for the final implementation to act like zora's auction house so that anyone can set up edition drops?

### TODO's:

- [ ] Make ERC-20 comptable
- [x] curator assigned when creating an auction rather than on construction?
- [x] curator approval
- [ ] full coverage tests
- [ ] subgraph (in progress)
- [ ] front-end interface
- [ ] mumbai deployment
- [ ] polygon deployment
