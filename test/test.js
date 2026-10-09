
import { expect } from "chai";
import { network } from "hardhat";

describe("MyToken", function () {
    let token, owner, alice, bob, ethers;  // ← 声明在外层

    beforeEach(async () => {
        const connection = await network.create();
        ethers = connection.ethers;
        [owner, alice, bob] = await ethers.getSigners();
        const MyToken = await ethers.getContractFactory("MyToken");
        token = await MyToken.deploy("MyToken", "MTK", owner.address);
        await token.waitForDeployment();
    });

    // ─── Mint ────────────────────────────────────────────────────────
  it("owner can mint tokens", async () => {
    await token.mint(alice.address, ethers.parseEther("1000"));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("1000"));
  });

  it("not owner can not mint tokens", async() => {
    await expect(token.connect(alice).mint(bob.address, ethers.parseEther("1000"))).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });

  it("Can not mint over MAX supply amount", async() => {
    const max = await token.MAX_SUPPLY();
    await expect(token.mint(alice.address, max+1n)).to.be.revertedWith(
      "too much amount."
    );
  });

  it("can not min pause token", async() => {
    await token.pause();
    await expect(token.mint(bob.address, ethers.parseEther("1000"))).to.be.revertedWithCustomError(token, "EnforcedPause");
  });
});
