// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.6;

interface IEditionsAuction {
  struct Auction {
    address editionContract;
    uint256 startTimestamp;
    uint256 duration;
    uint256 startPrice;
    uint256 endPrice;
    uint8 numberOfPriceDrops;
    address creator;
    uint256 stepPrice;
    uint256 stepTime;
    bool approved;
    address curator;
    uint256 curatorRoyaltyBPS;
    address auctionCurrency;
  }

  event EditionPurchased(
    uint256 auctionId,
    address tokenContract,
    uint256 tokenId,
    uint256 price,
    address owner
  );

  event AuctionCreated(
    uint256 auctionId,
    address creator,
    address editionContract,
    uint256 startTimestamp,
    uint256 duration,
    uint256 startPrice,
    uint256 endPrice,
    uint8 numberOfPriceDrops,
    address curator,
    uint256 curatorRoyaltyBPS,
    address auctionCurrency
  );

  event AuctionApprovalUpdated(
    uint256 auctionId,
    address editionContract,
    bool approved
  );

  function createAuction(
    address editionContract,
    uint256 startTimestamp,
    uint256 duration,
    uint256 startPrice,
    uint256 endPrice,
    uint8 numberOfPriceDrops,
    address curator,
    uint256 curatorRoyaltyBPS,
    address auctionCurrency
  ) external returns (uint256);

  function setAuctionApproval(uint auctionId, bool approved) external;

  function getSalePrice(uint256 auctionId) external returns (uint256);

  function purchase(uint256 auctionId, uint256 amount) external payable returns (uint256);

  function numberCanMint(uint256 auctionId) external view returns (uint256);
}