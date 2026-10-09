// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MerkleAirdrop is Ownable, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    bytes32 public merkleRoot;

    /// @dev 记录每个地址是否已领取
    mapping(address=>bool) public hasClaimed;

    event Claimed(address indexed to, uint256 amount);
    event MerkleRootUpdate(bytes32 oldRoot, bytes32 newRoot);
    event TokenWithdrawn(address indexed to, uint256 amount);


    constructor(address _token, bytes32 _merkleRoot, address initialOwner) Ownable(initialOwner) {
        require(_token != address(0), "MerkleAirdrop: zero token address");
        token = IERC20(_token);
        merkleRoot = _merkleRoot;
    }


    function claim(uint256 amount, bytes32[] calldata proof) external whenNotPaused {
        require(!hasClaimed[msg.sender], "Error: has claimed.");
        // 构造叶节点：double-hash 防止二次原像攻击
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        require(
            MerkleProof.verify(proof, merkleRoot, leaf),
            "MerkleAirdrop: invalid proof"
        );
        hasClaimed[msg.sender] = true;
        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function setMerkleRoot(bytes32 newRoot) external onlyOwner{
        emit MerkleRootUpdate(merkleRoot, newRoot);
        merkleRoot = newRoot;
    }

    function pause() external onlyOwner{
        _pause();
    }

    function unpause() external onlyOwner{
        _unpause();
    }

    function withdrawn(address to, uint256 amount) external onlyOwner(){
        require(to != address(0), "zero address");
        token.safeTransfer(to, amount);
        emit TokenWithdrawn(to, amount);
    }

    
}