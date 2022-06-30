// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.6;

enum Implementation {
  standard,
  seeded
}

struct Project {
  address id;
  Implementation implementation;
}

interface IEditionsAuction {
  struct Auction {
    Project project;
    uint256 startTimestamp;
    uint256 duration;
    uint256 startPrice;
    uint256 endPrice;
    uint8 numberOfPriceDrops;
    address creator;
    bool approved;
    address curator;
    uint256 curatorRoyaltyBPS;
    address auctionCurrency;
    bool collectorGiveAway;
  }

  event EditionPurchased(
    uint256 auctionId,
    address project,
    uint256 editionId,
    uint256 price,
    address owner
  );

  event SeededEditionPurchased(
    uint256 auctionId,
    address project,
    uint256 editionId,
    uint256 seed,
    uint256 price,
    address owner
  );

  event AuctionCreated(
    uint256 auctionId,
    address creator,
    Project project,
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
    address project,
    bool approved
  );

  event CollectorGiveAwayUpdated(
    uint256 auctionId,
    address project,
    bool giveAway
  );

  event AuctionCanceled(
    uint256 auctionId,
    address project
  );

  event AuctionEnded(
    uint256 auctionId,
    address project
  );

  function createAuction(
    Project memory project,
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

  function setCollectorGiveAway(uint256 auctionId, bool giveAway) external;

  function getSalePrice(uint256 auctionId) external returns (uint256);

  function purchase(uint256 auctionId, uint256 amount) external payable returns (uint256);
  function purchase(uint256 auctionId, uint256 amount, uint256 seed) external payable returns (uint256);

  function numberCanMint(uint256 auctionId) external view returns (uint256);

  function cancelAuction(uint256 auctionId) external;

  function endAuction(uint256 auctionId) external;
}