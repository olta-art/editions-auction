// Sketch of dutch auction drop mechanic for Zora NFT editions
// WIP do not use!

// TODO: rentrence checks (see auction house contract)
// TODO: documentation

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.6;
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {IERC165} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IEditionSingleMintable} from "./editions-nft/IEditionSingleMintable.sol";
import {ISeededEditionSingleMintable, MintData} from "./editions-nft/ISeededEditionSingleMintable.sol";
import {IEditionsAuction, Edition, Step, Implementation} from "./IEditionsAuction.sol";

/**
 * @title An open dutch auction house, for initial drops of limited edition nft contracts.
 */
contract EditionsAuction is IEditionsAuction, ReentrancyGuard{
  using SafeMath for uint256;
  using Counters for Counters.Counter;
  using SafeERC20 for IERC20;

  // minimum time interval before price can drop in seconds
  uint8 minStepTime;

  bytes4 constant ERC721_interfaceId = 0x80ac58cd; // ERC-721 interface
  bytes4[2] editionsImplentaion_interfaceIds;

  // A mapping of all the auctions currently running
  mapping (uint256 => IEditionsAuction.Auction) public auctions;

  Counters.Counter private _auctionIdTracker;

  /**
   * @notice Require that the specified auction exists
   */
  modifier auctionExists(uint256 auctionId) {
    require(_exists(auctionId), "Auction doesn't exist");
    _;
  }

  modifier auctionPurchaseChecks(uint256 auctionId) {
    require(auctions[auctionId].approved, "Auction has not been approved");
    require(block.timestamp >= auctions[auctionId].startTimestamp, "Auction has not started yet");
    require( _numberCanMint(auctionId) != 0, "Sold out");
    _;
  }

  /**
   * Constructor
   */
  constructor() {
    minStepTime = 2 * 60; // 2 minutes
    editionsImplentaion_interfaceIds[uint8(Implementation.edition)] = 0x2fc51e5a;
    editionsImplentaion_interfaceIds[uint8(Implementation.seededEdition)] = 0x26057e5e;
  }

  /**
   * @notice Create an auction.
   * @dev Store the auction details in the auctions mapping and emit an AuctionCreated event.
   * If there is no curator, or if the curator is the auction creator,
   * automatically approve the auction and emit an AuctionApproved event.
   * @param edition the contract address and implementation of which NFT's will be minted
   * @param startTimestamp the time the auction will start
   * @param duration the duration the auction will run for
   * @param startPrice the price in eth the auction will start at
   * @param endPrice the price in eth the auction will end at
   * @param numberOfPriceDrops the number of times the price will drop between starting and ending price
   * @param curator the address of the allocated curator
   * @param curatorRoyaltyBPS the royalty the curator will recieve per purchase in basis points
   * @return auction id
   */
  function createAuction(
    Edition memory edition,
    uint256 startTimestamp,
    uint256 duration,
    uint256 startPrice,
    uint256 endPrice,
    uint8 numberOfPriceDrops,
    address curator,
    uint256 curatorRoyaltyBPS,
    address auctionCurrency
  ) external override nonReentrant returns (uint256) {
    require(
      IERC165(edition.id).supportsInterface(ERC721_interfaceId),
      "Doesn't support NFT interface"
    );

    require(
      IERC165(edition.id).supportsInterface(
        editionsImplentaion_interfaceIds[uint8(edition.implementation)]
      ),
      "Doesn't support chosen Editions interface"
    );

    // TODO: require(IEditionSingleMintable(editionContract).numberCanMint() != type(uint256).max, "Editions must be a limited number")
    // TODO: require this contract is approved ??
    // TODO: require curator rolaty not too high

    address creator = IEditionSingleMintable(edition.id).owner();
    require(msg.sender == creator, "Caller must be creator of editions");
    require(startPrice > endPrice, "Start price must be higher then end price");
    if(curator == address(0)){
      require(curatorRoyaltyBPS == 0, "Royalties would be sent into the void");
    }

    // NOTE: calc with function to get past CompilerError: Stack too deep,
    Step memory step = _calcStep(
      duration,
      startPrice,
      endPrice,
      numberOfPriceDrops
    );

    require(step.time >= minStepTime, "Step time must be higher than minimuim step time");

    uint256 auctionId = _auctionIdTracker.current();

    auctions[auctionId] = Auction({
      edition: edition,
      startTimestamp: startTimestamp,
      duration: duration,
      startPrice: startPrice,
      endPrice: endPrice,
      numberOfPriceDrops: numberOfPriceDrops,
      creator: creator,
      step: step,
      approved: false,
      curator: curator,
      curatorRoyaltyBPS: curatorRoyaltyBPS,
      auctionCurrency: auctionCurrency
    });

    _auctionIdTracker.increment();

    emit AuctionCreated(
      auctionId,
      creator,
      edition,
      startTimestamp,
      duration,
      startPrice,
      endPrice,
      numberOfPriceDrops,
      curator,
      curatorRoyaltyBPS,
      auctionCurrency
    );

    // auto approve auction
    if(curator == address(0) || curator == creator){
      _approveAuction(auctionId, true);
    }

    return auctionId;
  }



  function _calcStep (
    uint256 duration,
    uint256 startPrice,
    uint256 endPrice,
    uint8 numberOfPriceDrops
  ) internal pure returns (Step memory) {

    Step memory step;

    step.price = startPrice.sub(endPrice).div(numberOfPriceDrops);
    step.time = duration.div(numberOfPriceDrops);

    return step;
  }

  /**
   * @dev mints a NFT and splits purchase fee between creator and curator
   * @param auctionId the id of the auction
   * @param value the amount paid in erc-20 tokens to mint
   * @return id of the NFT
   */
  function purchase(
    uint256 auctionId,
    uint256 value
  ) external payable override
    auctionExists(auctionId)
    auctionPurchaseChecks(auctionId)
    returns (uint256)
  {
    // check edtions contract is standard implementation
    require(
      auctions[auctionId].edition.implementation == Implementation.edition,
      "Must be edition contract"
    );

    uint256 salePrice = _getSalePrice(auctionId);
    require(value >= salePrice, "Must be more or equal to sale price");

    // if not free carry out purchase
    if(salePrice != 0){
      _handlePurchasePayment(auctionId, salePrice);
    }

    address[] memory toMint = new address[](1);
    toMint[0] = msg.sender;

    // mint new nft
    uint256 atEditionId = IEditionSingleMintable(auctions[auctionId].edition.id).mintEditions(toMint);

    // subtract 1 to get the id of the token minted
    uint256 tokenId = atEditionId.sub(1);

    emit EditionPurchased(
      auctionId,
      auctions[auctionId].edition.id,
      tokenId,
      salePrice,
      msg.sender
    );

    return atEditionId;
  }

  /**
   * @dev mints a seeded NFT and splits purchase fee between creator and curator
   * @param auctionId the id of the auction
   * @param value the amount paid in erc-20 tokens to mint
   * @param seed the seed of the NFT to mint
   * @return id of the NFT
   */
  function purchase(
    uint256 auctionId,
    uint256 value,
    uint256 seed
  ) external payable override
    auctionExists(auctionId)
    auctionPurchaseChecks(auctionId)
    returns (uint256)
  {
    // check edtions contract is seeded implementation
    require(
      auctions[auctionId].edition.implementation == Implementation.seededEdition,
      "Must be seeded edition contract"
    );

    // check value is more or equal to current sale price
    uint256 salePrice = _getSalePrice(auctionId);
    require(value >= salePrice, "Must be more or equal to sale price");

    // if not free handle payment
    if(salePrice != 0){
      _handlePurchasePayment(auctionId, salePrice);
    }

    MintData[] memory toMint = new MintData[](1);
    toMint[0] = MintData(msg.sender, seed);

    // mint new nft
    uint256 atEditionId = ISeededEditionSingleMintable(auctions[auctionId].edition.id).mintEditions(toMint);

    // subtract 1 to get the id of the token minted
    uint256 tokenId = atEditionId.sub(1);

    emit SeededEditionPurchased(
      auctionId,
      auctions[auctionId].edition.id,
      tokenId,
      seed,
      salePrice,
      msg.sender
    );

    return atEditionId;
  }

  function numberCanMint(uint256 auctionId) external view override returns (uint256) {
    return _numberCanMint(auctionId);
  }

  /**
   * @notice allows curator to approve auction
   * @dev sets auction approved to approval and emits an AuctionApprovalUpdated event
   * @param auctionId the id of the auction
   * @param approved the curators approval decision
   */
  function setAuctionApproval(uint256 auctionId, bool approved) external override auctionExists(auctionId) {
    require(msg.sender == auctions[auctionId].curator, "must be curator");
    require(block.timestamp < auctions[auctionId].startTimestamp, "Auction has already started");
    // TODO: see if auction should be cancled/ended if approval is set to false?
    _approveAuction(auctionId, approved);
  }

  /**
   * @notice gets the current sale price of an auction
   * @dev calculates the price based on the block.timestamp
   * @param auctionId the id of the auction
   * @return price in wei
   */
  function getSalePrice(uint256 auctionId) external view override returns (uint256) {
    return _getSalePrice(auctionId);
  }

  function _handlePurchasePayment(uint256 auctionId, uint256 salePrice) internal{
    IERC20 token = IERC20(auctions[auctionId].auctionCurrency);

    // NOTE: msg.sender would need to approve this contract with currency before making a purchase
    // If intergrating with zora v3 the market would hold the funds and handle royalties differently.
    // through royalties finders, and protocal fees
    // TODO: respect royalties on NFT contract (v3 intergration could solve this)

    // NOTE: modified from v3 for now. A full intergration would be better if we go that route
    // https://github.com/ourzora/v3/blob/main/contracts/common/IncomingTransferSupport/V1/IncomingTransferSupportV1.sol

    // We must check the balance that was actually transferred to this contract,
    // as some tokens impose a transfer fee and would not actually transfer the
    // full amount to the market, resulting in potentally locked funds
    uint256 beforeBalance = token.balanceOf(address(this));
    token.safeTransferFrom(msg.sender, address(this), salePrice);
    uint256 afterBalance = token.balanceOf(address(this));
    require(beforeBalance + salePrice == afterBalance, "_handleIncomingTransfer token transfer call did not transfer expected amount");

    // if no curator, add payment to creator
    if(auctions[auctionId].curator == address(0)){
      token.safeTransfer(
        auctions[auctionId].creator,
        salePrice
      );
    }

    // else split payment between curator and creator
    else {
      uint256 curatorFee = (salePrice.mul(auctions[auctionId].curatorRoyaltyBPS)).div(10000);
      token.safeTransfer(
        auctions[auctionId].curator,
        curatorFee
      );

      uint256 creatorFee = salePrice.sub(curatorFee);
      token.safeTransfer(
        auctions[auctionId].creator,
        creatorFee
      );
    }

    return;
  }

  function _numberCanMint(uint256 auctionId) internal view returns (uint256) {
    return IEditionSingleMintable(auctions[auctionId].edition.id).numberCanMint();
  }

  function _exists(uint256 auctionId) internal view returns(bool) {
    return auctions[auctionId].creator != address(0);
  }

  function _approveAuction(uint256 auctionId, bool approved) internal {
    auctions[auctionId].approved = approved;
    emit AuctionApprovalUpdated(auctionId, auctions[auctionId].edition.id, approved);
  }

  function _getSalePrice(uint256 auctionId) internal view returns (uint256) {
    // return endPrice if auction is over
    if(block.timestamp > auctions[auctionId].startTimestamp.add(auctions[auctionId].duration)){
      return auctions[auctionId].endPrice;
    }

    // return startPrice if auction hasn't started yet
    if(block.timestamp < auctions[auctionId].startTimestamp.add(auctions[auctionId].step.time)){
      return auctions[auctionId].startPrice;
    }

    // calculate price based of block.timestamp
    uint256 timeSinceStart = block.timestamp.sub(auctions[auctionId].startTimestamp);
    uint256 remainder = timeSinceStart.mod(auctions[auctionId].step.time);
    uint256 dropNum = timeSinceStart.sub(remainder).div(auctions[auctionId].step.time);

    // transalte -1 so endPrice is after auction.duration
    return auctions[auctionId].startPrice.sub(auctions[auctionId].step.price.mul(dropNum - 1));
  }
  // TODO: endAuction end everything if sold out remove form auctions mapping?
}