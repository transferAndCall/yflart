pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./lib/SignerRole.sol";
import "./IyYFL.sol";

/**
 * @title YFLArt
 * @notice The YFLArt NFT contract allows NFTs to be registered and bought
 * which are backed by a specific amount of YFL. NFTs can also optionally
 * charge a fee of any token that must be paid on purchase.
 */
contract YFLArt is ERC721, Ownable, SignerRole {
  using Address for address;
  using SafeERC20 for IERC20;

  IyYFL public immutable yYFL;
  uint256 public yflLocked;

  struct Registry {
    string tokenURI;
    address artist;
    address paymentToken;
    uint256 paymentAmount;
    uint256 yflAmount;
  }

  mapping(uint256 => Registry) public registry;
  // The YFL-backed balances of each NFT
  mapping(uint256 => uint256) public balances;

  event Registered(
    uint256 _tokenId,
    string _tokenURI,
    address _artist,
    address _paymentToken,
    uint256 _paymentAmount,
    uint256 _yflAmount
  );

  /**
   * @param _name The name of the NFT
   * @param _symbol The symbol of the NFT
   * @param _baseURI The base URI of the NFT
   * @param _yYFL The address of the yYFL governance contract
   */
  constructor(
    string memory _name,
    string memory _symbol,
    string memory _baseURI,
    address _yYFL
  )
    public
    ERC721(_name, _symbol)
  {
    yYFL = IyYFL(_yYFL);
    _setBaseURI(_baseURI);
  }

  /**
   * EXTERNAL FUNCTIONS
   * (SIGNER FUNCTIONS)
   */

  /**
   * @notice Called by a signer to register the pre-sale of an NFT
   * @param _tokenId The unique ID of the NFT
   * @param _v Recovery ID of the signer
   * @param _r First 32 bytes of the signature
   * @param _s Second 32 bytes of the signature
   * @param _tokenURI The token URI of the NFT
   * @param _artist The address of the artist
   * @param _paymentToken The address of the token for payment
   * @param _paymentAmount The amount of payment of the payment token
   * @param _yflAmount The amount of YFL backing the NFT
   */
  function signerRegister(
    uint256 _tokenId,
    uint8 _v,
    bytes32 _r,
    bytes32 _s,
    string memory _tokenURI,
    address _artist,
    address _paymentToken,
    uint256 _paymentAmount,
    uint256 _yflAmount
  )
    external
  {
    require(isSigner(ecrecover(
        keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32",
        keccak256(abi.encodePacked(_tokenId)))), _v, _r, _s)),
      "!signer");
    _register(_tokenId, _tokenURI, _artist, _paymentToken, _paymentAmount, _yflAmount);
  }

  /**
   * EXTERNAL FUNCTIONS
   * (OWNER FUNCTIONS)
   */

  /**
   * @notice Recovers stuck tokens from this contract. Does not allow pulling locked YFL out.
   * @param _token The token to withdraw
   * @param _receiver The address to receive the token
   * @param _amount The amount of tokens to withdraw
   */
  function recoverStuckTokens(IERC20 _token, address _receiver, uint256 _amount) external onlyOwner() {
    if (address(_token) == address(yYFL.YFL())) {
      require(_amount <= yYFL.YFL().balanceOf(address(this)).sub(yflLocked), "!_amount");
    }
    _token.transfer(_receiver, _amount);
  }

  /**
   * @notice Called by the owner to register the pre-sale of an NFT
   * @param _tokenId The unique ID of the NFT
   * @param _tokenURI The token URI of the NFT
   * @param _artist The address of the artist
   * @param _paymentToken The address of the token for payment
   * @param _paymentAmount The amount of payment of the payment token
   * @param _yflAmount The amount of YFL backing the NFT
   */
  function register(
    uint256 _tokenId,
    string memory _tokenURI,
    address _artist,
    address _paymentToken,
    uint256 _paymentAmount,
    uint256 _yflAmount
  )
    external
    onlyOwner()
  {
    _register(_tokenId, _tokenURI, _artist, _paymentToken, _paymentAmount, _yflAmount);
  }

  /**
   * @notice Called by the owner to set the baseURI of the NFT
   * @param _baseURI The base URI of the NFT
   */
  function setBaseURI(string memory _baseURI) external onlyOwner() {
    _setBaseURI(_baseURI);
  }

  /**
   * EXTERNAL FUNCTIONS
   * (USER FUNCTIONS)
   */

  /**
   * @notice Called by a user to buy a registered NFT
   * @param _tokenId The ID of the registered NFT
   */
  function buy(
    uint256 _tokenId
  )
    external
  {
    Registry memory token = registry[_tokenId];
    require(token.yflAmount > 0, "!registered");
    yYFL.YFL().safeTransferFrom(msg.sender, address(this), token.yflAmount);
    IERC20(token.paymentToken).safeTransferFrom(msg.sender, address(this), token.paymentAmount);
    uint256 serviceFee = token.paymentAmount.div(100).mul(80);
    uint256 artistFee = token.paymentAmount.sub(serviceFee);
    IERC20(token.paymentToken).safeTransfer(yYFL.treasury(), serviceFee);
    IERC20(token.paymentToken).safeTransfer(token.artist, artistFee);
    balances[_tokenId] = token.yflAmount;
    yflLocked = yflLocked.add(token.yflAmount);
    _mint(msg.sender, _tokenId);
    _setTokenURI(_tokenId, token.tokenURI);
  }

  /**
   * @notice Called by the owner of the NFT to stake the backed YFL in governance
   * @param _tokenId The ID of the registered NFT
   */
  function stake(uint256 _tokenId) external {
    require(msg.sender == ownerOf(_tokenId), "!ownerOf");
    uint256 amount = balances[_tokenId];
    require(amount > 0, "staked");
    delete balances[_tokenId];
    yflLocked = yflLocked.sub(amount);
    uint256 shares = _stake(amount);
    IERC20(yYFL).transfer(msg.sender, shares);
  }

  /**
   * @notice Called by the owner of the NFT to unstake the backed YFL from governance
   * @param _tokenId The ID of the registered NFT
   */
  function unstake(uint256 _tokenId) external {
    require(msg.sender == ownerOf(_tokenId), "!ownerOf");
    require(!isFunded(_tokenId), "funded");
    uint256 amount = registry[_tokenId].yflAmount;
    balances[_tokenId] = amount;
    yflLocked = yflLocked.add(amount);
    IERC20(yYFL).transferFrom(msg.sender, address(this), amount);
    yYFL.withdraw(amount);
    uint256 balanceDiff = yYFL.YFL().balanceOf(address(this)).sub(amount);
    if (balanceDiff > 0) {
      yYFL.YFL().safeTransfer(msg.sender, balanceDiff);
    }
  }

  /**
   * PUBLIC FUNCTIONS
   * (USER FUNCTIONS)
   */

  /**
   * @notice Can be called by any address to fund an unfunded NFT with YFL
   * @param _tokenId The ID of the registered NFT
   */
  function fund(uint256 _tokenId) public {
    require(_exists(_tokenId), "!exists");
    require(!isFunded(_tokenId), "isFunded");
    uint256 amount = registry[_tokenId].yflAmount;
    balances[_tokenId] = amount;
    yflLocked = yflLocked.add(amount);
    yYFL.YFL().safeTransferFrom(msg.sender, address(this), amount);
  }

  /**
   * VIEWS
   */

  /**
   * @notice Can be called by any address to check if a NFT is funded
   * @param _tokenId The ID of the registered NFT
   */
  function isFunded(uint256 _tokenId) public view returns (bool) {
    return registry[_tokenId].yflAmount == balances[_tokenId];
  }

  /**
   * INTERNAL FUNCTIONS
   */

  /**
   * @notice This function is called before any NFT token transfer
   * @dev Requires the NFT to be backed by YFL before transferring
   */
  function _beforeTokenTransfer(
    address _from,
    address _to,
    uint256 _tokenId
  )
    internal
    override
  {
    if (!isFunded(_tokenId)) {
      fund(_tokenId);
    }
  }

  /**
   * @notice Shared register function
   */
  function _register(
    uint256 _tokenId,
    string memory _tokenURI,
    address _artist,
    address _paymentToken,
    uint256 _paymentAmount,
    uint256 _yflAmount
  )
    internal
  {
    require(!_exists(_tokenId), "exists");
    require(registry[_tokenId].yflAmount == 0, "registered");
    require(_yflAmount > 0, "!_yflAmount");
    require(_artist != address(0), "!_artist");
    registry[_tokenId] = Registry({
      tokenURI: _tokenURI,
      artist: _artist,
      paymentToken: _paymentToken,
      paymentAmount: _paymentAmount,
      yflAmount: _yflAmount
    });
    emit Registered(_tokenId, _tokenURI, _artist, _paymentToken, _paymentAmount, _yflAmount);
  }

  /**
   * @notice Internal function to help with getting shares from yYFL
   */
  function _stake(uint256 _amount) internal returns (uint256 shares) {
    yYFL.YFL().approve(address(yYFL), 0);
    yYFL.YFL().approve(address(yYFL), _amount);
    uint256 sharesBefore = yYFL.balanceOf(address(this));
    yYFL.stake(_amount);
    uint256 sharesAfter = yYFL.balanceOf(address(this));
    shares = sharesAfter.sub(sharesBefore);
  }
}
