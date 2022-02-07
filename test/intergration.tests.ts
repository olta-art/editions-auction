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


describe.only("EditionsAuction", () => {
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

    // TODO: curator auction stress tests
  })

})