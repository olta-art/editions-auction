import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers, deployments, network } from "hardhat";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  SingleEditionMintableCreator,
  SingleEditionMintable,
  EditionsAuction,
  WETH
} from "../typechain";

import {
  mine,
  setAutoMine,
  mineToTimestamp,
  getEventArguments,
  deployWETH,
  getRandomInt,
  getPreviousBlockTimestamp,
  equalWithin
} from "./utils"


describe("EditionsAuction", () => {
  let curator: SignerWithAddress;
  let creator: SignerWithAddress;
  let collector: SignerWithAddress;
  let curatorAddress: string;
  let creatorAddress: string;
  let collectorAddress: string;

  let SingleEditonCreator: SingleEditionMintableCreator;
  let EditionsAuction: EditionsAuction;
  let SingleEdition: SingleEditionMintable;
  let weth: WETH;

  const createEdition = async (signer: SignerWithAddress = creator) => {
    const transaction = await SingleEditonCreator.connect(signer).createEdition(
      "Testing Token",
      "TEST",
      "This is a testing token for all",
      "https://ipfs.io/ipfsbafybeify52a63pgcshhbtkff4nxxxp2zp5yjn2xw43jcy4knwful7ymmgy",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      10,
      10
    );
    const [id] = await getEventArguments(transaction, "CreatedEdition")
    const editionResult = await SingleEditonCreator.getEditionAtId(id)
    const SingleEditionContract = (await ethers.getContractAt(
      "SingleEditionMintable",
      editionResult
    )) as SingleEditionMintable;

    return SingleEditionContract
  }

  const createAuction = async (signer: SignerWithAddress = creator, options = {}) => {
    const defaults = {
      edition: {id: SingleEdition.address, implementation: 0},
      startTime: Math.floor((Date.now() / 1000)) + 60 * 2, // now + 2 mins
      duration: 60 * 8, // 8 minutes
      startPrice: ethers.utils.parseEther("1.0"),
      endPrice: ethers.utils.parseEther("0.2"),
      numberOfPriceDrops: 4,
      curator: ethers.constants.AddressZero,
      curatorRoyaltyBPS: 0,
      auctionCurrency: weth.address
    }

    const params = {...defaults, ...options}

    return EditionsAuction.connect(signer).createAuction(
      params.edition,
      params.startTime,
      params.duration,
      params.startPrice,
      params.endPrice,
      params.numberOfPriceDrops,
      params.curator,
      params.curatorRoyaltyBPS,
      params.auctionCurrency
    )
  }

  const genarateAuctionParams = async (hasCurator: boolean = false) => {

    // start time
    const startTime = Math.floor((Date.now() / 1000)) + (60 * getRandomInt(2, 100))

    // duration
    const mins = 60 * getRandomInt(2, 59)
    const hours = 60 * 60 * getRandomInt(0, 100)
    const duration = mins + hours

    // prices
    const random3DecFloat = () => Math.floor(Math.random() * 1000) / 1000 // 0.000-1.000
    const startPrice = getRandomInt(1, 3) + random3DecFloat()
    const endPrice = getRandomInt(0, startPrice - 1) + random3DecFloat()

    // drops
    const twoMin = 60 * 2
    const maxDrops = Math.min(duration / twoMin, 255) // 2mins
    const numberOfPriceDrops = getRandomInt(1, maxDrops)

    // curator
    const curatorAddress = hasCurator ? await curator.getAddress() : ethers.constants.AddressZero
    const curatorRoyaltyBPS = hasCurator ? getRandomInt(0, 100) * 100 : 0

    return {
      startTime,
      duration,
      startPrice: ethers.utils.parseEther(`${startPrice}`),
      endPrice: ethers.utils.parseEther(`${endPrice}`),
      numberOfPriceDrops,
      curator: curatorAddress,
      curatorRoyaltyBPS
    }
  }

  const generatePurchases = async (auctionId: number) => {
    // get auction
    const auction = await EditionsAuction.auctions(auctionId)

    const numberCanMint = await EditionsAuction.numberCanMint(auctionId)
    const maxTimeIncrease = auction.duration.div(numberCanMint).toNumber() * 3

    const purchaseEdition = async () => {
      const previousBlockTimestamp = await getPreviousBlockTimestamp()

      // increase block timestamp
      const timeIncrease = getRandomInt(0, maxTimeIncrease)
      await mineToTimestamp(ethers.BigNumber.from(previousBlockTimestamp + timeIncrease))

      // make purchase
      const salePrice = await EditionsAuction.getSalePrice(auctionId)
      return await EditionsAuction.connect(collector).purchase(auctionId, salePrice)
    }

    // generator function
    const purchases = async function * () {
      //editions left
      let leftToMint = numberCanMint.toNumber()
      while(leftToMint > 0){
        leftToMint--
        yield await purchaseEdition()
      }
    }

    return purchases
  }

  const runAuction = async (auctionId: number) => {
    // get auction
    const auction = await EditionsAuction.auctions(auctionId)
    // goto start of auction
    await mineToTimestamp(auction.startTimestamp)

    const purchases = await generatePurchases(auctionId)

    let total = ethers.BigNumber.from(0)
    // purchase all editions
    for await ( const purchase of purchases() ){
      expect(purchase).to.emit(EditionsAuction, "EditionPurchased")
    }

    // purchase when no editons left
    const salePrice = await EditionsAuction.getSalePrice(0)
    await expect(
      EditionsAuction.connect(collector).purchase(0, salePrice)
    ).to.be.revertedWith("Sold out")

    return total
  }

  beforeEach(async () => {
    const { SingleEditionMintableCreator, EditionsAuction: EditionsAuctionContract } = await deployments.fixture([
      "SingleEditionMintableCreator",
      "SingleEditionMintable",
      "EditionsAuction"
    ]);

    SingleEditonCreator = (await ethers.getContractAt(
      "SingleEditionMintableCreator",
      SingleEditionMintableCreator.address
    )) as SingleEditionMintableCreator;

    EditionsAuction = (await ethers.getContractAt(
      "EditionsAuction",
      EditionsAuctionContract.address
    )) as EditionsAuction;

    const [_curator, _creator, _collector] = await ethers.getSigners();
    curator = _curator;
    creator = _creator;
    collector = _collector;

    curatorAddress = await curator.getAddress();
    creatorAddress = await creator.getAddress();
    collectorAddress = await collector.getAddress();

    SingleEdition = await createEdition()
    weth = await deployWETH()
  })

  //TODO: WBTC auction with no curator -> (different decimal places)
  //TODO: WBTC auction with curator -> (different decimal places)
  //TODO: NFT that is not zora NFT edition?
  //TODO: stress test multiple auctions at once?

  describe("WETH auction with curator [FUZZY]", async () => {
    let auction: any

    beforeEach(async () => {
      weth = await deployWETH()
      // deposit WETH - enough for 100 editons at max price
      await weth.connect(collector).deposit({ value: ethers.utils.parseEther("40.0") });
      await weth.connect(collector).approve(EditionsAuction.address, ethers.utils.parseEther("40.0"))

      const options =  await genarateAuctionParams(true)
      await createAuction(creator, options)

      auction = await EditionsAuction.auctions(0)
      await SingleEdition.connect(creator)
        .setApprovedMinter(EditionsAuction.address, true)

      if(!auction.approved){
        await EditionsAuction.connect(curator).setAuctionApproval(0, true)
      }
    })
    it("should mint tokens", async () => {
      await runAuction(0)

      const collectorNFTBalance = await SingleEdition.balanceOf(collectorAddress)
      const editionSize = ethers.BigNumber.from(10)
      expect(
        collectorNFTBalance.eq(editionSize)
      ).to.eq(true)
    })
    it("should pay creator", async () => {

      const collectorBalanceStart = await weth.balanceOf(collectorAddress)
      await runAuction(0)
      const collectorBalanceEnd = await weth.balanceOf(collectorAddress)

      const total = collectorBalanceStart.sub(collectorBalanceEnd)

      // NOTE: ethers BigNumber seems to be rounding differently to solidity
      // but should be equal to within 5 wei
      const five_wei = ethers.BigNumber.from(5)

      const curatorBalanceExpected = (total.mul(auction.curatorRoyaltyBPS)).div(10000)
      const creatorBalanceExpected = total.sub(curatorBalanceExpected)

      const creatorBalanceActual = await weth.balanceOf(creatorAddress)

      expect(
        equalWithin(creatorBalanceActual, creatorBalanceExpected, five_wei)
      ).to.eq(true)

      // zero balance locked in contract
      const contractBalance = await weth.balanceOf(EditionsAuction.address)
      expect(contractBalance).to.eq(ethers.utils.parseEther("0.0"))
    })

    it("should pay curator", async () => {
      const collectorBalanceStart = await weth.balanceOf(collectorAddress)
      await runAuction(0)
      const collectorBalanceEnd = await weth.balanceOf(collectorAddress)

      const total = collectorBalanceStart.sub(collectorBalanceEnd)

      // NOTE: ethers BigNumber seems to be rounding differently to solidity
      // but should be equal to within 5 wei
      const five_wei = ethers.BigNumber.from(5)

      const curatorBalanceActual = await weth.balanceOf(curatorAddress)
      const curatorBalanceExpected = (total.mul(auction.curatorRoyaltyBPS)).div(10000)
      expect(
        equalWithin(curatorBalanceActual, curatorBalanceExpected, five_wei)
      ).to.eq(true)
    })

    it("should not lock any funds in contract", async () => {
      await runAuction(0)

      // zero balance locked in contract
      const contractBalance = await weth.balanceOf(EditionsAuction.address)
      expect(contractBalance).to.eq(ethers.utils.parseEther("0.0"))
    })
  })

  describe("WETH auction with no curator [FUZZY]", async () => {
    let auction: any

    beforeEach(async () => {
      weth = await deployWETH()
      // deposit WETH - enough for 100 editons at max price
      await weth.connect(collector).deposit({ value: ethers.utils.parseEther("40.0") });
      await weth.connect(collector).approve(EditionsAuction.address, ethers.utils.parseEther("40.0"))

      const options =  await genarateAuctionParams(false) // no curator
      await createAuction(creator, options)

      auction = await EditionsAuction.auctions(0)
      await SingleEdition.connect(creator)
        .setApprovedMinter(EditionsAuction.address, true)

      if(!auction.approved){
        await EditionsAuction.connect(curator).setAuctionApproval(0, true)
      }
    })
    it("should mint tokens", async () => {
      await runAuction(0)

      const collectorNFTBalance = await SingleEdition.balanceOf(collectorAddress)
      const editionSize = ethers.BigNumber.from(10)
      expect(
        collectorNFTBalance.eq(editionSize)
      ).to.eq(true)
    })
    it("should pay creator", async () => {

      const collectorBalanceStart = await weth.balanceOf(collectorAddress)
      await runAuction(0)
      const collectorBalanceEnd = await weth.balanceOf(collectorAddress)

      const total = collectorBalanceStart.sub(collectorBalanceEnd)

      const creatorBalanceActual = await weth.balanceOf(creatorAddress)

      expect(
        total.eq(creatorBalanceActual)
      ).to.eq(true)
    })

    it("should not lock any funds in contract", async () => {
      await runAuction(0)

      // zero balance locked in contract
      const contractBalance = await weth.balanceOf(EditionsAuction.address)
      expect(contractBalance).to.eq(ethers.utils.parseEther("0.0"))
    })
  })


  //TODO: stress test multiple auctions lots of purchases
  describe("WETH auction with no curator", async () => {
    let auction: any
    beforeEach(async () => {
      await createAuction()
      auction = await EditionsAuction.auctions(0)
      await SingleEdition.connect(creator)
        .setApprovedMinter(EditionsAuction.address, true)
      // goto start of auction
      await mineToTimestamp(auction.startTimestamp)
    })
    it("should allow for mints in the same block", async () => {
      const [ _, __, collectorA, collectorB, collectorC] = await ethers.getSigners();

      // deposit 10 weth
      await weth.connect(collectorA).deposit({ value: ethers.utils.parseEther("2.0") });
      await weth.connect(collectorA).approve(EditionsAuction.address, ethers.utils.parseEther("2.0"))

      await weth.connect(collectorB).deposit({ value: ethers.utils.parseEther("1.0") });
      await weth.connect(collectorB).approve(EditionsAuction.address, ethers.utils.parseEther("1.0"))

      await weth.connect(collectorC).deposit({ value: ethers.utils.parseEther("1.0") });
      await weth.connect(collectorC).approve(EditionsAuction.address, ethers.utils.parseEther("1.0"))

      // pause auto mine
      await setAutoMine(false)

      // purchase two edition's
      await EditionsAuction.connect(collectorA)
        .purchase(0, ethers.utils.parseEther("1.0"))
      await EditionsAuction.connect(collectorA)
        .purchase(0, ethers.utils.parseEther("1.0"))

      // purchase one edition
      await EditionsAuction.connect(collectorB)
        .purchase(0, ethers.utils.parseEther("1.0"))

      // wrong price
      await EditionsAuction.connect(collectorC)
        .purchase(0, ethers.utils.parseEther("0.9"))

      // check token balance
      expect(
        await SingleEdition.balanceOf(await collectorA.getAddress())
      ).to.eq(0)

      await mine()

      // check token balance
      expect(
        await SingleEdition.balanceOf(await collectorA.getAddress())
      ).to.eq(2)

      expect(
        await SingleEdition.balanceOf(await collectorB.getAddress())
      ).to.eq(1)

      expect(
        await SingleEdition.balanceOf(await collectorC.getAddress())
      ).to.eq(0)

      // check payments
      expect(
        await weth.balanceOf(await creator.getAddress())
      ).to.eq(ethers.utils.parseEther("3.0"));

      // un-pause auto mine
      await setAutoMine(true)
    })
  })

})