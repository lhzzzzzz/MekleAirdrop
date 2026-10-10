
import { expect } from "chai";
import { network } from "hardhat";
// 官方推荐的方式（ESM）
import { MerkleTree } from 'merkletreejs'
import keccak256 from "keccak256";


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

    it("non-owner can not mint tokens", async () => {


        await expect(token.connect(alice).mint(bob.address, ethers.parseEther("1000")))
            .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("Can not mint over MAX supply amount", async () => {
        const max = await token.MAX_SUPPLY();
        await expect(token.mint(alice.address, max + 1n)).to.be.revertedWith(
            "too much amount."
        );
    });

    it("can not min pause token", async () => {
        await token.pause();
        await expect(token.mint(bob.address, ethers.parseEther("1000")))
            .to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("owner can pause", async () => {
        await token.pause();
        await expect(token.mint(bob.address, ethers.parseEther("1000")))
            .to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("non-owner can not pause", async () => {
        await expect(token.connect(alice).pause())
            .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("owner can unpause", async () => {
        await token.pause();
        await token.unpause();
    });

    it("non-owner can not unpause", async () => {
        await token.pause();
        await expect(token.connect(alice).unpause())
            .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

});


describe("MerkleAirdrop", function () {
    let token;
    let owner, alice, bob, carol;
    let amounts;
    let tree;
    let root;
    let proofs;
    let ethers;
    let airdrop;
    let stranger;

    beforeEach(async () => {

        const connection = await network.create();
        ethers = connection.ethers;
        [owner, alice, bob, carol, stranger] = await ethers.getSigners();
        const INITIAL_SUPPLY = ethers.parseEther("1000000");
        const MyToken = await ethers.getContractFactory("MyToken");
        token = await MyToken.deploy("MyToken", "MTK", owner.address);
        await token.waitForDeployment();

        token.mint(owner.address, ethers.parseEther("100000"))

        const makeLeaf = (address, amount) =>
            ethers.keccak256(
                ethers.concat([
                    ethers.keccak256(
                        ethers.AbiCoder.defaultAbiCoder().encode(
                            ["address", "uint256"],
                            [address, amount]
                        )
                    ),
                ])
            );

        // 2. 构造 Merkle 树
        amounts = {
            [alice.address]: ethers.parseEther("100"),
            [bob.address]: ethers.parseEther("200"),
            [carol.address]: ethers.parseEther("300"),
        };

        const leaves = Object.entries(amounts).map(([addr, amt]) => makeLeaf(addr, amt));
        tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
        root = tree.getHexRoot();
        proofs = {
            [alice.address]: tree.getHexProof(makeLeaf(alice.address, amounts[alice.address])),
            [bob.address]: tree.getHexProof(makeLeaf(bob.address, amounts[bob.address])),
            [carol.address]: tree.getHexProof(makeLeaf(carol.address, amounts[carol.address])),
        };
        // 3. 部署空投合约
        const Airdrop = await ethers.getContractFactory("MerkleAirdrop");
        airdrop = await Airdrop.deploy(
            await token.getAddress(),
            root,
            owner.address
        );
        await airdrop.waitForDeployment();

        // 4. 给空投合约转足够的代币
        await token.transfer(await airdrop.getAddress(), ethers.parseEther("1000"));
    });
    // ========== 部署 ==========
    describe("Deployment", function () {
        it("sets token and merkle root correctly", async function () {
            expect(await airdrop.token()).to.equal(await token.getAddress());
            expect(await airdrop.merkleRoot()).to.equal(root);
        });

        it("sets owner correctly", async function () {
            expect(await airdrop.owner()).to.equal(owner.address);
        });

        it("reverts when token address is zero", async function () {
            const Airdrop = await ethers.getContractFactory("MerkleAirdrop");
            await expect(
                Airdrop.deploy(ethers.ZeroAddress, root, owner.address)
            ).to.be.revertedWith("MerkleAirdrop: zero token address");
        });
    });

    // ========== claim ==========
    describe("claim", function () {
        it("allows a whitelisted address to claim", async () => {
            const before = await token.balanceOf(alice.address);
            await expect(airdrop.connect(alice).claim(amounts[alice.address], proofs[alice.address]))
                .to.emit(airdrop, "Claimed")
                .withArgs(alice.address, amounts[alice.address]);

            const after = await token.balanceOf(alice.address);
            expect(after - before).to.equal(amounts[alice.address]);
            expect(await airdrop.hasClaimed(alice.address)).to.equal(true);
        });

        it("reverts on double claim", async () => {
            await airdrop.connect(alice).claim(amounts[alice.address], proofs[alice.address]);

            await expect(airdrop.connect(alice).claim(amounts[alice.address], proofs[alice.address])).to.be.revertedWith(
                "Error: has claimed."
            );
        });

        it("reverts with invalid proof", async () => {
            await expect(airdrop.connect(alice).claim(amounts[alice.address], proofs[bob.address])).to.be.revertedWith(
                "MerkleAirdrop: invalid proof"
            );
        });

        it("reverts with wrong amount", async () => {
            const wrongAmount = ethers.parseEther("9999");
            await expect(
                airdrop.connect(alice).claim(wrongAmount, proofs[alice.address])
            ).to.be.revertedWith("MerkleAirdrop: invalid proof");
        });

        it("reverts when pause", async () => {
            await airdrop.pause();
            await expect(
                airdrop.connect(alice).claim(amounts[alice.address], proofs[alice.address])
            ).to.be.revertedWithCustomError(token, "EnforcedPause");
        });
    });

    // ========== pause / unpause ==========
    describe("pause / unpause", function () {
        it("owner can pause", async () => {
            await airdrop.connect(owner).pause();
            expect(await airdrop.paused()).to.equal(true);
        });

        it("owner can unpause", async () => {
            await airdrop.connect(owner).pause();
            await airdrop.connect(owner).unpause();
            expect(await airdrop.paused()).to.equal(false);
        });

        it("non-owner can not pause", async () => {
            await expect(airdrop.connect(alice).pause()
            ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });

        it("non-owner can not unpause", async () => {
            await airdrop.connect(owner).pause();
            await expect(airdrop.connect(alice).unpause()
            ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });

    });

    // ========== setMerkleRoot ==========
    describe("setMerkleRoot", function () {
        const makeLeaf = (address, amount) =>
            ethers.keccak256(
                ethers.concat([
                    ethers.keccak256(
                        ethers.AbiCoder.defaultAbiCoder().encode(
                            ["address", "uint256"],
                            [address, amount]
                        )
                    ),
                ])
            );
        it("owner can set merkle root", async () => {
            const amounts = {
                [stranger.address]: ethers.parseEther("100"),
                [alice.address]: ethers.parseEther("100"),
                [bob.address]: ethers.parseEther("200"),
                [carol.address]: ethers.parseEther("300"),
            };
            const leaves = Object.entries(amounts).map(([addr, amt]) => makeLeaf(addr, amt));
            const newTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
            await expect(airdrop.setMerkleRoot(newTree.getHexRoot()))
                .to.emit(airdrop, "MerkleRootUpdate");

            await token.mint(owner.address, ethers.parseEther("100"));
            await token.transfer(airdrop.getAddress(), ethers.parseEther("100"));
            const strangerLeaf = makeLeaf(stranger.address, ethers.parseEther("100"));
            const proof = newTree.getHexProof(strangerLeaf);
            await airdrop.connect(stranger).claim(ethers.parseEther("100"), proof);
            expect(await token.balanceOf(stranger.address)).equal(ethers.parseEther("100"));
        })

        it("non-owner can not set merkle root", async () => {
            const amounts = {
                [stranger.address]: ethers.parseEther("100"),
                [alice.address]: ethers.parseEther("100"),
                [bob.address]: ethers.parseEther("200"),
                [carol.address]: ethers.parseEther("300"),
            };
            const leaves = Object.entries(amounts).map(([addr, amt]) => makeLeaf(addr, amt));
            const newTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
            await expect(airdrop.connect(alice).setMerkleRoot(newTree.getHexRoot())).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });

    });

    describe("withdraw", function () {
        it("owner can withdraw", async () => {
            const aliceAmount = await token.balanceOf(alice.address);
            const bobAmount = await token.balanceOf(bob.address);
            const carolAmount = await token.balanceOf(carol.address);

            const before = await token.balanceOf(owner.address);

            await airdrop.withdrawn(owner.address, aliceAmount + bobAmount);

            const after = await token.balanceOf(owner.address);
            expect(after).equal(before + bobAmount + aliceAmount);

        });

        it("non-owner can not withdraw", async () => {
            const aliceAmount = await token.balanceOf(alice.address);
            const bobAmount = await token.balanceOf(bob.address);
            const carolAmount = await token.balanceOf(carol.address);
            await expect(airdrop.connect(alice).withdrawn(alice.address, aliceAmount + bobAmount + carolAmount)).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
        });
    });
});