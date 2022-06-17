// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.6;
import {ISeededEditionSingleMintable, MintData} from "./editions-nft/ISeededEditionSingleMintable.sol";
import {IEditionsAuction, Edition, Implementation} from "./IEditionsAuction.sol";
import {AuctionUtils} from "./Utils.sol";

abstract contract SeededPurchaseHandler is IEditionsAuction, AuctionUtils {
  function _handleSeededPurchase(uint256 auctionId, Auction memory auction, uint256 value, uint256 seed) internal returns (uint256){
    // check edtions contract is seeded implementation
    require(
      auction.edition.implementation == Implementation.seededEdition,
      "Must be seeded edition contract"
    );

    // cache
    uint256 atEditionId;

    if(auction.collectorGiveAway){
      return  _handleSeededCollectorGiveAway(auctionId, auction, seed);
    }

    // check value is more or equal to current sale price
    uint256 salePrice = _getSalePrice(auction);
    require(value >= salePrice, "Must be more or equal to sale price");

    // if not free handle payment
    if(salePrice != 0){
      _handlePurchasePayment(auction, salePrice);
    }

    atEditionId = _handleSeededMint(auction, seed);

    emit SeededEditionPurchased(
      auctionId,
      auction.edition.id,
      atEditionId - 1,
      seed,
      salePrice,
      msg.sender
    );

    return atEditionId;
  }

  function _handleSeededCollectorGiveAway(uint256 auctionId, Auction memory auction, uint256 seed) internal returns (uint256){
    require(
      _isCollector(auction.edition.id, msg.sender),
      "Must be a collector"
    );

    uint256 atEditionId = _handleSeededMint(auction, seed);

    emit SeededEditionPurchased(
      auctionId,
      auction.edition.id,
      atEditionId - 1,
      seed,
      0,
      msg.sender
    );

    return atEditionId;
  }

  function _handleSeededMint(Auction memory auction, uint256 seed) internal returns (uint256) {
    MintData[] memory toMint = new MintData[](1);
    toMint[0] = MintData(msg.sender, seed);

    // mint new nft
    return ISeededEditionSingleMintable(auction.edition.id).mintEditions(toMint);
  }
}