// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, ERC20Pausable, Ownable{
    uint256 public constant MAX_SUPPLY = 100_000_000 * 1e18; // 1 亿枚上限

    constructor(string memory name, string memory symbol, address owner) ERC20(name, symbol) Ownable(owner){

    }

    function mint(address to, uint256 amount) external onlyOwner{
        require(amount + totalSupply() <= MAX_SUPPLY, "too much amount.");
        _mint(to, amount);
    }

    function pause() external onlyOwner(){
        _pause();
    }

    function unpause() external onlyOwner(){
        _unpause();
    }

    // ─── 内部重写 ─────────────────────────────────────────────────

    /// @dev ERC20 + ERC20Pausable 多重继承需要手动指定 _update
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, value);
    }

}