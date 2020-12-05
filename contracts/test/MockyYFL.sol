pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MockyYFL is ERC20, ReentrancyGuard {
  using SafeERC20 for IERC20;
  IERC20 public immutable YFL;
  address public immutable treasury;

  constructor(
    address _yfl,
    address _treasury
  )
    public
    ERC20("YFLink Staking Share", "yYFL")
  {
    YFL = IERC20(_yfl);
    treasury = _treasury;
  }

  function stake(uint256 amount) external {
    require(amount > 0, "yYFL: ZERO");
    uint256 shares = totalSupply() == 0 ? amount : (amount.mul(totalSupply())).div(YFL.balanceOf(address(this)));
    YFL.safeTransferFrom(msg.sender, address(this), amount);
    _mint(msg.sender, shares);
    //earlyWithdrawalFeeExpiry[msg.sender] = blocksForNoWithdrawalFee.add(block.number);
  }

  function withdraw(uint256 shares) external {
    require(shares > 0, "yYFL: ZERO");
    // _checkVoteExpiry();
    // require(shares <= balanceOf(msg.sender).sub(voteLockAmount[msg.sender]), "yYFL: INSUFFICIENT_BALANCE");
    uint256 yflAmount = (YFL.balanceOf(address(this))).mul(shares).div(totalSupply());
    _burn(msg.sender, shares);
    // if (block.number < earlyWithdrawalFeeExpiry[msg.sender]) {
    //     uint256 feeAmount = yflAmount.mul(earlyWithdrawalFeePercent) / 1000000;
    //     YFL.safeTransfer(treasury, feeAmount.mul(treasuryEarlyWithdrawalFeeShare) / 1000000);
    //     yflAmount = yflAmount.sub(feeAmount);
    // }
    YFL.safeTransfer(msg.sender, yflAmount);
  }

  function getPricePerFullShare() external view returns (uint256) {
    return YFL.balanceOf(address(this)).mul(1e18).div(totalSupply());
  }

  // ERC20 functions (overridden to add modifiers)
  function transfer(address recipient, uint256 amount) public override nonReentrant returns (bool) {
      super.transfer(recipient, amount);
  }

  function approve(address spender, uint256 amount) public override nonReentrant returns (bool) {
      super.approve(spender, amount);
  }

  function transferFrom(
      address sender,
      address recipient,
      uint256 amount
  ) public override nonReentrant returns (bool) {
      super.transferFrom(sender, recipient, amount);
  }

  function increaseAllowance(address spender, uint256 addedValue) public override nonReentrant returns (bool) {
      super.increaseAllowance(spender, addedValue);
  }

  function decreaseAllowance(address spender, uint256 subtractedValue) public override nonReentrant returns (bool) {
      super.decreaseAllowance(spender, subtractedValue);
  }
}
