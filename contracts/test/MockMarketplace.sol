pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockMarketplace {
  IERC721 public immutable token;

  mapping(uint256 => address) public sellers;

  constructor(
    address _token
  )
    public
  {
    token = IERC721(_token);
  }

  function deposit(uint256 _tokenId) external {
    sellers[_tokenId] = msg.sender;
    token.transferFrom(msg.sender, address(this), _tokenId);
  }

  function purchase(uint256 _tokenId) external {
    require(sellers[_tokenId] != address(0), "!_tokenId");
    delete sellers[_tokenId];
    token.transferFrom(address(this), msg.sender, _tokenId);
  }
}
