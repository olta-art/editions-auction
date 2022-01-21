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

contract EditionsAuction is IEditionsAuction, ReentrancyGuard, PullPayment {
  using SafeMath for uint256;
  using Counters for Counters.Counter;

  // Curator royalties on each sale
  uint256 curatorRoyaltyBPS;

  // Curator address
  address curator;

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

  constructor(address _curator, uint256 _curatorRoyaltyBPS) {
    // TODO: if curator 0x or curatorRoyaltyBPS 0 don't apply royalties
    curator = _curator;
    curatorRoyaltyBPS = _curatorRoyaltyBPS;
    minStepTime = 2 * 60; // 2 minutes
  }

  function createAuction (
    address editionContract,
    uint256 startTimestamp,
    uint256 duration,
    uint256 startPrice,
    uint256 endPrice,
    uint8 numberOfPriceDrops
  ) public override nonReentrant returns (uint256) {
    // TODO: find or get EditionSingleMintable interfaceId so we can check the contract is a match
    // require(IEditionSingleMintable(editionContract).supportsInterface(editionSingleMintableinterfaceId)
    // artist
    address creator = IEditionSingleMintable(editionContract).owner();
    require(msg.sender == creator, "Caller must be creator of editions");
    require(startPrice > endPrice, "Start price must be higher then end price");

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
      approved: false // olta will need to approve first
    });

    _auctionIdTracker.increment();

    emit AuctionCreated(auctionId, creator, editionContract, startTimestamp, duration, startPrice, endPrice, numberOfPriceDrops);

    return auctionId;
  }

  // Allows curator to approve auctions first
  function setAuctionApproval(uint256 auctionId, bool approved) external override auctionExists(auctionId) {
    require(msg.sender == curator, "must be curator");
    require(block.timestamp < auctions[auctionId].startTimestamp, "Auction has already started");
  }

  function purchase(uint256 auctionId) external payable override auctionExists(auctionId) returns (uint256){
    require(block.timestamp >= auctions[auctionId].startTimestamp, "Auction has not started yet");
    // TODO: auction must be approved
    require( _numberCanMint(auctionId) != 0, "Sold out");
    uint256 salePrice = _getSalePrice(auctionId);
    require(msg.value == salePrice, "Wrong price");

    address[] memory toMint = new address[](1);
    toMint[0] = msg.sender;

    // ensure payment is stored in escrow
    if(msg.value != 0){
      uint256 curatorFee = msg.value.div(10000).mul(curatorRoyaltyBPS);
      _asyncTransfer(curator, curatorFee);

      uint256 creatorFee = msg.value.sub(curatorFee);
      _asyncTransfer(auctions[auctionId].creator, creatorFee);
    }

    emit EditionPurchased(salePrice, msg.sender);
    return IEditionSingleMintable(auctions[auctionId].editionContract).mintEditions(toMint);
  }

  function numberCanMint(uint256 auctionId) external view override returns (uint256) {
    return _numberCanMint(auctionId);
  }

  function _numberCanMint(uint256 auctionId) internal view returns (uint256) {
    return IEditionSingleMintable(auctions[auctionId].editionContract).numberCanMint();
  }

  function _exists(uint256 auctionId) internal view returns(bool) {
    return auctions[auctionId].creator != address(0);
  }

  function getSalePrice(uint256 auctionId) external view override returns (uint256) {
    return _getSalePrice(auctionId);
  }

  /**
  * @dev returns sale price based on block.timestamp
  */
  function _getSalePrice(uint256 auctionId) internal view returns (uint256) {
    // return ending price if auction is over
    if(block.timestamp > auctions[auctionId].startTimestamp.add(auctions[auctionId].duration)){
      return auctions[auctionId].endPrice;
    }

    // return starting price if auction hasn't dropped yet
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

  /**
  * @dev Returns the payments owed to an address.
  * @param dest The creditor's address.
  */
  function paymentsOwed(address dest) external view virtual override returns (uint256) {
      return payments(dest);
  }

  // TODO: check if need reentrency guard here: https://docs.openzeppelin.com/contracts/4.x/api/security#PullPayment-withdrawPayments-address-payable-
  function withdraw(address payable paye) external override {
    require(payments(paye) != 0,"account is not owed any payments");

    withdrawPayments(paye);
  }

  // TODO: endAuction end everything if sold out remove form auctions mapping?
}