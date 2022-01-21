import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers, deployments } from "hardhat";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  SingleEditionMintableCreator,
  SingleEditionMintable,
  EditionsAuction
} from "../typechain";

import {
  mine,
  setAutoMine,
  mineToTimestamp,
  getEventArguments,
} from "./utils"

describe.only("EditionsAuction", () => {
  let curator: SignerWithAddress;
  let creator: SignerWithAddress;
  let collector: SignerWithAddress;
  let SingleEditonCreator: SingleEditionMintableCreator;
  let EditionsAuction: EditionsAuction;
  let SingleEdition: SingleEditionMintable;

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
      editionContract: SingleEdition.address,
      startTime: Math.floor((Date.now() / 1000)) + 60 * 2, // now + 2 mins
      duration: 60 * 8, // 8 minutes
      startPrice: ethers.utils.parseEther("1.0"),
      endPrice: ethers.utils.parseEther("0.2"),
      numberOfPriceDrops: 4
    }

    const params = {...defaults, ...options}

    return EditionsAuction.connect(signer).createAuction(
      params.editionContract,
      params.startTime,
      params.duration,
      params.startPrice,
      params.endPrice,
      params.numberOfPriceDrops
    )
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

    SingleEdition = await createEdition()
  })

  describe("#CreateAuctionDrop()", async () => {

    it("reverts if caller is not creator", async () => {
      const other = (await ethers.getSigners())[5]
      await expect(
        createAuction(other)
      ).to.be.revertedWith("Caller must be creator of editions")
    })

    it("reverts if start price is lower than end price", async () => {
      await expect(
        createAuction(creator, {
          startPrice: ethers.utils.parseEther("1"),
          endPrice: ethers.utils.parseEther("2")
        })
      ).to.be.revertedWith("Start price must be higher then end price")
    })

    it("reverts if step time is lower than minimuim", async () => {
      await expect(
        createAuction(creator, {
          duration: 60 * 2, // 2 minutes
          numberOfPriceDrops: 4
        })
      ).to.be.revertedWith("Step time must be higher than minimuim step time")
    })

    it("creates a auction", async () => {
      const startTime = Math.floor((Date.now() / 1000)) + 60 * 2 // now + 2 mins

      expect(
        await createAuction(creator, {
          startTime
        })
      ).to.emit(EditionsAuction, "AuctionCreated")

      const auction = await EditionsAuction.auctions(0)

      expect(auction.editionContract).to.eq(SingleEdition.address)
      expect(auction.startTimestamp).to.eq(startTime)
      expect(auction.duration).to.eq(8 * 60)
      expect(auction.startPrice).to.eq(ethers.utils.parseEther("1.0"))
      expect(auction.endPrice).to.eq(ethers.utils.parseEther("0.2"))
      expect(auction.numberOfPriceDrops).to.eq(4)
      expect(auction.stepPrice).to.eq(ethers.utils.parseEther("0.2"))
      expect(auction.stepTime).to.eq(60*2)
      expect(auction.approved).to.eq(false)
    })

    // TODO: check random params to make sure stepPrice and stepTime always act as expected
  })

  describe("#getSalePrice()", async () => {
    let auction: any // todo create interface for auction
    beforeEach(async () => {
      await createAuction()
      auction = await EditionsAuction.auctions(0)
    })

    it("should be startPirce before auction", async () => {
      expect(
        await EditionsAuction.getSalePrice(0)
      ).to.eq(auction.startPrice)
    })

    it("should drop the price at set intervals during auction", async () => {
      for(let i = 1; i <= auction.numberOfPriceDrops; i++){
        // move the blocks along
        const time = auction.startTimestamp.add(auction.stepTime.mul(i))
        await mineToTimestamp(time)

        const expectedPrice = auction.startPrice.sub(auction.stepPrice.mul(i - 1))

        expect(
          await EditionsAuction.getSalePrice(0)
        ).to.eq(expectedPrice)
      }
    })

    it("should be endPrice after auction", async () => {
      const afterAuction = auction.startTimestamp.add(auction.duration)
      await mineToTimestamp(afterAuction.add(1))

      expect(
        await EditionsAuction.getSalePrice(0)
      ).to.eq(auction.endPrice)
    })

    // TODO: revert if auction doesn't exist
  })

  describe("#purchase()", async () => {
    let auction: any
    beforeEach(async () => {
      await createAuction()
      auction = await EditionsAuction.auctions(0)
    })

    it("should revert if auction hasn't started yet", async () => {
      await expect(
        EditionsAuction.purchase(0, {value: ethers.utils.parseEther("1.0")})
      ).to.be.revertedWith("Auction has not started yet")
    })

    it("should revert if the wrong price", async () => {
      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp)

      await expect(
         EditionsAuction.purchase(0, {value: ethers.utils.parseEther("0.2")})
      ).to.be.revertedWith("Wrong price")
    })

    it("should purchase", async () => {
      // approve EditionsAuction for minting
      await SingleEdition.connect(creator)
        .setApprovedMinter(EditionsAuction.address, true)

      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp)

      // purchase
      expect(
        await EditionsAuction.connect(collector).purchase(0, {value: ethers.utils.parseEther("1.0")})
      ).to.emit(EditionsAuction, "EditionPurchased")

      // check token balance
      expect(
        await SingleEdition.balanceOf(await collector.getAddress())
      ).to.eq(1)
    })

    it("should split royalties", async () => {
      // approve EditionsAuction for minting
      await SingleEdition.connect(creator).setApprovedMinter(EditionsAuction.address, true)

      // goto start of auction
      await mineToTimestamp(auction.startTimestamp)

      // purchase edition
      await EditionsAuction.connect(collector)
        .purchase(0, {value: ethers.utils.parseEther("1.0")})

      // curator
      expect(
        await EditionsAuction.paymentsOwed(await curator.getAddress())
      ).to.eq(ethers.utils.parseEther("0.1"));

      // creator
      expect(
        await EditionsAuction.paymentsOwed(await creator.getAddress())
      ).to.eq(ethers.utils.parseEther("0.9"));
    })

    it("should revert if sold out", async () => {
      // approve EditionsAuction for minting
      await SingleEdition.connect(creator).setApprovedMinter(EditionsAuction.address, true)

      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp);

      const generatePurchases = async function * () {
        //editions left
        let leftToMint = (await EditionsAuction.numberCanMint(0)).toNumber()
        while(leftToMint > 0){
          leftToMint--
          yield await EditionsAuction.purchase(0, {value: ethers.utils.parseEther("1.0")})
        }
      }

      // purchase all editions
      for await ( const purchase of generatePurchases() ){
        expect(purchase).to.emit(EditionsAuction, "EditionPurchased")
      }

      // purchase when no editons left
      await expect(
        EditionsAuction.purchase(0, {value: ethers.utils.parseEther("1.0")})
      ).to.be.revertedWith("Sold out")
    })
  })

  describe("#withdraw()", async () => {

    let auction: any
    beforeEach(async () => {
      await createAuction()
      auction = await EditionsAuction.auctions(0)
    })

    // TODO: should revert when balance is 0

    it("should withdraw correct royalties", async () => {
      // approve EditionsAuction for minting
      await SingleEdition.connect(creator)
        .setApprovedMinter(EditionsAuction.address, true)

      // goto start of auction
      await mineToTimestamp(auction.startTimestamp)

      // purchase edition
      await EditionsAuction.connect(collector)
        .purchase(0, {value: ethers.utils.parseEther("1.0")})

      const creatorBalance = await creator.getBalance()
      const curatorBalance = await curator.getBalance()

      // TODO: expect Withdrawn event from escrow contract?
      // Widthdraw
      await EditionsAuction.withdraw(await curator.getAddress())
      await EditionsAuction.connect(creator).withdraw(await creator.getAddress())

      expect(
        (await curator.getBalance())
          .sub(curatorBalance)
          .gte(ethers.utils.parseEther("0.09")) // some lost to gas
      ).to.eq(true)

      expect(
        (await creator.getBalance())
          .sub(creatorBalance)
          .gte(ethers.utils.parseEther("0.89")) // some lost to gas
      ).to.eq(true)
    })
  })

  describe("#NumberCanMint()", async () => {
    it("should return number of editions left to mint", async () => {
      await createAuction()

      expect(
        (await EditionsAuction.numberCanMint(0)).toNumber()
      ).to.eq(10)
    })
  })

  //TODO: stress test multiple auctions lots of purchases
  //NOTE: See https://hardhat.org/hardhat-network/explanation/mining-modes.html
  describe("auction", async () => {
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
      // pause auto mine
      await setAutoMine(false)

      // purchase two edition's
      await EditionsAuction.connect(collectorA)
        .purchase(0, {value: ethers.utils.parseEther("1.0")})
      await EditionsAuction.connect(collectorA)
        .purchase(0, {value: ethers.utils.parseEther("1.0")})

      // purchase one edition
      await EditionsAuction.connect(collectorB)
        .purchase(0, {value: ethers.utils.parseEther("1.0")})

      // wrong price
      await EditionsAuction.connect(collectorC)
        .purchase(0, {value: ethers.utils.parseEther("0.9")})

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
      // curator
      expect(
        await EditionsAuction.paymentsOwed(await curator.getAddress())
      ).to.eq(ethers.utils.parseEther("0.3"));
      // creator
      expect(
        await EditionsAuction.paymentsOwed(await creator.getAddress())
      ).to.eq(ethers.utils.parseEther("2.7"));

      // un-pause auto mine
      await setAutoMine(true)
    })
  })
})