import { expect } from 'chai'
import { ethers } from 'hardhat'
import { BigNumber, utils } from 'ethers'

import { USDC, DAI, WBTC, SUSHI, WETH, ZERO } from '../scripts/address'
import { WBTC_USD_ORACLE, SUSHI_USD_ORACLE, WETH_USD_ORACLE, ETH_USD_ORACLE, USDC_USD_ORACLE, DAI_USD_ORACLE } from '../scripts/address'
import { erc20ABI } from '../scripts/abi/erc20'
import { create2ABI } from '../scripts/abi/create2'
import { bytecode } from '../artifacts/contracts/ConditionalWager.sol/ConditionalWager.json'

import { ConditionalWager } from '../typechain/ConditionalWager'
import { ConditionalWager__factory } from '../typechain/factories/ConditionalWager__factory'
import hre from "hardhat"
import log from 'ololog'

// List of variables that are reused throughout the tests
const wethWhale = "0xa75ede99f376dd47f3993bc77037f61b5737c6ea"
const ethWhale = '0x73BCEb1Cd57C711feaC4224D062b0F6ff338501e'
const usdcWhale = '0xfc7470c14baef608dc316f5702790eefee9cc258'
const altaDeployer = "0xe3F641AD659249a020e2aF63c3f9aBd6cfFb668b"
const create2Address = "0x2D8CFd32dC4FBdABdB53fe912057b80A7a918020"
let Wager: ConditionalWager__factory
let wager: ConditionalWager
let deployer: any
let signers: any
let signer: any
let wethContract: any
let eth_address = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"

const p2m = "0x0000000000000000000000000000000000000000"
let duration = "172800" // 2 days
let amountUserA = ethers.utils.parseEther("1")
let amountUserB = ethers.utils.parseEther("1")
let userA_sushi_price = "5000000" // $.05
let userB_sushi_price = "3000000" // $.03
let userA_wbtc_price = "4000000000000" // $40,000
let userB_wbtc_price = "2500000000000" // $25,000

function numberToUint256(value: any) {
    const hex = value.toString(16)
    return `0x${"0".repeat(64 - hex.length)}${hex}`
}

describe("ConditionalWager", async () => {
    before(async () => {
        signers = await ethers.getSigners()
        deployer = signers[0]
        wethContract = new ethers.Contract(WETH, JSON.parse(erc20ABI), deployer)
    })

    beforeEach(async function () {
        Wager = (await ethers.getContractFactory("ConditionalWager")) as ConditionalWager__factory
        wager = await Wager.deploy()
        await wager.init(altaDeployer, deployer.address)
        await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
    })

    describe("Contract Ownership", async () => {
        it("Should make the external account the owner of the contract", async() => {
            const create2 = new ethers.Contract(create2Address, create2ABI, deployer)
            let salt = 0
            let x = utils.keccak256(
                `0x${["ff", create2Address, numberToUint256(salt), ethers.utils.keccak256(bytecode)]
                    .map((x) => x.replace(/0x/, ""))
                    .join("")}`
            )
        
            let address = `0x${x.slice(-40)}`.toLowerCase()
            await create2.deploy(bytecode, numberToUint256(salt))
            Wager = (await ethers.getContractFactory("ConditionalWager")) as ConditionalWager__factory
            wager = Wager.attach(address)

            expect(await wager.owner()).to.equal(deployer.address)
        })

        it("Should transfer ownership", async() => {
            await expect(wager.transferOwnership(altaDeployer)).to.not.be.reverted
            expect(await wager.owner()).to.equal(altaDeployer)
        })
    })

    describe("Token Updates", async () => {
        it("Should add then remove USDC as a payment token", async function () {
            await wager.updatePaymentToken(USDC, USDC_USD_ORACLE, true)
            expect(await wager.paymentTokens(USDC)).to.be.true
            await wager.updatePaymentToken(USDC, USDC_USD_ORACLE, false)
            expect(await wager.paymentTokens(USDC)).to.be.false
        })

        it("Should add then remove [DAI, USDC] as a payment token", async function () {
            await wager.updatePaymentTokens([DAI, USDC], [DAI_USD_ORACLE, USDC_USD_ORACLE], true)
            expect(await wager.paymentTokens(DAI)).to.be.true
            expect(await wager.paymentTokens(USDC)).to.be.true
            await wager.updatePaymentTokens([DAI, USDC], [DAI_USD_ORACLE, USDC_USD_ORACLE], false)
            expect(await wager.paymentTokens(DAI)).to.be.false
            expect(await wager.paymentTokens(USDC)).to.be.false
        })

        it("Should add then remove WBTC as a wager token", async function () {
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            expect(await wager.wagerTokens(WBTC)).to.be.true
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, false)
            expect(await wager.wagerTokens(WBTC)).to.be.false
        })

        it("Should add then remove [SUSHI, WBTC] as a wager token", async function () {
            await wager.updateWagerTokens([SUSHI, WBTC], [SUSHI_USD_ORACLE, WBTC_USD_ORACLE], true)
            expect(await wager.wagerTokens(SUSHI)).to.be.true
            expect(await wager.wagerTokens(WBTC)).to.be.true
            await wager.updateWagerTokens([SUSHI, WBTC], [SUSHI_USD_ORACLE, WBTC_USD_ORACLE], false)
            expect(await wager.wagerTokens(SUSHI)).to.be.false
            expect(await wager.wagerTokens(WBTC)).to.be.false
        })
    })

    describe("Kill Switch", async () => {
        it("Should kill contracts with WBTC as the wagerToken", async function () {
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)
            
            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB 
                duration,{ // duration
                value: amountUserA
            })

            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            await wager.createWager(
                p2m, // userB
                WBTC, // wagerToken
                eth_address, // paymentToken
                userA_wbtc_price, // wagerPriceA
                userB_wbtc_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration,{ // duration
                value: amountUserA
            })

            await wager.connect(signers[1]).fillWager(1, {value: amountUserB})

            let wbtcWager = "1"
            await wager.markTokenRefundable(WBTC)
            expect((await wager.refundableTimestamp(WBTC)).refundable).to.be.gt(0)
            await expect(wager.redeem(wbtcWager)).to.not.be.reverted
        })

        it("Should refund wager after marking the token refundable", async function () {
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, { // duration
                value: amountUserA
            })

            await wager.createWager(
                p2m, // userB
                WBTC, // wagerToken
                eth_address, // paymentToken
                userA_wbtc_price, // wagerPriceA
                userB_wbtc_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, { // duration
                value: amountUserA
            })

            await wager.connect(signers[1]).fillWager(1, {value: amountUserB})

            let wbtcWager = "1"
            await wager.markTokenRefundable(WBTC)
            expect(await (await wager.refundableTimestamp(WBTC)).refundable).to.be.gt(0)
            await expect(wager.redeem(wbtcWager)).to.not.be.reverted
        })

        it("Should refund wager even after completion", async function () {
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, { // duration
                value: amountUserA
            })

            await wager.createWager(
                p2m, // userB
                WBTC, // wagerToken
                eth_address, // paymentToken
                userA_wbtc_price, // wagerPriceA
                userB_wbtc_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, { // duration
                value: amountUserA
            })

            let wagerId = "1"

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await wager.connect(signer).fillWager(wagerId, {
                value: amountUserB
            })

            await wager.markTokenRefundable(WBTC)
            expect(await (await wager.refundableTimestamp(WBTC)).refundable).to.be.gt(0)

            let blockTime = 0xD2F00 // 864000 seconds = 10 days
            await hre.network.provider.request({
                method: "evm_increaseTime",
                params: [blockTime] // 864000 seconds = 10 days
            })

            await hre.network.provider.request({
                method: "hardhat_mine",
                params: ["0x1"] // 1 block
            })

            await expect(wager.redeem(wagerId)).to.not.be.reverted
        })
    })

    describe("Wager Creation", async () => {
        it("Should create a wager on SUSHI paid with ETH", async function () {
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, { // duration
                value: amountUserA
            })

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)
            expect(wagerData).to.be.not.null
            expect(wagerData.userA).to.equal(deployer.address)
            expect(wagerData.userB).to.equal(p2m)
            expect(wagerData.wagerToken).to.equal(SUSHI)
            expect(wagerData.paymentToken).to.equal(eth_address)
            expect(wagerData.wagerPriceA).to.equal(userA_sushi_price)
            expect(wagerData.wagerPriceB).to.equal(userB_sushi_price)
            expect(wagerData.amountUserA).to.equal(amountUserA.mul(995).div(1000))
            expect(wagerData.amountUserB).to.equal(amountUserB)
            expect(wagerData.duration).to.equal(duration)
        })

        it("Should create a wager on WBTC paid with WETH", async function () {
            await wager.updatePaymentToken(WETH, WETH_USD_ORACLE, true)
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            let wethContract = new ethers.Contract(WETH, JSON.parse(erc20ABI), deployer)
            await wethContract.approve(wager.address, amountUserA)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)
            await wethContract.connect(signer).transfer(deployer.address, amountUserA)

            let userA_wbtc_price = "4000000000000" // $40,000
            let userB_wbtc_price = "2500000000000" // $25,000
            let duration = "1728000"

            await wager.createWager(
                p2m, // userB
                WBTC, // wagerToken
                WETH, // paymentToken
                userA_wbtc_price, // wagerPriceA
                userB_wbtc_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, { // duration
                value: amountUserA // msg.value
            })

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)
            expect(wagerData).to.be.not.null
            expect(wagerData.userA).to.equal(deployer.address)
            expect(wagerData.userB).to.equal(p2m)
            expect(wagerData.wagerToken).to.equal(WBTC)
            expect(wagerData.paymentToken).to.equal(WETH)
            expect(wagerData.wagerPriceA).to.equal(userA_wbtc_price)
            expect(wagerData.wagerPriceB).to.equal(userB_wbtc_price)
            expect(wagerData.amountUserA).to.equal(amountUserA.mul(995).div(1000))
            expect(wagerData.amountUserB).to.equal(amountUserB)
            expect(wagerData.duration).to.equal(duration)
        })

        it("Should revert if wager amount is less than $10", async function () {
            await wager.updatePaymentToken(USDC, USDC_USD_ORACLE, true)
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            
            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [usdcWhale],
            })
            signer = await ethers.getSigner(usdcWhale)

            let amountUsdc = "1000000" // 1 USDC
            
            let usdcContract = new ethers.Contract(USDC, JSON.parse(erc20ABI), deployer)
            await usdcContract.connect(signer).approve(wager.address, amountUsdc)

            let wbtcPriceA = "3500"
            let wbtcPriceB = "2500"
            let duration = "1728000"

            await expect(wager.connect(signer).createWager(
                p2m, // userB
                WBTC, // wagerToken
                USDC, // paymentToken
                wbtcPriceA, // wagerPriceA
                wbtcPriceB, // wagerPriceB
                amountUsdc, // amountUserA
                amountUsdc, // amountUserB
                duration //duration
            )).to.be.revertedWith("Wager amount less than $10")
        })

        it("Should revert if duration is less than 1 day", async function () {
            await wager.updatePaymentToken(USDC, USDC_USD_ORACLE, true)
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            let usdcContract = new ethers.Contract(USDC, JSON.parse(erc20ABI), deployer)
            let amountUsdc = "10000000000" // 10000 USDC
            await usdcContract.approve(wager.address, amountUsdc)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [usdcWhale],
            })
            signer = await ethers.getSigner(usdcWhale)
            
            await usdcContract.connect(signer).transfer(deployer.address, amountUsdc)

            let wbtcPriceA = "3500"
            let wbtcPriceB = "2500"
            let duration = "1000"

            await expect(wager.createWager(
                p2m, // userB
                WBTC, // wagerToken
                USDC, // paymentToken
                wbtcPriceA, // wagerPriceA
                wbtcPriceB, // wagerPriceB
                amountUsdc, // amountUserA
                amountUsdc, // amountUserB
                duration //duration
            )).to.be.revertedWith("Wager duration must be at least one 1 day")
        })

        it("Should not revert if duration is 1 day", async function () {
            await wager.updatePaymentToken(USDC, USDC_USD_ORACLE, true)
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            let usdcContract = new ethers.Contract(USDC, JSON.parse(erc20ABI), deployer)
            let amountUsdc = "10000000000" // 10000 USDC
            await usdcContract.approve(wager.address, amountUsdc)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [usdcWhale],
            })
            signer = await ethers.getSigner(usdcWhale)
            
            await usdcContract.connect(signer).transfer(deployer.address, amountUsdc)

            let wbtcPriceA = "3500"
            let wbtcPriceB = "2500"
            let duration = "86400"

            await expect(wager.createWager(
                p2m, // userB
                WBTC, // wagerToken
                USDC, // paymentToken
                wbtcPriceA, // wagerPriceA
                wbtcPriceB, // wagerPriceB
                amountUsdc, // amountUserA
                amountUsdc, // amountUserB
                duration //duration
            )).to.be.not.reverted
        })

        it("Should emit a WagerCreated event", async function () {
            await wager.updatePaymentToken(WETH, WETH_USD_ORACLE, true)
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            let wethContract = new ethers.Contract(WETH, JSON.parse(erc20ABI), deployer)
            await wethContract.approve(wager.address, amountUserA)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)
            await wethContract.connect(signer).transfer(deployer.address, ethers.utils.parseEther("100.0"))

            const userA_wbtc_price = "35000"
            const userB_wbtc_price = "25000"
            let duration = "1728000"

            expect(await wager.createWager(
                p2m, // userB
                WBTC, // wagerToken
                WETH, // paymentToken
                userA_wbtc_price, // wagerPriceA
                userB_wbtc_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration //duration
            )).to.emit(wager, "WagerCreated").withArgs("0", deployer.address, p2m, WBTC, userA_wbtc_price, userB_wbtc_price)

        })

        it("Should correctly transfer ETH", async function () {
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            let wethContract = new ethers.Contract(WETH, JSON.parse(erc20ABI), deployer)
            await wethContract.approve(wager.address, ethers.utils.parseEther("0.1"))

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)
            await wethContract.connect(signer).transfer(deployer.address, ethers.utils.parseEther("100.0"))

            const userA_wbtc_price = "3500"
            const userB_wbtc_price = "25000"
            const duration = "1728000"

            const provider = hre.waffle.provider
            let ethBalanceBefore = await provider.getBalance(deployer.address)
            log.yellow("ethBalanceBefore: " + ethers.utils.formatEther(ethBalanceBefore))

            let gasPrice = ethers.utils.parseUnits("50", "gwei")

            // let gas = await wager.estimateGas.createWager(
            //     p2m, // userB
            //     WBTC, // wagerToken
            //     eth_address, // paymentToken
            //     userA_wbtc_price, // wagerPriceA
            //     userB_wbtc_price, // wagerPriceB
            //     amountUserA, // amountUserA
            //     amountUserB, // amountUserB
            //     duration, //duration
            //     {
            //         value: amountUserA,
            //         gasPrice: gasPrice
            //     }
            // )
            // log.yellow("gas:", gas.toString())
            let gas = BigNumber.from("316689")

            await wager.createWager(
                p2m, // userB
                WBTC, // wagerToken
                eth_address, // paymentToken
                userA_wbtc_price, // wagerPriceA
                userB_wbtc_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, //duration
                {
                    value: amountUserA,
                    gasPrice: gasPrice
                }
            )
            
            let gasFee = BigNumber.from("16050950000000000")
            // let gasFee = gas.mul(gasPrice)
            // log.yellow("gas:", gas.toString())
            // log.yellow("gasPrice:", gasPrice.toString())
            // log.yellow("gasFee:", ethers.utils.formatEther(gasFee))

            let ethBalanceAfter = await provider.getBalance(deployer.address)
            // log.yellow("ethBalanceAfter:", ethers.utils.formatEther(ethBalanceAfter))

            let balanceDifference = ethBalanceBefore.sub(ethBalanceAfter)
            // log.yellow("balanceDifference:", ethers.utils.formatEther(balanceDifference))
            expect(balanceDifference.gt(amountUserA)).to.be.true
            expect(balanceDifference).to.be.equal(gasFee.add(amountUserA))
        })

        it("Should correctly transfer tokens", async function () {
            await wager.updatePaymentToken(WETH, WETH_USD_ORACLE, true)
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            let wethContract = new ethers.Contract(WETH, JSON.parse(erc20ABI), deployer)
            await wethContract.approve(wager.address, amountUserA)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)
            await wethContract.connect(signer).transfer(deployer.address, amountUserA)

            const userA_wbtc_price = "3500"
            const userB_wbtc_price = "25000"
            const duration = "1728000"

            let wethBalanceBefore = await wethContract.balanceOf(deployer.address)

            await wager.createWager(
                p2m, // userB
                WBTC, // wagerToken
                WETH, // paymentToken
                userA_wbtc_price, // wagerPriceA
                userB_wbtc_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration //duration
            )

            let wethBalanceAfter = await wethContract.balanceOf(deployer.address)
            expect(wethBalanceBefore.sub(wethBalanceAfter)).to.equal(amountUserA)
        })

        it("Should return all wagers", async function () {
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, { // duration
                value: amountUserA
            })

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, { // duration
                value: amountUserA
            })

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, { // duration
                value: amountUserA
            })

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, { // duration
                value: amountUserA
            })

            let wagers = await wager.getAllWagers();
            expect(wagers.length).to.equal(4)
        })
    })

    describe("Fill Wager", async () => {
        it("Should fill a p2p wager on SUSHI paid with ETH", async function () {
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            const userB = wethWhale

            await wager.createWager(
                userB, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, //duration
                { 
                    value: amountUserA
                }
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            expect(await wager.connect(signer).fillWager(wagerId, {
                value: amountUserB
            }))
                .to.emit(wager, 'WagerFilled')
                .withArgs(wagerId, deployer.address, signer.address, SUSHI, userA_sushi_price, userB_sushi_price)

            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isFilled).to.equal(true)
        })

        it("Should not fill a p2p wager with wrong userB", async function () {
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            const userB = usdcWhale

            await wager.createWager(
                userB, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                {
                    value: amountUserA
                }
            )

            let wagerId = "0"

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await expect(wager.connect(signer).fillWager(wagerId, {
                value: amountUserB
            })).to.be.revertedWith("p2p restricted")
        })

        it("Should fill a p2m wager on SUSHI paid with ETH", async function () {
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, //duration
                {
                    value: amountUserA
                }
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)
            expect(wagerData.userB).to.be.equal(p2m)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            expect(await wager.connect(signer).fillWager(wagerId, {
                value: amountUserB
            }))
                .to.emit(wager, 'WagerFilled')
                .withArgs(wagerId, deployer.address, signer.address, SUSHI, userA_sushi_price, userB_sushi_price)

            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isFilled).to.equal(true)
            expect(wagerData.userB).to.equal(signer.address)
        })

        it("Should revert when userA attempts to fill own wager", async function () {
            await wager.updatePaymentToken(WETH, WETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await wethContract.connect(signer).approve(wager.address, amountUserA)

            await wager.connect(signer).createWager(
                p2m, // userB
                SUSHI, // wagerToken
                WETH, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, //duration
                {
                    value: amountUserA
                }
            )

            let wagerId = "0"

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await wethContract.connect(signer).approve(wager.address, amountUserB)

            await expect(wager.connect(signer).fillWager(wagerId, {
                value: amountUserB
            })).to.be.revertedWith("Cannot fill own wager")
        })
    })

    describe("Wager Cancellation", async () => {
        it("Should cancel a wager as UserA", async function () {
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, //duration
                {
                    value: amountUserA
                }
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)
            expect(wagerData.isClosed).to.be.false

            await wager.cancelWager(wagerId)
            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isClosed).to.be.true
        })

        it("Should emit a WagerCancelled event", async function () {
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, //duration
                {
                    value: amountUserA
                }
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)
            expect(wagerData.isClosed).to.be.false

            expect(await wager.cancelWager(wagerId)).to.emit(wager, 'WagerCancelled').withArgs(wagerId, deployer.address)
            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isClosed).to.be.true
        })

        it("Should not cancel a wager if signer is not UserA or UserB", async function () {
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                { 
                    value: amountUserA
                }
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)
            expect(wagerData.isClosed).to.be.false

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await expect(wager.connect(signer).cancelWager(wagerId)).to.be.reverted
        })
    })
    describe("Redemption", async () => {
        it("Should send funds to UserA when they win", async function () {
            await wager.updatePaymentToken(WETH, WETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await wethContract.connect(signer).approve(wager.address, amountUserA)

            let userA_sushi_price = "50" // $.0000005 
            let userB_sushi_price = "30" // $.0000003

            await wager.connect(signer).createWager(
                p2m, // userB
                SUSHI, // wagerToken
                WETH, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, //duration
                {
                    value: amountUserA
                }
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)

            await wethContract.connect(signer).transfer(deployer.address, amountUserB)

            await wethContract.approve(wager.address, amountUserB)

            expect(await wager.fillWager(wagerId))
                .to.emit(wager, 'WagerFilled')
                .withArgs(wagerId, deployer.address, signer.address, SUSHI, userA_sushi_price, userB_sushi_price)

            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isFilled).to.equal(true)

            let blockTime = 0xD2F00 // 864000 seconds = 10 days
            await hre.network.provider.request({
                method: "evm_increaseTime",
                params: [blockTime] // 864000 seconds = 10 days
            })

            await hre.network.provider.request({
                method: "hardhat_mine",
                params: ["0x1"] // 1 block
            })

            let userABalanceBefore = await wethContract.balanceOf(wagerData.userA)
            await expect(wager.redeem(wagerId)).to.be.not.reverted
            let userABalanceAfter = await wethContract.balanceOf(wagerData.userA)

            let expectedAmount = wagerData.amountUserA.add(wagerData.amountUserB)

            expect(userABalanceAfter.sub(userABalanceBefore)).to.equal(expectedAmount)
        })

        it("Should send funds to UserB when they win", async function () {
            await wager.updatePaymentToken(WETH, WETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await wethContract.connect(signer).approve(wager.address, amountUserA)

            let userA_sushi_price = "500000000"
            let userB_sushi_price = "300000000"

            await wager.connect(signer).createWager(
                p2m, // userB
                SUSHI, // wagerToken
                WETH, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, //duration
                {
                    value: amountUserA
                }
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)

            await wethContract.connect(signer).transfer(deployer.address, amountUserB)

            await wethContract.approve(wager.address, amountUserB)

            expect(await wager.fillWager(wagerId))
                .to.emit(wager, 'WagerFilled')
                .withArgs(wagerId, deployer.address, signer.address, SUSHI, userA_sushi_price, userB_sushi_price)

            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isFilled).to.equal(true)

            let blockTime = 0xD2F00 // 864000 seconds = 10 days
            await hre.network.provider.request({
                method: "evm_increaseTime",
                params: [blockTime] // 864000 seconds = 10 days
            })

            await hre.network.provider.request({
                method: "hardhat_mine",
                params: ["0x1"] // 1 block
            })

            let userBBalanceBefore = await wethContract.balanceOf(wagerData.userB)
            await expect(wager.redeem(wagerId)).to.be.not.reverted
            let userBBalanceAfter = await wethContract.balanceOf(wagerData.userB)

            let expectedAmount = wagerData.amountUserA.add(wagerData.amountUserB)

            expect(userBBalanceAfter.sub(userBBalanceBefore)).to.equal(expectedAmount)
        })

        it("Should return the funds when neither party wins", async function () {
            await wager.updatePaymentToken(WETH, WETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await wethContract.connect(signer).approve(wager.address, amountUserA)
            
            let userA_sushi_price = "500000000"
            let userB_sushi_price = "30"

            await wager.connect(signer).createWager(
                p2m, // userB
                SUSHI, // wagerToken
                WETH, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, //duration
                {
                    value: amountUserA
                }
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)

            await wethContract.connect(signer).transfer(deployer.address, amountUserB)

            await wethContract.approve(wager.address, amountUserB)

            expect(await wager.fillWager(wagerId))
                .to.emit(wager, 'WagerFilled')
                .withArgs(wagerId, deployer.address, signer.address, SUSHI, userA_sushi_price, userB_sushi_price)

            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isFilled).to.equal(true)

            let blockTime = 0xD2F00 // 864000 seconds = 10 days
            await hre.network.provider.request({
                method: "evm_increaseTime",
                params: [blockTime] // 864000 seconds = 10 days
            })

            await hre.network.provider.request({
                method: "hardhat_mine",
                params: ["0x1"] // 1 block
            })

            let userABalanceBefore = await wethContract.balanceOf(wagerData.userA)
            let userBBalanceBefore = await wethContract.balanceOf(wagerData.userB)
            await expect(wager.redeem(wagerId)).to.be.not.reverted
            let userABalanceAfter = await wethContract.balanceOf(wagerData.userA)
            let userBBalanceAfter = await wethContract.balanceOf(wagerData.userB)

            let expectedAmountUserA = wagerData.amountUserA
            let expectedAmountUserB = wagerData.amountUserB
            

            expect(userABalanceAfter.sub(userABalanceBefore)).to.equal(expectedAmountUserA)
            expect(userBBalanceAfter.sub(userBBalanceBefore)).to.equal(expectedAmountUserB)

        })

        it("Should return the correct winner -- UserA", async function () {
            await wager.updatePaymentToken(WETH, WETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await wethContract.connect(signer).approve(wager.address, amountUserA)
            
            let userA_sushi_price = "50" // $.0000005 
            let userB_sushi_price = "30" // $.0000003

            await wager.connect(signer).createWager(
                p2m, // userB
                SUSHI, // wagerToken
                WETH, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                {
                    value: amountUserA
                }
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)

            await wethContract.connect(signer).transfer(deployer.address, amountUserB)

            await wethContract.approve(wager.address, amountUserB)

            expect(await wager.fillWager(wagerId))
                .to.emit(wager, 'WagerFilled')
                .withArgs(wagerId, deployer.address, signer.address, SUSHI, userA_sushi_price, userB_sushi_price)

            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isFilled).to.equal(true)

            let blockTime = 0xD2F00 // 864000 seconds = 10 days
            await hre.network.provider.request({
                method: "evm_increaseTime",
                params: [blockTime] // 864000 seconds = 10 days
            })

            await hre.network.provider.request({
                method: "hardhat_mine",
                params: ["0x1"] // 1 block
            })

            let winner = await wager.checkWinner(wagerId)
            expect(winner).to.be.equal(wagerData.userA)

        })

        it("Should return the correct winner -- UserB", async function () {
            let sushi_price = "500000000" // $5
            await wager.updatePaymentToken(WETH, WETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await wethContract.connect(signer).approve(wager.address, amountUserA)
            
            let userA_sushi_price = "500000000" // $5
            let userB_sushi_price = "300000000" // $3

            await wager.connect(signer).createWager(
                p2m, // userB
                SUSHI, // wagerToken
                WETH, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                {
                    value: amountUserA
                }
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)

            await wethContract.connect(signer).transfer(deployer.address, amountUserB)

            await wethContract.approve(wager.address, amountUserB)

            expect(await wager.fillWager(wagerId))
                .to.emit(wager, 'WagerFilled')
                .withArgs(wagerId, deployer.address, signer.address, SUSHI, sushi_price)

            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isFilled).to.equal(true)

            let blockTime = 0xD2F00 // 864000 seconds = 10 days
            await hre.network.provider.request({
                method: "evm_increaseTime",
                params: [blockTime] // 864000 seconds = 10 days
            })

            await hre.network.provider.request({
                method: "hardhat_mine",
                params: ["0x1"] // 1 block
            })

            let winner = await wager.checkWinner(wagerId)
            expect(winner).to.be.equal(wagerData.userB)

        })

        it("Should return no winner", async function () {
            await wager.updatePaymentToken(WETH, WETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await wethContract.connect(signer).approve(wager.address, amountUserA)
            
            let userA_sushi_price = "500000000" // $5
            let userB_sushi_price = "30" // $.0000003

            await wager.connect(signer).createWager(
                p2m, // userB
                SUSHI, // wagerToken
                WETH, // paymentToken
                userA_sushi_price, // wagerPriceA
                userB_sushi_price, // wagerPriceB
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                {
                    value: amountUserA
                }
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)

            await wethContract.connect(signer).transfer(deployer.address, amountUserB)

            await wethContract.approve(wager.address, amountUserB)

            expect(await wager.fillWager(wagerId))
                .to.emit(wager, 'WagerFilled')
                .withArgs(wagerId, deployer.address, signer.address, SUSHI, userA_sushi_price, userB_sushi_price)

            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isFilled).to.equal(true)

            let blockTime = 0xD2F00 // 864000 seconds = 10 days
            await hre.network.provider.request({
                method: "evm_increaseTime",
                params: [blockTime] // 864000 seconds = 10 days
            })

            await hre.network.provider.request({
                method: "hardhat_mine",
                params: ["0x1"] // 1 block
            })

            let winner = await wager.checkWinner(wagerId)
            expect(winner).to.be.equal("0x0000000000000000000000000000000000000000") // Address zero denotes no winner
        })
    })
})
