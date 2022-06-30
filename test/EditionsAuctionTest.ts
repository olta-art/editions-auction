import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers, deployments } from "hardhat";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ProjectCreator,
  StandardProject,
  SeededProject,
  DutchAuctionDrop,
  WETH,
  ExposedInternals
} from "../typechain";

import {
  mineToTimestamp,
  getEventArguments,
  deployWETH,
  defaultVersion,
  Implementation,
  projectData
} from "./utils"

describe("DutchAuctionDrop", () => {
  let curator: SignerWithAddress;
  let creator: SignerWithAddress;
  let collector: SignerWithAddress;
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
        10,
        10
      ),
      Implementation.standard
    );
    const [id] = await getEventArguments(transaction, "CreatedProject")

    const project = await ProjectCreator.getProjectAtId(id, Implementation.standard)

    const { abi } = await deployments.get("StandardProject")
    return (await ethers.getContractAt(
      abi,
      project
    )) as StandardProject
  }

  const createSeededProject = async (signer: SignerWithAddress = creator) => {
    const transaction = await ProjectCreator.connect(signer).createProject(
      projectData(
        "Testing Token",
        "TEST",
        "This is a testing token for all",
        defaultVersion(),
        10,
        10
      ),
      Implementation.seeded
    )
    const [id] = await getEventArguments(transaction, "CreatedProject")
    const project = await ProjectCreator.getProjectAtId(id, Implementation.seeded)

    const { abi } = await deployments.get("SeededProject")
    return (await ethers.getContractAt(
      abi,
      project
    )) as SeededProject
  }

  const createAuction = async (signer: SignerWithAddress = creator, options = {}) => {
    const defaults = {
      project: {
        id: StandardProject.address,
        implementation: Implementation.standard
      },
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

  beforeEach(async () => {
    const { ProjectCreator: ProjectCreatorContract, DutchAuctionDrop: DutchAuctionDropContract } = await deployments.fixture([
      "ProjectCreator",
      "DutchAuctionDrop"
    ]);

    // const SingleEditonCreatorArtifact = await deployments.getArtifact("SingleEditionMintableCreator")
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

    StandardProject = await createProject()
    weth = await deployWETH()
  })

  describe("#CreateAuction()", async () => {

    it("reverts if editions contract doesnt support NFT interface", async () => {
      const { BadERC721 } = await deployments.fixture([
        "BadERC721"
      ]);
      await expect(
        createAuction(creator, {
          project: {id: BadERC721.address, implementation: Implementation.standard}
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

    it("reverts if auction already exists for edition contract", async () => {
      // create auction
      expect(
        await createAuction(creator, {
          curator: ethers.constants.AddressZero,
          curatorRoyaltyBPS: 0
        })
      ).to.emit(DutchAuctionDrop, "AuctionApprovalUpdated")

      // attempt to create 2nd auction
      await expect(
        createAuction(creator, {
          curator: ethers.constants.AddressZero,
          curatorRoyaltyBPS: 0
        })
      ).to.be.revertedWith("Auction already exists")
    })

    it("auto approves if no curator", async () => {
      expect(
        await createAuction(creator, {
          curator: ethers.constants.AddressZero,
          curatorRoyaltyBPS: 0
        })
      ).to.emit(DutchAuctionDrop, "AuctionApprovalUpdated")

      const auction = await DutchAuctionDrop.auctions(0)

      expect(auction.approved).to.eq(true)
    })

    it("auto approve if curator is creator", async () => {
      expect(
        await createAuction(creator, {
          curator: await creator.getAddress(),
          curatorRoyaltyBPS: 1000
        })
      ).to.emit(DutchAuctionDrop, "AuctionApprovalUpdated")
      const auction = await DutchAuctionDrop.auctions(0)

      expect(auction.approved).to.eq(true)
      expect(auction.curatorRoyaltyBPS).to.eq(1000)
    })

    it("creates a auction", async () => {
      const startTime = Math.floor((Date.now() / 1000)) + 60 * 2 // now + 2 mins

      expect(
        await createAuction(creator, {
          startTime
        })
      ).to.emit(DutchAuctionDrop, "AuctionCreated")

      const auction = await DutchAuctionDrop.auctions(0)

      expect(auction.project.id).to.eq(StandardProject.address)
      expect(auction.startTimestamp).to.eq(startTime)
      expect(auction.duration).to.eq(8 * 60)
      expect(auction.startPrice).to.eq(ethers.utils.parseEther("1.0"))
      expect(auction.endPrice).to.eq(ethers.utils.parseEther("0.2"))
      expect(auction.numberOfPriceDrops).to.eq(4)
      expect(auction.curator).to.eq(ethers.constants.AddressZero)
      expect(auction.curatorRoyaltyBPS).to.eq(0)
      expect(auction.approved).to.eq(true) // auto approves
      expect(auction.auctionCurrency).to.eq(weth.address)
    })
  })

  describe("#getSalePrice()", async () => {
    let auction: any // todo create interface for auction
    beforeEach(async () => {
      await createAuction()
      auction = await DutchAuctionDrop.auctions(0)
    })

    it("should be startPirce before auction", async () => {
      expect(
        await DutchAuctionDrop.getSalePrice(0)
      ).to.eq(auction.startPrice)
    })

    it("should drop the price at set intervals during auction", async () => {
      const stepTime = ethers.BigNumber.from(60 * 2)
      const stepPrice = ethers.utils.parseEther("0.2")
      for(let i = 1; i <= auction.numberOfPriceDrops; i++){
        // move the blocks along
        const time = auction.startTimestamp.add(stepTime.mul(i))
        await mineToTimestamp(time)

        const expectedPrice = auction.startPrice.sub(stepPrice.mul(i - 1))

        expect(
          await DutchAuctionDrop.getSalePrice(0)
        ).to.eq(expectedPrice)
      }
    })

    it("should quantize price during auction", async () => {

      const anotherStandardProject = await createProject(creator)

      // approve DutchAuctionDrop for minting
      await anotherStandardProject.connect(creator).setApprovedMinter(DutchAuctionDrop.address, true)

      const numberOfPriceDrops = 3
      const startPrice = ethers.utils.parseEther("10.23456")
      const endPrice = ethers.utils.parseEther("0.1")

      const min = 60

      // create auction with curator
      await createAuction(creator, {
        project: {
          id: anotherStandardProject.address,
          implementation: Implementation.standard
        },
        duration: min * 6, // 6 minutes
        startPrice,
        endPrice,
        numberOfPriceDrops
      })
      const auction2 = await DutchAuctionDrop.auctions(1)

      const startTime = auction2.startTimestamp

      await mineToTimestamp(startTime.add(min * 2))
      expect(
        await DutchAuctionDrop.getSalePrice(1)
      ).to.equal(
        startPrice
      )

      await mineToTimestamp(startTime.add(min * 4))
      expect(
        await DutchAuctionDrop.getSalePrice(1)
      ).to.equal(
        ethers.utils.parseUnits("6.8")
      )

      await mineToTimestamp(startTime.add(min * 6))
      expect(
        await DutchAuctionDrop.getSalePrice(1)
      ).to.equal(
        ethers.utils.parseUnits("3.4")
      )

      await mineToTimestamp(startTime.add(min * 8))
      expect(
        await DutchAuctionDrop.getSalePrice(1)
      ).to.equal(
        endPrice
      )
    })

    it("should be endPrice after auction", async () => {
      const afterAuction = auction.startTimestamp.add(auction.duration)
      await mineToTimestamp(afterAuction.add(1))

      expect(
        await DutchAuctionDrop.getSalePrice(0)
      ).to.eq(auction.endPrice)
    })

    // TODO: revert if auction doesn't exist
  })

  describe("#purchase(uint256 auctionId, uint256 amount)", async () => {
    let auction: any

    beforeEach(async () => {
      await createAuction()
      auction = await DutchAuctionDrop.auctions(0)
      await weth.connect(collector).deposit({ value: ethers.utils.parseEther("1.0") });
    })

    it("should revert if auction hasn't started yet", async () => {
      await expect(
        DutchAuctionDrop["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))
      ).to.be.revertedWith("Auction has not started yet")
    })

    it("should revert if not approved to spend ERC-20", async () => {

      const [ _, __, ___, collectorB] = await ethers.getSigners();

      // approve DutchAuctionDrop for minting
      await StandardProject.connect(creator)
        .setApprovedMinter(DutchAuctionDrop.address, true)

      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp)

      await expect(
        DutchAuctionDrop.connect(collectorB)["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))
      ).to.be.revertedWith("SafeERC20: low-level call failed")
    })

    it("should revert if signer has insufficient balance", async () => {
      // signer with 0 WETH
      const [ _, __, ___, collectorB] = await ethers.getSigners();

      // approve DutchAuctionDrop for minting
      await StandardProject.connect(creator)
        .setApprovedMinter(DutchAuctionDrop.address, true)

      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp)

      // approve auction to spend WETH
      await weth.connect(collectorB).approve(DutchAuctionDrop.address, ethers.utils.parseEther("1.0"))

      await expect(
        DutchAuctionDrop.connect(collectorB)["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))
      ).to.be.revertedWith("SafeERC20: low-level call failed")
    })

    it("should revert if the wrong price", async () => {
      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp)

      await expect(
         DutchAuctionDrop["purchase(uint256,uint256)"](0, ethers.utils.parseEther("0.2"))
      ).to.be.revertedWith("Must be more or equal to sale price")
    })

    it("should revert if editions contract is seeded implenetation", async () => {
      // create seeded edition and auction
      const seededEdition = await createSeededProject()

      // create seeded auction, id = 1
      await createAuction(creator, {
        project: {
          id: seededEdition.address,
          implementation: Implementation.seeded
        }
      })
      const seededAuction = await DutchAuctionDrop.auctions(1)

      // approve DutchAuctionDrop for minting
      await seededEdition.connect(creator)
        .setApprovedMinter(DutchAuctionDrop.address, true)

      // move to when auction starts
      await mineToTimestamp(seededAuction.startTimestamp)

      await expect(
        DutchAuctionDrop["purchase(uint256,uint256)"](1, ethers.utils.parseEther("0.2"))
      ).to.be.revertedWith("Must be edition contract")
    })

    it("should purchase", async () => {
      // approve DutchAuctionDrop for minting
      await StandardProject.connect(creator)
        .setApprovedMinter(DutchAuctionDrop.address, true)

      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp)

      // approve auction to spend WETH
      await weth.connect(collector).approve(DutchAuctionDrop.address, ethers.utils.parseEther("1.0"))

      // purchase
      expect(
        await DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))
      ).to.emit(DutchAuctionDrop, "EditionPurchased")

      // check token balance
      expect(
        await StandardProject.balanceOf(await collector.getAddress())
      ).to.eq(1)
    })

    it("should purchase for zero", async () => {
      // create another project
      const anotherStandardProject = await createProject()
      // create another auction with end price set to zero
      await createAuction(creator, {
        project: {
            id: anotherStandardProject.address,
            implementation: Implementation.standard
        },
        endPrice: 0
      })
      auction = await DutchAuctionDrop.auctions(1)

      // approve DutchAuctionDrop for minting
      await anotherStandardProject.connect(creator)
        .setApprovedMinter(DutchAuctionDrop.address, true)

      // move to when auction is over
      await mineToTimestamp(auction.startTimestamp.add(auction.duration))

      // purchase for zero
      expect(
        await DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](1, 0)
      ).to.emit(DutchAuctionDrop, "EditionPurchased")

      // check token balance
      expect(
        await anotherStandardProject.balanceOf(await collector.getAddress())
      ).to.eq(1)
    })

    it("should split royalties", async () => {

      const anotherStandardProject = await createProject(creator)

      // approve DutchAuctionDrop for minting
      await anotherStandardProject.connect(creator).setApprovedMinter(DutchAuctionDrop.address, true)

      // create auction with curator
      await createAuction(creator, {
        project: {
          id: anotherStandardProject.address,
          implementation: Implementation.standard
        },
        curator: await curator.getAddress(),
        curatorRoyaltyBPS: 1000
      })
      const auctionWithCurator = await DutchAuctionDrop.auctions(1)
      // curator approves auction
      await DutchAuctionDrop.connect(curator).setAuctionApproval(1, true)

      expect(auctionWithCurator.curator).to.eq(await curator.getAddress())
      expect(auctionWithCurator.curatorRoyaltyBPS).to.eq(1000)

      // goto start of auction
      await mineToTimestamp(auctionWithCurator.startTimestamp)

      // approve auction to spend WETH
      await weth.connect(collector).approve(DutchAuctionDrop.address, ethers.utils.parseEther("1.0"))

      // purchase edition
      await DutchAuctionDrop.connect(collector)
        ["purchase(uint256,uint256)"](1, ethers.utils.parseEther("1.0"))

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
      // approve DutchAuctionDrop for minting
      await StandardProject.connect(creator).setApprovedMinter(DutchAuctionDrop.address, true)

      await weth.connect(collector).approve(DutchAuctionDrop.address, ethers.utils.parseEther("1.0"))

      const stepTime = ethers.BigNumber.from(60 * 2)

      // move to time to end of auction
      const timestamp = auction.startTimestamp.add(stepTime.mul(5))
      await mineToTimestamp(timestamp)

      const balanceBefore = await weth.balanceOf(await collector.getAddress())

      // purchase edition
      expect(
        await DutchAuctionDrop.connect(collector)
          ["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))
      ).to.emit(DutchAuctionDrop, "EditionPurchased")

      const balanceAfter = await weth.balanceOf(await collector.getAddress())

      // pay only 0.2 weth
      expect (
        balanceBefore.sub(balanceAfter)
      ).to.eq(ethers.utils.parseEther("0.2"))

      // check token balance
      expect(
        await StandardProject.balanceOf(await collector.getAddress())
      ).to.eq(1)
    })

    it("should revert if sold out", async () => {
      // approve DutchAuctionDrop for minting
      await StandardProject.connect(creator).setApprovedMinter(DutchAuctionDrop.address, true)

      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp);

      // deposit 10 weth
      await weth.connect(collector).deposit({ value: ethers.utils.parseEther("10.0") });
      // approve auction to spend 10 WETH
      await weth.connect(collector).approve(DutchAuctionDrop.address, ethers.utils.parseEther("10.0"))

      const generatePurchases = async function * () {
        //editions left
        let leftToMint = (await DutchAuctionDrop.numberCanMint(0)).toNumber()
        while(leftToMint > 0){
          leftToMint--
          yield await DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))
        }
      }

      // purchase all editions
      for await ( const purchase of generatePurchases() ){
        expect(purchase).to.emit(DutchAuctionDrop, "EditionPurchased")
      }

      // purchase when no editons left
      await expect(
        DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))
      ).to.be.revertedWith("Sold out")
    })

    describe("during a collector give away:", () => {
      beforeEach(async () => {
        // approve DutchAuctionDrop for minting
        await StandardProject.connect(creator).setApprovedMinter(DutchAuctionDrop.address, true)

        // move to when auction is over
        await mineToTimestamp(auction.startTimestamp.add(auction.duration));

        // deposit 10 weth
        await weth.connect(collector).deposit({ value: ethers.utils.parseEther("10.0") });
        // approve auction to spend 10 WETH
        await weth.connect(collector).approve(DutchAuctionDrop.address, ethers.utils.parseEther("10.0"))
      })

      it("should revert if not a collector", async () => {
        // open collector give away
        await DutchAuctionDrop.connect(creator).setCollectorGiveAway(0, true)

        // try to purchase without purchasing before collector give away
        await expect(
          DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](0, 0)
        ).to.be.revertedWith("Must be a collector")
      })

      it("should purchase for free for collectors", async () => {
        // purchase an edition
        await DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))

        // open collector give away
        await DutchAuctionDrop.connect(creator).setCollectorGiveAway(0, true)

        //purchase for zero weth as a collector during a collector giveway
        await expect(
          DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](0, 0)
        ).to.emit(DutchAuctionDrop, "EditionPurchased")
      })
    })
  })

  describe("#purchase(uint256 auctionId, uint256 amount, uint256 seed)", () => {
    let SeededProject: SeededProject
    let seededAuction: any
    let notSeededProject: StandardProject
    let notSeededAuction: any
    beforeEach( async () => {
      // create seeded edition and auction
      SeededProject = await createSeededProject()
      await createAuction(creator, {
        project: {
          id: SeededProject.address,
          implementation: Implementation.seeded
        }
      })
      seededAuction = await DutchAuctionDrop.auctions(0)

      // create not seeded edtion and auction
      notSeededProject = await createProject()
      await createAuction()
      notSeededAuction = await DutchAuctionDrop.auctions(1)

      // give collector some weth
      await weth.connect(collector).deposit({ value: ethers.utils.parseEther("1.0") });

      // approve auction to spend WETH
      await weth.connect(collector).approve(DutchAuctionDrop.address, ethers.utils.parseEther("1.0"))

      // approve DutchAuctionDrop for minting
      await SeededProject.connect(creator)
        .setApprovedMinter(DutchAuctionDrop.address, true)

      // move to when auction starts
      await mineToTimestamp(seededAuction.startTimestamp)
    })

    it("should revert if editions is not seeded implementation", async () => {
      const seed = 5
      await expect(
         DutchAuctionDrop.connect(collector)
          ["purchase(uint256,uint256,uint256)"](1, ethers.utils.parseEther("1.0"), seed)
      ).to.be.revertedWith("Must be seeded edition contract")
    })

    it("should purchase", async () => {
      const seed = 5
      expect(
        await DutchAuctionDrop.connect(collector)
          ["purchase(uint256,uint256,uint256)"](0, ethers.utils.parseEther("1.0"), seed)
      ).to.emit(DutchAuctionDrop, "SeededEditionPurchased")

      // check token balance
      expect(
        await SeededProject.balanceOf(await collector.getAddress())
      ).to.eq(1)
    })

    describe("during a collector give away:", () => {
      beforeEach(async () => {
        // approve DutchAuctionDrop for minting
        await SeededProject.connect(creator).setApprovedMinter(DutchAuctionDrop.address, true)

        // move to when auction is over
        await mineToTimestamp(seededAuction.startTimestamp.add(seededAuction.duration));

        // deposit 10 weth
        await weth.connect(collector).deposit({ value: ethers.utils.parseEther("10.0") });
        // approve auction to spend 10 WETH
        await weth.connect(collector).approve(DutchAuctionDrop.address, ethers.utils.parseEther("10.0"))
      })

      it("should revert if not a collector", async () => {
        // open collector give away
        await DutchAuctionDrop.connect(creator).setCollectorGiveAway(0, true)

        // try to purchase without purchasing before collector give away
        await expect(
          DutchAuctionDrop.connect(collector)["purchase(uint256,uint256,uint256)"](0, 0, 1)
        ).to.be.revertedWith("Must be a collector")
      })

      it("should purchase for free for collectors", async () => {
        // purchase an edition
        await DutchAuctionDrop.connect(collector)["purchase(uint256,uint256,uint256)"](0, ethers.utils.parseEther("1.0"), 1)

        // open collector give away
        await DutchAuctionDrop.connect(creator).setCollectorGiveAway(0, true)

        //purchase for zero weth as a collector during a collector giveway
        await expect(
          DutchAuctionDrop.connect(collector)["purchase(uint256,uint256,uint256)"](0, 0, 2)
        ).to.emit(DutchAuctionDrop, "SeededEditionPurchased")
      })
    })
  })

  describe("#NumberCanMint()", async () => {
    it("should return number of editions left to mint", async () => {
      await createAuction()

      expect(
        (await DutchAuctionDrop.numberCanMint(0)).toNumber()
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
        DutchAuctionDrop.connect(collector).setAuctionApproval(0, true)
      ).to.be.revertedWith("must be curator")
    })

    it("should approve", async () => {
      await expect(
        DutchAuctionDrop.connect(curator).setAuctionApproval(0, true)
      ).to.emit(DutchAuctionDrop, "AuctionApprovalUpdated")

      const auction = await DutchAuctionDrop.auctions(0)
      expect(auction.approved).to.eq(true)
      expect(auction.curatorRoyaltyBPS).to.eq(1000)
    })
  })

  describe("#cancelAuction", async () => {
    it("should revert if not creator or curator", async () => {
      await createAuction(creator)
      await expect(
        DutchAuctionDrop.connect(collector).cancelAuction(0)
      ).to.be.revertedWith("Must be creator or curator")
    })

    it("should revert if approved and auction started", async () => {

      await createAuction(creator)
      const auction = await DutchAuctionDrop.auctions(0)
      // mine to past start time
      await mineToTimestamp(auction.startTimestamp)

      await expect(
        DutchAuctionDrop.connect(creator).cancelAuction(0)
      ).to.be.revertedWith("Auction has already started")
    })

    it("should cancel auction before auction started", async () => {
      // no curator
      await createAuction(creator)
      expect(
        await DutchAuctionDrop.connect(creator).cancelAuction(0)
      ).to.emit(DutchAuctionDrop, "AuctionCanceled")

      // curator
      await createAuction(creator, {
        curator: await curator.getAddress(),
        curatorRoyaltyBPS: 1000
      })
      expect(
        await DutchAuctionDrop.connect(curator).cancelAuction(1)
      ).to.emit(DutchAuctionDrop, "AuctionCanceled")
    })

    it("should cancel if curator has not approved", async () => {
      // curator
      await createAuction(creator, {
        curator: await curator.getAddress(),
        curatorRoyaltyBPS: 1000
      })

      const curatedAuction = await DutchAuctionDrop.auctions(0)

      const stepTime = ethers.BigNumber.from(60 * 2)
      // mine to start time
      await mineToTimestamp(curatedAuction.startTimestamp.add(stepTime))

      expect(
        await DutchAuctionDrop.connect(creator).cancelAuction(0)
      ).to.emit(DutchAuctionDrop, "AuctionCanceled")
    })

    it("should emit AuctionCanceled event", async () => {
      await createAuction(creator)
      const auction = await DutchAuctionDrop.auctions(0)

      expect(
        await DutchAuctionDrop.connect(creator).cancelAuction(0)
      ).to.emit(
        DutchAuctionDrop, "AuctionCanceled"
      ).withArgs(
        0,
        StandardProject.address
      )
    })
  })

  describe("#endAuction", () => {
    it("should revert if not creator or curator", async () => {
      await createAuction(creator)
      await expect(
        DutchAuctionDrop.connect(collector).endAuction(0)
      ).to.be.revertedWith("Must be creator or curator")
    })
    it("should revert if auction is not over", async () => {
      await createAuction(creator)
      await expect(
        DutchAuctionDrop.connect(creator).endAuction(0)
      ).to.be.revertedWith("Auction is not over")
    })
    it("should end auction", async () => {
      await createAuction(creator)
      const auction = await DutchAuctionDrop.auctions(0)

      // approve DutchAuctionDrop for minting
      await StandardProject.connect(creator).setApprovedMinter(DutchAuctionDrop.address, true)

      // move to when auction starts
      await mineToTimestamp(auction.startTimestamp);

      // deposit 10 weth
      await weth.connect(collector).deposit({ value: ethers.utils.parseEther("10.0") });

      // approve auction to spend 10 WETH
      await weth.connect(collector).approve(DutchAuctionDrop.address, ethers.utils.parseEther("10.0"))

      const generatePurchases = async function * () {
        let leftToMint = (await DutchAuctionDrop.numberCanMint(0)).toNumber()
        while(leftToMint > 0){
          leftToMint--
          yield await DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))
        }
      }

      // purchase all editions
      for await ( const purchase of generatePurchases() ){
        expect(purchase).to.emit(DutchAuctionDrop, "EditionPurchased")
      }

      // move to when auction is over
      await mineToTimestamp(auction.startTimestamp.add(auction.duration));

      // End the auction
      expect(
        await DutchAuctionDrop.connect(creator).endAuction(0)
      ).to.emit(
        DutchAuctionDrop, "AuctionEnded"
      ).withArgs(
        0,
        StandardProject.address
      )
    })
  })

  describe("#setCollectorGiveAway", () => {
    let auction: any

    beforeEach(async () => {
      await createAuction(creator)
      auction = await DutchAuctionDrop.auctions(0)
    })

    it("should revert if not creator", async () => {
      await expect(
        DutchAuctionDrop.connect(collector).setCollectorGiveAway(0, true)
      ).to.be.revertedWith("Must be creator")
    })

    it("should revert if auction is not over", async () => {
      await expect(
        DutchAuctionDrop.connect(creator).setCollectorGiveAway(0, true)
      ).to.be.revertedWith("Auction is not over")
    })

    describe("", () => {
      beforeEach(async () => {
        // approve DutchAuctionDrop for minting
        await StandardProject.connect(creator).setApprovedMinter(DutchAuctionDrop.address, true)

        // deposit weth
        await weth.connect(collector).deposit({ value: ethers.utils.parseEther("10.0") })

        // approve auction to spend 10 WETH
        await weth.connect(collector).approve(DutchAuctionDrop.address, ethers.utils.parseEther("10.0"))

        // move to when auction ends
        await mineToTimestamp(auction.startTimestamp.add(auction.duration))

        // purchase an edition
        await DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](0, ethers.utils.parseEther("1.0"))
      })

      it("should open a collector give away", async () => {
        expect(
          await DutchAuctionDrop.connect(creator).setCollectorGiveAway(0, true)
        ).to.emit(
          DutchAuctionDrop, "CollectorGiveAwayUpdated"
        ).withArgs(
          0,
          auction.project.id,
          true
        )

        // purchase an edition for zero weth
        expect(
          await DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](0, 0)
        ).to.emit(DutchAuctionDrop, "EditionPurchased")
      })

      it("should close a collector give away", async () => {
        // open collector give away
        await DutchAuctionDrop.connect(creator).setCollectorGiveAway(0, true)

        // close collector give away
        expect(
          await DutchAuctionDrop.connect(creator).setCollectorGiveAway(0, false)
        ).to.emit(
          DutchAuctionDrop, "CollectorGiveAwayUpdated"
        ).withArgs(
          0,
          auction.project.id,
          false
        )

        // purchase an edition for zero weth
        await expect(
          DutchAuctionDrop.connect(collector)["purchase(uint256,uint256)"](0, 0)
        ).to.be.reverted
      })
    })
  })

  describe("Internals", () => {
    let ExposedInternals: ExposedInternals
    beforeEach(async () => {
      ExposedInternals = (await (await ethers.getContractFactory("ExposedInternals")).deploy()) as ExposedInternals;
    })

    describe("#_uint10", async () => {
      it("returns digits to the power of 10 if exponentOffset is 0", async () => {
        expect(await ExposedInternals.uint10(1, 0)).to.equal(1)
        expect(await ExposedInternals.uint10(123, 0)).to.equal(100)
        expect(await ExposedInternals.uint10(123456789, 0)).to.equal(100000000)

      })
      it("returns digits to the power of 10 if exponentOffset is larger than digits", async () => {
        expect(await ExposedInternals.uint10(1, 2)).to.equal(1)
        expect(await ExposedInternals.uint10(12345, 6)).to.equal(10000)
      })
      it("returns 0 if value is 0", async () => {
        expect(await ExposedInternals.uint10(0, 0)).to.equal(0)
        expect(await ExposedInternals.uint10(0, 1)).to.equal(0)
        expect(await ExposedInternals.uint10(0, 10)).to.equal(0)
      })
      it("returns digits minus exponent offset to the power of 10 ", async () => {
        expect(await ExposedInternals.uint10(123, 1)).to.equal(100)
        expect(await ExposedInternals.uint10(123, 2)).to.equal(10)
        expect(await ExposedInternals.uint10(123, 3)).to.equal(1)

        expect(await ExposedInternals.uint10(123456789, 9)).to.equal(1)
      })
    })
  })
})