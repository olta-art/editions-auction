// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.6;
import "hardhat/console.sol";
import {IEditionSingleMintable} from "../editions-nft/IEditionSingleMintable.sol";
import {ISeededEditionSingleMintable} from "../editions-nft/ISeededEditionSingleMintable.sol";
/*
  NOTE: As this contract is only ment for EditionSingleMintable type of NFT contract
  used the function below to get: 0x2fc51e5a
  but EditionSingleMintable contract supportsInterface does not return true
  */

contract Helpers {
  function getEditionsInterfaceId () external view returns (bytes4)  {
    bytes4 interfaceId = type(IEditionSingleMintable).interfaceId; // result = 0x2fc51e5a
    console.log("edtion interfaceId:");
    console.logBytes4(interfaceId);
    return interfaceId;
  }

  function getSeededEditionsInterfaceId () external view returns (bytes4)  {
    bytes4 interfaceId = type(ISeededEditionSingleMintable).interfaceId; // result = 0x26057e5e
    console.log("seeded edtion interfaceId:");
    console.logBytes4(interfaceId);
    return interfaceId;
  }
}