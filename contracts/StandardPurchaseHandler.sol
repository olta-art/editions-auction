// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.6;
import {IStandardProject} from "./projects/IStandard.sol";
import {IDutchAuctionDrop, Project, Implementation} from "./IDutchAuctionDrop.sol";
import {Utils} from "./Utils.sol";

abstract contract StandardPurchaseHandler is IDutchAuctionDrop, Utils {
  function _handleStandardPurchase(uint256 auctionId, Auction memory auction, uint256 value) internal returns (uint256){
    // check edtions contract is standard implementation
    require(
      auction.project.implementation == Implementation.standard,
      "Must be edition contract"
    );

    if(auction.collectorGiveAway){
      return _handleStandardCollectorGiveAway(auctionId, auction);
    }

    uint256 salePrice = _getSalePrice(auction);
    require(value >= salePrice, "Must be more or equal to sale price");

    // if not free carry out purchase
    if(salePrice != 0){
      _handlePurchasePayment(auction, salePrice);
    }

    uint256 atEditionId = _handleStandardMint(auction);

    emit EditionPurchased(
      auctionId,
      auction.project.id,
      atEditionId - 1,
      salePrice,
      msg.sender
    );

    return atEditionId;
  }

  function _handleStandardCollectorGiveAway(uint256 auctionId, Auction memory auction) internal returns (uint256){
    require(
      _isCollector(auction.project.id, msg.sender),
      "Must be a collector"
    );

    uint256 atEditionId = _handleStandardMint(auction);

    emit EditionPurchased(
      auctionId,
      auction.project.id,
      atEditionId - 1,
      0,
      msg.sender
    );

    return atEditionId;
  }

  function _handleStandardMint(Auction memory auction) internal returns (uint256) {
    address[] memory toMint = new address[](1);
    toMint[0] = msg.sender;

    // mint new nft
    return IStandardProject(auction.project.id).mintEditions(toMint);
  }
}