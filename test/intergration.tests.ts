import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers, deployments } from "hardhat";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ProjectCreator,
  StandardProject,
  DutchAuctionDrop,
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
  equalWithin,
  projectData,
  defaultVersion,
  Implementation
} from "./utils"


describe("DutchAuctionDrop", () => {
  let curator: SignerWithAddress;
  let creator: SignerWithAddress;
  let collector: SignerWithAddress;
  let curatorAddress: string;
  let creatorAddress: string;
  let collectorAddress: string;

  let ProjectCreator: ProjectCreator;
  let DutchAuctionDrop: DutchAuctionDrop;
  let StandardProject: StandardProject;
  let weth: WETH;

  const createProject = async (signer: SignerWithAddress = creator) => {
    const transaction = await ProjectCreator.connect(signer).createProject(
      projectData(
        "Testing Token",
        "TEST",
        "This is a testing token for all",
        defaultVersion(),
        // 1% royalty since BPS
        10,
        10
      ),
      Implementation.standard
    );
    const [id] = await getEventArguments(transaction, "CreatedProject")
    const StandardProjectAddress = await ProjectCreator.getProjectAtId(id, Implementation.standard)

    // Note[George]: found I had to pass abi here to get this to work
    const { abi } = await deployments.get("StandardProject")
    const StandardProject = (await ethers.getContractAt(
      abi,
      StandardProjectAddress
    )) as StandardProject;

    return StandardProject
  }

  const createAuction = async (signer: SignerWithAddress = creator, options = {}) => {
    const defaults = {
      project: {id: StandardProject.address, implementation: 0},
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

    return DutchAuctionDrop.connect(signer).createAuction(
      params.project,
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
    const auction = await DutchAuctionDrop.auctions(auctionId)

    const numberCanMint = await DutchAuctionDrop.numberCanMint(auctionId)
    const maxTimeIncrease = auction.duration.div(numberCanMint).toNumber() * 3

    const purchaseEdition = async () => {
      const previousBlockTimestamp = await getPreviousBlockTimestamp()

      // increase block timestamp
      const timeIncrease = getRandomInt(0, maxTimeIncrease)
      await mineToTimestamp(ethers.BigNumber.from(previousBlockTimestamp + timeIncrease))

      // make purchase
      const salePrice = await DutchAuctionDrop.getSalePrice(auctionId)
      return await DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](auctionId, salePrice)
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
    const auction = await DutchAuctionDrop.auctions(auctionId)
    // goto start of auction
    await mineToTimestamp(auction.startTimestamp)

    const purchases = await generatePurchases(auctionId)

    let total = ethers.BigNumber.from(0)
    // purchase all editions
    for await ( const purchase of purchases() ){
      expect(purchase).to.emit(DutchAuctionDrop, "EditionPurchased")
    }

    // purchase when no editons left
    const salePrice = await DutchAuctionDrop.getSalePrice(0)
    await expect(
      DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](0, salePrice)
    ).to.be.revertedWith("Sold out")

    return total
  }

  beforeEach(async () => {
    const { ProjectCreator: ProjectCreatorContract, DutchAuctionDrop: DutchAuctionDropContract } = await deployments.fixture([
      "ProjectCreator",
      "StandardProject",
      "DutchAuctionDrop"
    ]);

    ProjectCreator = (await ethers.getContractAt(
      ProjectCreatorContract.abi,
      ProjectCreatorContract.address
    )) as ProjectCreator;

    DutchAuctionDrop = (await ethers.getContractAt(
      "DutchAuctionDrop",
      DutchAuctionDropContract.address
    )) as DutchAuctionDrop;

    const [_curator, _creator, _collector] = await ethers.getSigners();
    curator = _curator;
    creator = _creator;
    collector = _collector;

    curatorAddress = await curator.getAddress();
    creatorAddress = await creator.getAddress();
    collectorAddress = await collector.getAddress();

    // allow anyone to create a project
    await ProjectCreator.setCreatorApprovals([{
      id: ethers.constants.AddressZero.toString(),
      approval: true
    }])

    StandardProject = await createProject()
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
      await weth.connect(collector).approve(DutchAuctionDrop.address, ethers.utils.parseEther("40.0"))

      const options =  await genarateAuctionParams(true)
      await createAuction(creator, options)

      auction = await DutchAuctionDrop.auctions(0)
      await StandardProject.connect(creator)
        .setApprovedMinter(DutchAuctionDrop.address, true)

      if(!auction.approved){
        await DutchAuctionDrop.connect(curator).setAuctionApproval(0, true)
      }
    })
    it("mints tokens", async () => {
      await runAuction(0)

      const collectorNFTBalance = await StandardProject.balanceOf(collectorAddress)
      const editionSize = ethers.BigNumber.from(10)
      expect(
        collectorNFTBalance.eq(editionSize)
      ).to.eq(true)
    })
    it("pays creator", async () => {

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
      const contractBalance = await weth.balanceOf(DutchAuctionDrop.address)
      expect(contractBalance).to.eq(ethers.utils.parseEther("0.0"))
    })

    it("pays curator", async () => {
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

    it("does not lock any funds in contract", async () => {
      await runAuction(0)

      // zero balance locked in contract
      const contractBalance = await weth.balanceOf(DutchAuctionDrop.address)
      expect(contractBalance).to.eq(ethers.utils.parseEther("0.0"))
    })
  })

  describe("WETH auction with no curator [FUZZY]", async () => {
    let auction: any

    beforeEach(async () => {
      weth = await deployWETH()
      // deposit WETH - enough for 100 editons at max price
      await weth.connect(collector).deposit({ value: ethers.utils.parseEther("40.0") });
      await weth.connect(collector).approve(DutchAuctionDrop.address, ethers.utils.parseEther("40.0"))

      const options =  await genarateAuctionParams(false) // no curator
      await createAuction(creator, options)

      auction = await DutchAuctionDrop.auctions(0)
      await StandardProject.connect(creator)
        .setApprovedMinter(DutchAuctionDrop.address, true)

      if(!auction.approved){
        await DutchAuctionDrop.connect(curator).setAuctionApproval(0, true)
      }
    })
    it("mints tokens", async () => {
      await runAuction(0)

      const collectorNFTBalance = await StandardProject.balanceOf(collectorAddress)
      const editionSize = ethers.BigNumber.from(10)
      expect(
        collectorNFTBalance.eq(editionSize)
      ).to.eq(true)
    })
    it("pays creator", async () => {

      const collectorBalanceStart = await weth.balanceOf(collectorAddress)
      await runAuction(0)
      const collectorBalanceEnd = await weth.balanceOf(collectorAddress)

      const total = collectorBalanceStart.sub(collectorBalanceEnd)

      const creatorBalanceActual = await weth.balanceOf(creatorAddress)

      expect(
        total.eq(creatorBalanceActual)
      ).to.eq(true)
    })

    it("does not lock any funds in contract", async () => {
      await runAuction(0)

      // zero balance locked in contract
      const contractBalance = await weth.balanceOf(DutchAuctionDrop.address)
      expect(contractBalance).to.eq(ethers.utils.parseEther("0.0"))
    })
  })


  describe("WETH auction with no curator", async () => {
    let auction: any
    beforeEach(async () => {
      await createAuction()
      auction = await DutchAuctionDrop.auctions(0)
      await StandardProject.connect(creator)
        .setApprovedMinter(DutchAuctionDrop.address, true)
      // goto start of auction
      await mineToTimestamp(auction.startTimestamp)
    })
    it("allows for mints in the same block", async () => {
      const [ _, __, collectorA, collectorB, collectorC] = await ethers.getSigners();

      // deposit 10 weth
      await weth.connect(collectorA).deposit({ value: ethers.utils.parseEther("2.0") });
      await weth.connect(collectorA).approve(DutchAuctionDrop.address, ethers.utils.parseEther("2.0"))

      await weth.connect(collectorB).deposit({ value: ethers.utils.parseEther("1.0") });
      await weth.connect(collectorB).approve(DutchAuctionDrop.address, ethers.utils.parseEther("1.0"))

      await weth.connect(collectorC).deposit({ value: ethers.utils.parseEther("1.0") });
      await weth.connect(collectorC).approve(DutchAuctionDrop.address, ethers.utils.parseEther("1.0"))

      // pause auto mine
      await setAutoMine(false)

      // purchase two edition's
      await DutchAuctionDrop.connect(collectorA)
        ["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))
      await DutchAuctionDrop.connect(collectorA)
        ["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))

      // purchase one edition
      await DutchAuctionDrop.connect(collectorB)
        ["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))

      // wrong price
      await DutchAuctionDrop.connect(collectorC)
        ["purchase(uint256,uint256)"](0, ethers.utils.parseEther("0.9"))

      // check token balance
      expect(
        await StandardProject.balanceOf(await collectorA.getAddress())
      ).to.eq(0)

      await mine()

      // check token balance
      expect(
        await StandardProject.balanceOf(await collectorA.getAddress())
      ).to.eq(2)

      expect(
        await StandardProject.balanceOf(await collectorB.getAddress())
      ).to.eq(1)

      expect(
        await StandardProject.balanceOf(await collectorC.getAddress())
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