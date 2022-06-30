// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.6;
import {IDutchAuctionDrop} from "./IDutchAuctionDrop.sol";
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ERC721 {
  function balanceOf(address owner) external view returns (uint256);
  function royaltyInfo(uint256, uint256 _salePrice) external view returns (address receiver, uint256 royaltyAmount);
}

abstract contract Utils is IDutchAuctionDrop {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  function _isCollector(address editionId, address collector) internal view returns (bool) {
    return (ERC721(editionId).balanceOf(collector) > 0);
  }

  function _handlePurchasePayment(Auction memory auction, uint256 salePrice) internal{
    IERC20 token = IERC20(auction.auctionCurrency);

    // We must check the balance that was actually transferred to this contract,
    // as some tokens impose a transfer fee and would not actually transfer the
    // full amount to the market, resulting in potentally locked funds
    uint256 beforeBalance = token.balanceOf(address(this));
    token.safeTransferFrom(msg.sender, address(this), salePrice);
    uint256 afterBalance = token.balanceOf(address(this));
    require(beforeBalance + salePrice == afterBalance, "_handleIncomingTransfer token transfer call did not transfer expected amount");

    // get receiver for funds from project
    // tokenId can be set to 0 as all have the same royalties
    // returned royalty amount is ignored as it's the initial sale
    (address receiver, ) = ERC721(auction.project.id).royaltyInfo(0, salePrice);

    // if no curator, add payment to creator
    if(auction.curator == address(0)){
      token.safeTransfer(
        receiver,
        salePrice
      );
    }

    // else split payment between curator and creator
    else {
      uint256 curatorFee = (salePrice.mul(auction.curatorRoyaltyBPS)).div(10000);
      token.safeTransfer(
        auction.curator,
        curatorFee
      );

      uint256 creatorFee = salePrice.sub(curatorFee);
      token.safeTransfer(
        receiver,
        creatorFee
      );
    }

    return;
  }

  function _getSalePrice(Auction memory auction) internal view returns (uint256) {
    // return endPrice if auction is over
    if(block.timestamp > auction.startTimestamp.add(auction.duration)){
      return auction.endPrice;
    }

    uint256 stepTime = _calcStepTime(auction);

    // return startPrice if auction hasn't started yet
    if(block.timestamp <= auction.startTimestamp.add(stepTime)){
      return auction.startPrice;
    }

    // calculate price based of block.timestamp
    uint256 timeSinceStart = block.timestamp.sub(auction.startTimestamp);
    uint256 dropNum = _floor(timeSinceStart, stepTime).div(stepTime);

    uint256 stepPrice = _calcStepPrice(auction);

    // transalte -1 so endPrice is after auction.duration
    uint256 price = auction.startPrice.sub(stepPrice.mul(dropNum - 1));

    return _floor(
      price,
      _unit10(stepPrice, 2)
    );
  }

  function _calcStepPrice(
    Auction memory auction
  ) internal pure returns (uint256) {
      return auction.startPrice.sub(auction.endPrice).div(auction.numberOfPriceDrops);
  }

  function _calcStepTime(
    Auction memory auction
  ) internal pure returns (uint256) {
      return auction.duration.div(auction.numberOfPriceDrops);
  }

  /**
   * @dev floors number to nearest specified unit
   * @param value number to floor
   * @param unit number specififying the smallest uint to floor to
   * @return result number floored to nearest unit
  */
  function _floor(uint256 value, uint256 unit) internal pure returns (uint256){
    uint256 remainder = value.mod(unit);
    return value - remainder;
  }

  /** @dev calculates exponent from given value number of digits minus the offset
   * and returns 10 to the power of the resulting exponent
   * @param value the number of which the exponent is calculated from
   * @param exponentOffset the number to offset the resulting exponent
   * @return result 10 to the power of calculated exponent
   */
  function _unit10(uint256 value, uint256 exponentOffset) internal pure returns (uint256){
    uint256 exponent = _getDigits(value);

    if (exponent == 0) {
        return 0;
    }

    if(exponent < exponentOffset || exponentOffset == 0){
      exponentOffset = 1;
    }

    return 10**(exponent - exponentOffset);
  }

   /**
    * @dev gets number of digits of a number
    * @param value number to count digits of
    * @return digits number of digits in value
    */
  function _getDigits(uint256 value) internal pure returns (uint256) {
      if (value == 0) {
          return 0;
      }
      uint256 digits;
      while (value != 0) {
          digits++;
          value /= 10;
      }
      return digits;
  }
}