// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.6;
import {EditionsAuction} from "../EditionsAuction.sol";


// Exposes internal EditionAuction functions for unit tests

contract ExposedInternals is EditionsAuction{
    function floor(uint256 value, uint256 unit) public pure returns (uint256) {
        return _floor(value, unit);
    }

    function uint10(uint256 value, uint256 exponentOffset) public pure returns (uint256) {
      return _unit10(value, exponentOffset);
    }

    function getDigits(uint256 value) public pure returns (uint256) {
        return _getDigits(value);
    }
}