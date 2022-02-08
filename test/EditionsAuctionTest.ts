import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers, deployments } from "hardhat";

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
} from "./utils"

describe("EditionsAuction", () => {
  let curator: SignerWithAddress;
  let creator: SignerWithAddress;
  let collector: SignerWithAddress;
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
      editionContract: SingleEdition.address,
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
      params.editionContract,
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
    weth = await deployWETH()
  })

  describe("#CreateAuctionDrop()", async () => {

    it("reverts if editions contract doesnt support NFT interface", async () => {
      const { BadERC721 } = await deployments.fixture([
        "BadERC721"
      ]);
      await expect(
        createAuction(creator, {
          editionContract: BadERC721.address
        })
      ).to.be.revertedWith("Doesn't support NFT interface")
    })

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

    it("reverts if no curator and royalties are not 0", async () => {
      await expect(
        createAuction(creator, {
          curator: ethers.constants.AddressZero,
          curatorRoyaltyBPS: 1000
        })
      ).to.be.revertedWith("Royalties would be sent into the void")
    })

    it("auto approves if no curator", async () => {
      expect(
        await createAuction(creator, {
          curator: ethers.constants.AddressZero,
          curatorRoyaltyBPS: 0
        })
      ).to.emit(EditionsAuction, "AuctionApprovalUpdated")

      const auction = await EditionsAuction.auctions(0)

      expect(auction.approved).to.eq(true)
    })

    it("auto approve if curator is creator", async () => {
      expect(
        await createAuction(creator, {
          curator: await creator.getAddress(),
          curatorRoyaltyBPS: 1000
        })
      ).to.emit(EditionsAuction, "AuctionApprovalUpdated")
      const auction = await EditionsAuction.auctions(0)

      expect(auction.approved).to.eq(true)
      expect(auction.curatorRoyaltyBPS).to.eq(1000)
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
      expect(auction.curator).to.eq(ethers.constants.AddressZero)
      expect(auction.curatorRoyaltyBPS).to.eq(0)
      expect(auction.approved).to.eq(true) // auto approves
      expect(auction.auctionCurrency).to.eq(weth.address)
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
      await weth.connect(collector).deposit({ value: ethers.utils.parseEther("1.0") });
    })

    it("should revert if auction hasn't started yet", async () => {
      await expect(
        EditionsAuction.purchase(0, ethers.utils.parseEther("1.0"))
      ).to.be.revertedWith("Auction has not started yet")
    })

    it("should revert if not approved to spend ERC-20", async () => {

      const [ _, __, ___, collectorB] = await ethers.getSigners();

      // approve EditionsAuction for minting
      await SingleEdition.connect(creator)
        .setApprovedMinter(EditionsAuction.address, true)

      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp)

      await expect(
        EditionsAuction.connect(collectorB).purchase(0, ethers.utils.parseEther("1.0"))
      ).to.be.revertedWith("SafeERC20: low-level call failed")
    })

    it("should revert if signer has insufficient balance", async () => {
      // signer with 0 WETH
      const [ _, __, ___, collectorB] = await ethers.getSigners();

      // approve EditionsAuction for minting
      await SingleEdition.connect(creator)
        .setApprovedMinter(EditionsAuction.address, true)

      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp)

      // approve auction to spend WETH
      await weth.connect(collectorB).approve(EditionsAuction.address, ethers.utils.parseEther("1.0"))

      await expect(
        EditionsAuction.connect(collectorB).purchase(0, ethers.utils.parseEther("1.0"))
      ).to.be.revertedWith("SafeERC20: low-level call failed")
    })

    it("should revert if the wrong price", async () => {
      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp)

      await expect(
         EditionsAuction.purchase(0, ethers.utils.parseEther("0.2"))
      ).to.be.revertedWith("Must be more or equal to sale price")
    })

    it("should purchase", async () => {
      // approve EditionsAuction for minting
      await SingleEdition.connect(creator)
        .setApprovedMinter(EditionsAuction.address, true)

      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp)

      // approve auction to spend WETH
      await weth.connect(collector).approve(EditionsAuction.address, ethers.utils.parseEther("1.0"))

      // purchase
      expect(
        await EditionsAuction.connect(collector).purchase(0, ethers.utils.parseEther("1.0"))
      ).to.emit(EditionsAuction, "EditionPurchased")

      // check token balance
      expect(
        await SingleEdition.balanceOf(await collector.getAddress())
      ).to.eq(1)
    })

    it("should split royalties", async () => {
      // approve EditionsAuction for minting
      await SingleEdition.connect(creator).setApprovedMinter(EditionsAuction.address, true)

      // create auction with curator
      await createAuction(creator, {
        curator: await curator.getAddress(),
        curatorRoyaltyBPS: 1000
      })
      const auctionWithCurator = await EditionsAuction.auctions(1)
      // curator approves auction
      await EditionsAuction.connect(curator).setAuctionApproval(1, true)

      expect(auctionWithCurator.curator).to.eq(await curator.getAddress())
      expect(auctionWithCurator.curatorRoyaltyBPS).to.eq(1000)

      // goto start of auction
      await mineToTimestamp(auctionWithCurator.startTimestamp)

      // approve auction to spend WETH
      await weth.connect(collector).approve(EditionsAuction.address, ethers.utils.parseEther("1.0"))

      // purchase edition
      await EditionsAuction.connect(collector)
        .purchase(1, ethers.utils.parseEther("1.0"))

      // curator
      expect(
        await weth.balanceOf(await curator.getAddress())
      ).to.eq(ethers.utils.parseEther("0.1"));

      // // creator
      expect(
        await weth.balanceOf(await creator.getAddress())
      ).to.eq(ethers.utils.parseEther("0.9"));
    })

    it("should purchase at price based on block timestamp", async () => {
      // approve EditionsAuction for minting
      await SingleEdition.connect(creator).setApprovedMinter(EditionsAuction.address, true)

      await weth.connect(collector).approve(EditionsAuction.address, ethers.utils.parseEther("1.0"))

      // move to time to end of auction
      const timestamp = auction.startTimestamp.add(auction.stepTime.mul(5))
      await mineToTimestamp(timestamp)

      const balanceBefore = await weth.balanceOf(await collector.getAddress())

      // purchase edition
      expect(
        await EditionsAuction.connect(collector)
          .purchase(0, ethers.utils.parseEther("1.0"))
      ).to.emit(EditionsAuction, "EditionPurchased")

      const balanceAfter = await weth.balanceOf(await collector.getAddress())

      // pay only 0.2 weth
      expect (
        balanceBefore.sub(balanceAfter)
      ).to.eq(ethers.utils.parseEther("0.2"))

      // check token balance
      expect(
        await SingleEdition.balanceOf(await collector.getAddress())
      ).to.eq(1)
    })

    it("should revert if sold out", async () => {
      // approve EditionsAuction for minting
      await SingleEdition.connect(creator).setApprovedMinter(EditionsAuction.address, true)

      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp);

      // deposit 10 weth
      await weth.connect(collector).deposit({ value: ethers.utils.parseEther("10.0") });
      // approve auction to spend 10 WETH
      await weth.connect(collector).approve(EditionsAuction.address, ethers.utils.parseEther("10.0"))

      const generatePurchases = async function * () {
        //editions left
        let leftToMint = (await EditionsAuction.numberCanMint(0)).toNumber()
        while(leftToMint > 0){
          leftToMint--
          yield await EditionsAuction.connect(collector).purchase(0, ethers.utils.parseEther("1.0"))
        }
      }

      // purchase all editions
      for await ( const purchase of generatePurchases() ){
        expect(purchase).to.emit(EditionsAuction, "EditionPurchased")
      }

      // purchase when no editons left
      await expect(
        EditionsAuction.connect(collector).purchase(0, ethers.utils.parseEther("1.0"))
      ).to.be.revertedWith("Sold out")
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

  describe("#setAuctionApproval", async () => {
    beforeEach(async () => {
      await createAuction(creator, {
        curator: await curator.getAddress(),
        curatorRoyaltyBPS: 1000
      })
    })

    it("should revert when not curator", async () => {
      await expect(
        EditionsAuction.connect(collector).setAuctionApproval(0, true)
      ).to.be.revertedWith("must be curator")
    })

    it("should approve", async () => {
      await expect(
        EditionsAuction.connect(curator).setAuctionApproval(0, true)
      ).to.emit(EditionsAuction, "AuctionApprovalUpdated")

      const auction = await EditionsAuction.auctions(0)
      expect(auction.approved).to.eq(true)
      expect(auction.curatorRoyaltyBPS).to.eq(1000)
    })
  })
})