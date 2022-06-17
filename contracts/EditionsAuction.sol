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

import {IEditionSingleMintable} from "./editions-nft/IEditionSingleMintable.sol";
import {IEditionsAuction, Edition, Implementation} from "./IEditionsAuction.sol";
import {SeededPurchaseHandler} from "./SeededPurchaseHandler.sol";
import {StandardPurchaseHandler} from "./StandardPurchaseHandler.sol";
import {Utils} from "./Utils.sol";

/**
 * @title An open dutch auction house, for initial drops of limited edition nft contracts.
 */
contract EditionsAuction is IEditionsAuction, Utils, SeededPurchaseHandler, StandardPurchaseHandler, ReentrancyGuard{
  using SafeMath for uint256;
  using Counters for Counters.Counter;

  // minimum time interval before price can drop in seconds
  uint8 minStepTime;

  bytes4 constant ERC721_interfaceId = 0x80ac58cd; // ERC-721 interface
  bytes4[2] editionsImplentaion_interfaceIds;

  // A mapping of edition contract addresses to bool, declaring if an auction is active
  mapping (address => bool) private hasActiveAuction;

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
    require(hasActiveAuction[edition.id] == false, "Auction already exists");
    require(startPrice > endPrice, "Start price must be higher then end price");

    if(curator == address(0)){
      require(curatorRoyaltyBPS == 0, "Royalties would be sent into the void");
    }

    require(duration.div(numberOfPriceDrops) >= minStepTime, "Step time must be higher than minimuim step time");

    uint256 auctionId = _auctionIdTracker.current();

    auctions[auctionId] = Auction({
      edition: edition,
      startTimestamp: startTimestamp,
      duration: duration,
      startPrice: startPrice,
      endPrice: endPrice,
      numberOfPriceDrops: numberOfPriceDrops,
      creator: creator,
      approved: false,
      curator: curator,
      curatorRoyaltyBPS: curatorRoyaltyBPS,
      auctionCurrency: auctionCurrency,
      collectorGiveAway: false
    });

    // set edition to active auction
    hasActiveAuction[edition.id] = true;

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
    return _handleStandardPurchase(auctionId, auctions[auctionId], value);
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
    return _handleSeededPurchase(auctionId, auctions[auctionId], value, seed);
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
    return _getSalePrice(auctions[auctionId]);
  }

    /**
   * @notice allows creator or curator to cancel an auction before it's started
   * @dev the caller must be creator or curator and the auction must either
   * not of started yet or not been approved by the curator
   * @param auctionId the id of the auction
   */
  function cancelAuction(uint256 auctionId) external override {
    require(
      msg.sender == auctions[auctionId].creator || msg.sender == auctions[auctionId].curator,
      "Must be creator or curator"
    );

    if(!auctions[auctionId].approved){
      _cancelAuction(auctionId);
      return;
    }

    // ensure auction has not started or not been approved
    require(
      block.timestamp < auctions[auctionId].startTimestamp,
      "Auction has already started"
    );

    _cancelAuction(auctionId);
  }

  function endAuction(uint256 auctionId) external override {
    require(
      msg.sender == auctions[auctionId].creator || msg.sender == auctions[auctionId].curator,
      "Must be creator or curator"
    );

    // check the auction has run it's full duration
    require(
      block.timestamp > auctions[auctionId].startTimestamp + auctions[auctionId].duration,
      "Auction is not over"
    );

    emit AuctionEnded(auctionId, auctions[auctionId].edition.id);
    hasActiveAuction[auctions[auctionId].edition.id] = false;
    delete auctions[auctionId];
  }

  /**
   * @dev emits auction canceled, sets has ativeauction to false and deletes the auction from storage
   * @param auctionId the id of the auction
   */
  function _cancelAuction(uint256 auctionId) internal {
    emit AuctionCanceled(auctionId, auctions[auctionId].edition.id);
    hasActiveAuction[auctions[auctionId].edition.id] = false;
    delete auctions[auctionId];
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
}