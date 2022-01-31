// Sketch of dutch auction drop mechanic for Zora NFT editions
// WIP do not use!

// TODO: rentrence checks (see auction house contract)
// TODO: documentation

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.6;
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {PullPayment} from "@openzeppelin/contracts/security/PullPayment.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";

import {IEditionSingleMintable} from "@zoralabs/nft-editions-contracts/contracts/IEditionSingleMintable.sol";
import {IEditionsAuction} from "./IEditionsAuction.sol";

/**
 * @title An open dutch auction house, for initial drops of limited edition nft contracts.
 */
contract EditionsAuction is IEditionsAuction, ReentrancyGuard, PullPayment {
  using SafeMath for uint256;
  using Counters for Counters.Counter;

  // minimum time interval before price can drop in seconds
  uint8 minStepTime;

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


  /**
   * Constructor
   */
  constructor() {
    minStepTime = 2 * 60; // 2 minutes
  }

  /**
   * @notice Create an auction.
   * @dev Store the auction details in the auctions mapping and emit an AuctionCreated event.
   * If there is no curator, or if the curator is the auction creator,
   * automatically approve the auction and emit an AuctionApproved event.
   * @param editionContract the contract of which NFT's will be minted
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
    address editionContract,
    uint256 startTimestamp,
    uint256 duration,
    uint256 startPrice,
    uint256 endPrice,
    uint8 numberOfPriceDrops,
    address curator,
    uint256 curatorRoyaltyBPS
  ) external override nonReentrant returns (uint256) {
    // TODO: find or get EditionSingleMintable interfaceId so we can check the contract is a match
    // require(IEditionSingleMintable(editionContract).supportsInterface(editionSingleMintableinterfaceId)
    // artist
    address creator = IEditionSingleMintable(editionContract).owner();
    require(msg.sender == creator, "Caller must be creator of editions");
    require(startPrice > endPrice, "Start price must be higher then end price");
    if(curator == address(0)){
      require(curatorRoyaltyBPS == 0, "Royalties would be sent into the void");
    }
    // The amount the price drops
    uint256 stepPrice = startPrice.sub(endPrice).div(numberOfPriceDrops);
    uint256 stepTime = duration.div(numberOfPriceDrops);
    require(stepTime >= minStepTime, "Step time must be higher than minimuim step time");

    uint256 auctionId = _auctionIdTracker.current();

    auctions[auctionId] = Auction({
      editionContract: editionContract,
      startTimestamp: startTimestamp,
      duration: duration,
      startPrice: startPrice,
      endPrice: endPrice,
      numberOfPriceDrops: numberOfPriceDrops,
      creator: creator,
      stepPrice: stepPrice,
      stepTime: stepTime,
      approved: false,
      curator: curator,
      curatorRoyaltyBPS: curatorRoyaltyBPS
    });

    _auctionIdTracker.increment();

    emit AuctionCreated(
      auctionId,
      creator,
      editionContract,
      startTimestamp,
      duration,
      startPrice,
      endPrice,
      numberOfPriceDrops,
      curator,
      curatorRoyaltyBPS
    );

    // auto approve auction
    if(curator == address(0) || curator == creator){
      _approveAuction(auctionId, true);
    }

    return auctionId;
  }

  /**
   * @notice Purchases an NFT
   * @dev mints an NFT and splits purchase fee between creator and curator
   * @param auctionId the id of the auction
   * @return the id of the NFT
   */
  function purchase(uint256 auctionId) external payable override auctionExists(auctionId) returns (uint256){
    require(auctions[auctionId].approved, "Auction has not been approved");
    require(block.timestamp >= auctions[auctionId].startTimestamp, "Auction has not started yet");
    require( _numberCanMint(auctionId) != 0, "Sold out");

    uint256 salePrice = _getSalePrice(auctionId);
    require(msg.value == salePrice, "Wrong price");

    address[] memory toMint = new address[](1);
    toMint[0] = msg.sender;

    // if free carry out purchase
    if(msg.value == 0){
      emit EditionPurchased(salePrice, msg.sender);
      return IEditionSingleMintable(auctions[auctionId].editionContract).mintEditions(toMint);
    }

    // if no curator, add payment to creator
    if(auctions[auctionId].curator == address(0)){
      _asyncTransfer(auctions[auctionId].creator, msg.value);
    }

    // else split payment between curator and creator
    else {
      uint256 curatorFee = msg.value.div(10000).mul(auctions[auctionId].curatorRoyaltyBPS);
      _asyncTransfer(auctions[auctionId].curator, curatorFee);

      uint256 creatorFee = msg.value.sub(curatorFee);
      _asyncTransfer(auctions[auctionId].creator, creatorFee);
    }

    emit EditionPurchased(salePrice, msg.sender);
    return IEditionSingleMintable(auctions[auctionId].editionContract).mintEditions(toMint);
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

  /**
   * @dev Returns the payments owed to an address.
   * @param dest The creditor's address.
   */
  function paymentsOwed(address dest) external view virtual override returns (uint256) {
      return payments(dest);
  }

  // TODO: check if need reentrency guard here: https://docs.openzeppelin.com/contracts/4.x/api/security#PullPayment-withdrawPayments-address-payable-
  /**
   * @dev withdraws the payments owed to an address.
   * @param paye the address to pay
   */
  function withdraw(address payable paye) external override {
    require(payments(paye) != 0,"account is not owed any payments");

    withdrawPayments(paye);
  }

  function _numberCanMint(uint256 auctionId) internal view returns (uint256) {
    return IEditionSingleMintable(auctions[auctionId].editionContract).numberCanMint();
  }

  function _exists(uint256 auctionId) internal view returns(bool) {
    return auctions[auctionId].creator != address(0);
  }

  function _approveAuction(uint256 auctionId, bool approved) internal {
    auctions[auctionId].approved = approved;
    emit AuctionApprovalUpdated(auctionId, auctions[auctionId].editionContract, approved);
  }

  function _getSalePrice(uint256 auctionId) internal view returns (uint256) {
    // return endPrice if auction is over
    if(block.timestamp > auctions[auctionId].startTimestamp.add(auctions[auctionId].duration)){
      return auctions[auctionId].endPrice;
    }

    // return startPrice if auction hasn't started yet
    if(block.timestamp < auctions[auctionId].startTimestamp.add(auctions[auctionId].stepTime)){
      return auctions[auctionId].startPrice;
    }

    // calculate price based of block.timestamp
    uint256 timeSinceStart = block.timestamp.sub(auctions[auctionId].startTimestamp);
    uint256 remainder = timeSinceStart.mod(auctions[auctionId].stepTime);
    uint256 dropNum = timeSinceStart.sub(remainder).div(auctions[auctionId].stepTime);

    // transalte -1 so endPrice is after auction.duration
    return auctions[auctionId].startPrice.sub(auctions[auctionId].stepPrice.mul(dropNum - 1));
  }
  // TODO: endAuction end everything if sold out remove form auctions mapping?
}