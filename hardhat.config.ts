import { defineConfig } from "hardhat/config";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatEthersChaiMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";

export default defineConfig({
  solidity: {
    version: "0.8.34",
  },
  plugins: [hardhatEthers,
    hardhatEthersChaiMatchers,
    hardhatMocha, ],
});
