// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.6;
import "hardhat/console.sol";
import {IStandardProject} from "../projects/IStandard.sol";
import {ISeededProject} from "../projects/ISeeded.sol";
/*
  NOTE: As this contract is only ment for EditionSingleMintable type of NFT contract
  used the function below to get: 0x2fc51e5a
  but EditionSingleMintable contract supportsInterface does not return true
*/

contract Helpers {
  function getStandardProjectInterfaceId () external view returns (bytes4)  {
    bytes4 interfaceId = type(IStandardProject).interfaceId; // result = 0x2fc51e5a
    console.log("standard project interfaceId:");
    console.logBytes4(interfaceId);
    return interfaceId;
  }

  function getSeededProjectInterfaceId () external view returns (bytes4)  {
    bytes4 interfaceId = type(ISeededProject).interfaceId; // result = 0x26057e5e
    console.log("seeded project interfaceId:");
    console.logBytes4(interfaceId);
    return interfaceId;
  }
}