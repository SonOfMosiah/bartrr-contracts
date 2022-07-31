import { expect } from 'chai'
import { ethers, waffle } from 'hardhat'
import { utils } from 'ethers'
import { BigNumber } from '@ethersproject/bignumber'

import { USDC, DAI, WBTC, SUSHI, WETH, ZERO } from '../scripts/address'
import { WBTC_USD_ORACLE, SUSHI_USD_ORACLE, WETH_USD_ORACLE, ETH_USD_ORACLE, USDC_USD_ORACLE, DAI_USD_ORACLE } from '../scripts/address'
import { erc20ABI } from '../scripts/abi/erc20'
import { create2ABI } from '../scripts/abi/create2'
import { bytecode } from '../artifacts/contracts/FixedWager.sol/FixedWager.json'

import { FixedWager } from '../typechain/fixedWager'
import { FixedWager__factory } from '../typechain/factories/FixedWager__factory'
import hre from "hardhat"
import log from 'ololog'

// List of variables that are reused throughout the tests
const wethWhale = "0xa75ede99f376dd47f3993bc77037f61b5737c6ea"
const usdcWhale = '0xfc7470c14baef608dc316f5702790eefee9cc258'
const altaDeployer = "0xe3F641AD659249a020e2aF63c3f9aBd6cfFb668b"
const create2Address = "0x2D8CFd32dC4FBdABdB53fe912057b80A7a918020"
let wager: FixedWager
let deployer: any
let signers: any
let signer: any
let wethContract: any
let eth_address = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"

let p2m = "0x0000000000000000000000000000000000000000"
let sushi_price = "50" // $.0000005 
let wbtc_price = "40000" // $.0004
let amountUserA = ethers.utils.parseEther("0.1")
let amountUserB = ethers.utils.parseEther("0.1")
let duration = "172800"
let above = true

function numberToUint256(value: any) {
    const hex = value.toString(16)
    return `0x${"0".repeat(64 - hex.length)}${hex}`
}

describe("FixedWager", async () => {
    before(async () => {
        signers = await ethers.getSigners()
        deployer = signers[0]
        wethContract = new ethers.Contract(WETH, JSON.parse(erc20ABI), deployer)
    })

    beforeEach(async function () {
        const Wager: FixedWager__factory = (await ethers.getContractFactory("FixedWager")) as FixedWager__factory
        wager = await Wager.deploy()
        await wager.init(altaDeployer, deployer.address)
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
            const Wager: FixedWager__factory = (await ethers.getContractFactory("FixedWager")) as FixedWager__factory
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

        it("Should add WBTC as a wager token then update the oracle", async function () {
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            expect(await wager.wagerTokens(WBTC)).to.be.true
            expect(await wager.oracles(WBTC)).to.equal(WBTC_USD_ORACLE)
            await wager.updateWagerToken(WBTC, DAI_USD_ORACLE, true)
            expect(await wager.wagerTokens(WBTC)).to.be.true
            expect(await wager.oracles(WBTC)).to.equal(DAI_USD_ORACLE)
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
            await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                sushi_price, // wagerPrice
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                true, // above
                { 
                    value: amountUserA // msg.value
                }
            )

            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            await wager.createWager(
                p2m, // userB
                WBTC, // wagerToken
                eth_address, // paymentToken
                wbtc_price, // wagerPrice
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                above, // above
                { 
                    value: amountUserA // msg.value
                }
            )

            await wager.connect(signers[1]).fillWager(1, {value: amountUserB})

            let wbtcWager = "1"
            await wager.markTokenRefundable(WBTC)
            expect(await (await wager.refundableTimestamp(WBTC)).refundable).to.be.gt(0)
            await expect(wager.redeem(wbtcWager)).to.not.be.reverted
        })

        it("Should refund wager after kill switch", async function () {
            await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)


            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                sushi_price, // wagerPrice
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                true, // above
                { 
                    value: amountUserA // msg.value
                }
            )

            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            await wager.createWager(
                p2m, // userB
                WBTC,
                eth_address,
                wbtc_price,
                amountUserA,
                amountUserB,
                duration,
                true, {
                value: amountUserA
            })

            await wager.connect(signers[1]).fillWager(1, {value: amountUserB})

            let wagerId = "1"
            let wagerData = wager.wagers(wagerId)
            await wager.markTokenRefundable(WBTC)
            expect(await (await wager.refundableTimestamp(WBTC)).refundable).to.be.gt(0)
            await expect(wager.redeem(wagerId)).to.not.be.reverted
        })

        it("Should refund the wager even after completion", async function () {
            await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                sushi_price, // wagerPrice
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                true, // above
                { 
                    value: amountUserA // msg.value
                }
            )

            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            await wager.createWager(
                p2m,
                WBTC,
                eth_address,
                wbtc_price,
                amountUserA,
                amountUserB,
                duration,
                above, {
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

        it("Should not refund the wager if kill switch is called after completion", async function () {
            await wager.updatePaymentTokens([eth_address, WETH], [ETH_USD_ORACLE, WETH_USD_ORACLE], true)
            await wager.updateWagerTokens([WBTC, SUSHI], [WBTC_USD_ORACLE, SUSHI_USD_ORACLE], true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                sushi_price, // wagerPrice
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                true, // above
                { 
                    value: amountUserA // msg.value
                }
            )

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await wethContract.connect(signer).transfer(signers[0].address, amountUserA)
            await wethContract.connect(signer).transfer(signers[1].address, amountUserA)

            await wethContract.approve(wager.address, amountUserA)

            await wager.createWager(
                p2m,
                WBTC,
                WETH,
                wbtc_price,
                amountUserA,
                amountUserB,
                duration,
                above
                )

            let wagerId = "1"

            await wethContract.connect(signers[1]).approve(wager.address, amountUserB)

            await wager.connect(signers[1]).fillWager(wagerId)

            let blockTime = 0xD2F00 // 864000 seconds = 10 days
            await hre.network.provider.request({
                method: "evm_increaseTime",
                params: [blockTime] // 864000 seconds = 10 days
            })

            await hre.network.provider.request({
                method: "hardhat_mine",
                params: ["0x1"] // 1 block
            })

            await wager.markTokenRefundable(WBTC)
            expect(await (await wager.refundableTimestamp(WBTC)).refundable).to.be.gt(0)

            let userWager = await wager.wagers(wagerId)

            let winner = await wager.checkWinner(wagerId)
            log.yellow("Winner: " + winner.toString())
            const balanceBefore = await wethContract.balanceOf(winner)
            await expect(wager.redeem(wagerId)).to.not.be.reverted
            const balanceAfter = await wethContract.balanceOf(winner)
            const balanceDifference = balanceAfter.sub(balanceBefore)
            log.yellow("Balance difference: " + balanceDifference.toString())
            expect(balanceDifference).to.be.equal(userWager.amountUserA.add(userWager.amountUserB))
        })
    })

    describe("Wager Creation", async () => {
        it("Should create a wager on SUSHI paid with ETH", async function () {
            await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                sushi_price, // wagerPrice
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                true, // above
                { 
                    value: amountUserA // msg.value
                }
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)
            expect(wagerData).to.be.not.null
            expect(wagerData.userA).to.equal(deployer.address)
            expect(wagerData.userB).to.equal(p2m)
            expect(wagerData.wagerToken).to.equal(SUSHI)
            expect(wagerData.paymentToken).to.equal(eth_address)
            expect(wagerData.wagerPrice).to.equal(sushi_price)
            expect(wagerData.amountUserA).to.not.equal(amountUserA.mul(995).div(1000))
            expect(wagerData.amountUserA.lt(amountUserA.mul(995).div(1000))).to.be.true
            expect(wagerData.amountUserB).to.equal(amountUserB)
            expect(wagerData.duration).to.equal(duration)
            expect(wagerData.above).to.be.true
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
            await wethContract.connect(signer).transfer(deployer.address, ethers.utils.parseEther("100.0"))


            await wager.createWager(
                p2m,
                WBTC,
                WETH,
                "3500",
                amountUserA,
                amountUserB,
                "1728000",
                true
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)
            expect(wagerData).to.be.not.null
            expect(wagerData.userA).to.equal(deployer.address)
            expect(wagerData.userB).to.equal(p2m)
            expect(wagerData.wagerToken).to.equal(WBTC)
            expect(wagerData.paymentToken).to.equal(WETH)
            expect(wagerData.wagerPrice).to.equal("3500")
            expect(wagerData.amountUserA).to.not.equal(BigNumber.from(amountUserA).mul(995).div(1000))
            expect(wagerData.amountUserA.lt(amountUserA.mul(995).div(1000))).to.be.true
            expect(wagerData.amountUserB).to.equal(amountUserB)
            expect(wagerData.duration).to.equal("1728000")
            expect(wagerData.above).to.be.true
        })

        it("Should create a 100,000 USDC wager on WBTC", async function () {
            await wager.updatePaymentToken(USDC, USDC_USD_ORACLE, true)
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            let usdcContract = new ethers.Contract(USDC, JSON.parse(erc20ABI), deployer)
            let amountUsdc = "100000000000" // 100,000 USDC
            await usdcContract.approve(wager.address, amountUsdc)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [usdcWhale],
            })
            signer = await ethers.getSigner(usdcWhale)
            
            await usdcContract.connect(signer).transfer(deployer.address, amountUsdc)

            let wbtcPrice = "3500"
            let duration = "1728000"
            let above = true;

            let create = await wager.createWager(
                p2m,
                WBTC,
                USDC,
                wbtcPrice,
                amountUsdc,
                amountUsdc,
                duration,
                above
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)
            expect(wagerData).to.be.not.null
            expect(wagerData.userA).to.equal(deployer.address)
            expect(wagerData.userB).to.equal(p2m)
            expect(wagerData.wagerToken).to.equal(WBTC)
            expect(wagerData.paymentToken).to.equal(USDC)
            expect(wagerData.wagerPrice).to.equal(wbtcPrice)
            expect(wagerData.amountUserA).to.equal(BigNumber.from(amountUsdc).mul(995).div(1000))
            expect(wagerData.amountUserB).to.equal(amountUsdc)
            expect(wagerData.duration).to.equal(duration)
            expect(wagerData.above).to.be.true
        })

        it("Should create a 10 USDC wager on WBTC", async function () {
            await wager.updatePaymentToken(USDC, USDC_USD_ORACLE, true)
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            let usdcContract = new ethers.Contract(USDC, JSON.parse(erc20ABI), deployer)
            let amountUsdc = "10000000" // 10 USDC
            await usdcContract.approve(wager.address, amountUsdc)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [usdcWhale],
            })
            signer = await ethers.getSigner(usdcWhale)
            
            await usdcContract.connect(signer).transfer(deployer.address, amountUsdc)

            let wbtcPrice = "3500"
            let duration = "1728000"
            let above = true;

            let create = await wager.createWager(
                p2m,
                WBTC,
                USDC,
                wbtcPrice,
                amountUsdc,
                amountUsdc,
                duration,
                above
            )

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)
            expect(wagerData).to.be.not.null
            expect(wagerData.userA).to.equal(deployer.address)
            expect(wagerData.userB).to.equal(p2m)
            expect(wagerData.wagerToken).to.equal(WBTC)
            expect(wagerData.paymentToken).to.equal(USDC)
            expect(wagerData.wagerPrice).to.equal(wbtcPrice)
            expect(wagerData.amountUserA).to.not.equal(BigNumber.from(amountUsdc).mul(995).div(1000)) // .5% is less than $5
            expect(wagerData.amountUserA.lt(amountUserA.mul(995).div(1000))).to.be.true
            expect(wagerData.amountUserB).to.equal(amountUsdc)
            expect(wagerData.duration).to.equal(duration)
            expect(wagerData.above).to.be.true
        })

        it("Should revert if wager amount is less than $10", async function () {
            await wager.updatePaymentToken(USDC, USDC_USD_ORACLE, true)
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            let usdcContract = new ethers.Contract(USDC, JSON.parse(erc20ABI), deployer)
            let amountUsdc = "1000000" // 1 USDC
            await usdcContract.approve(wager.address, amountUsdc)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [usdcWhale],
            })
            signer = await ethers.getSigner(usdcWhale)
            
            await usdcContract.connect(signer).transfer(deployer.address, amountUsdc)

            let wbtcPrice = "3500"
            let duration = "1728000"
            let above = true;

            await expect(wager.createWager(
                p2m,
                WBTC,
                USDC,
                wbtcPrice,
                amountUsdc,
                amountUsdc,
                duration,
                above
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

            let wbtcPrice = "3500"
            let duration = "1000"
            let above = true;

            await expect(wager.createWager(
                p2m,
                WBTC,
                USDC,
                wbtcPrice,
                amountUsdc,
                amountUsdc,
                duration,
                above
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

            let wbtcPrice = "3500"
            let duration = "86400"
            let above = true;

            await expect(wager.createWager(
                p2m,
                WBTC,
                USDC,
                wbtcPrice,
                amountUsdc,
                amountUsdc,
                duration,
                above
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

            const wbtc_price = "3500"
            const userB = p2m

            expect(await wager.createWager(
                userB,
                WBTC,
                WETH,
                wbtc_price,
                amountUserA,
                amountUserB,
                "1728000",
                true
            )).to.emit(wager, "WagerCreated").withArgs("0", deployer.address, userB, WBTC, wbtc_price)

        })

        it("Should correctly transfer ETH", async function () {
            await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
            await wager.updateWagerToken(WBTC, WBTC_USD_ORACLE, true)
            let wethContract = new ethers.Contract(WETH, JSON.parse(erc20ABI), deployer)
            await wethContract.approve(wager.address, amountUserA)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)
            await wethContract.connect(signer).transfer(deployer.address, ethers.utils.parseEther("100.0"))

            const wbtc_price = "3500"
            const userB = p2m

            const provider = hre.waffle.provider
            let ethBalanceBefore = await provider.getBalance(deployer.address)

            let duration = "1728000"
            let above = true;

            await wager.createWager(
                userB, // userB
                WBTC, // wagerToken
                eth_address, // paymentToken
                wbtc_price, // wagerPrice
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                above, 
                {
                    value: amountUserA
                }
            )

            let ethBalanceAfter = await provider.getBalance(deployer.address)
            let balanceDifference = ethBalanceBefore.sub(ethBalanceAfter)
            //TODO: need to estimate the gas to correctly calculate the ETH balance
            expect(balanceDifference.gt(amountUserA)).to.be.true
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
            await wethContract.connect(signer).transfer(deployer.address, ethers.utils.parseEther("100.0"))

            const wbtc_price = "3500"
            const userB = p2m

            let wethBalanceBefore = await wethContract.balanceOf(deployer.address)

            await wager.createWager(
                userB,
                WBTC,
                WETH,
                wbtc_price,
                amountUserA,
                amountUserB,
                "1728000",
                true
            )

            let wethBalanceAfter = await wethContract.balanceOf(deployer.address)
            expect(wethBalanceBefore.sub(wethBalanceAfter)).to.equal(amountUserA)
        })

        it("Should return all wagers", async function () {
            await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                sushi_price, // wagerPrice
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                true, // above
                { 
                    value: amountUserA // msg.value
                }
            )

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                sushi_price, // wagerPrice
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                true, // above
                { 
                    value: amountUserA // msg.value
                }
            )

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                sushi_price, // wagerPrice
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                true, // above
                { 
                    value: amountUserA // msg.value
                }
            )

            await wager.createWager(
                p2m, // userB
                SUSHI, // wagerToken
                eth_address, // paymentToken
                sushi_price, // wagerPrice
                amountUserA, // amountUserA
                amountUserB, // amountUserB
                duration, // duration
                true, // above
                { 
                    value: amountUserA // msg.value
                }
            )
            let wagers = await wager.getAllWagers();
            expect(wagers.length).to.equal(4)
        })
    })

    describe("Fill Wager", async () => {
        it("Should fill a p2p wager on SUSHI paid with ETH", async function () {
            await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                wethWhale,
                SUSHI,
                eth_address,
                sushi_price,
                amountUserA,
                amountUserB,
                duration,
                true, {
                value: amountUserA
            })

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
                .withArgs(wagerId, deployer.address, signer.address, SUSHI, sushi_price)

            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isFilled).to.equal(true)
        })

        it("Should not fill a p2p wager with wrong userB", async function () {
            await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                usdcWhale,
                SUSHI,
                eth_address,
                sushi_price,
                amountUserA,
                amountUserB,
                duration,
                true, {
                value: amountUserA
            })

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)

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
            await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m,
                SUSHI,
                eth_address,
                sushi_price,
                amountUserA,
                amountUserB,
                duration,
                true, {
                value: amountUserA
            })

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
                .withArgs(wagerId, deployer.address, signer.address, SUSHI, sushi_price)

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
                p2m,
                SUSHI,
                WETH,
                sushi_price,
                amountUserA,
                amountUserB,
                duration,
                true, {
                value: amountUserA
            })

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
            await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m,
                SUSHI,
                eth_address,
                sushi_price,
                amountUserA,
                amountUserB,
                duration,
                true, {
                value: amountUserA
            })

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)
            expect(wagerData.isClosed).to.be.false

            await wager.cancelWager(wagerId)
            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isClosed).to.be.true
        })

        it("Should emit a WagerCancelled event", async function () {
            await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m,
                SUSHI,
                eth_address,
                sushi_price,
                amountUserA,
                amountUserB,
                duration,
                true, {
                value: amountUserA
            })

            let wagerId = "0"
            let wagerData = await wager.wagers(wagerId)
            expect(wagerData.isClosed).to.be.false

            expect(await wager.cancelWager(wagerId)).to.emit(wager, 'WagerCancelled').withArgs(wagerId, deployer.address)
            wagerData = await wager.wagers(wagerId)
            expect(wagerData.isClosed).to.be.true
        })

        it("Should not cancel a wager if signer is not UserA or UserB", async function () {
            await wager.updatePaymentToken(eth_address, ETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await wager.createWager(
                p2m,
                SUSHI,
                eth_address,
                sushi_price,
                amountUserA,
                amountUserB,
                duration,
                true, {
                value: amountUserA
            })

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

            await wager.connect(signer).createWager(
                p2m,
                SUSHI,
                WETH,
                sushi_price,
                amountUserA,
                amountUserB,
                duration,
                above, {
                value: amountUserA
            })

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

            let userABalanceBefore = await wethContract.balanceOf(wagerData.userA)
            await expect(wager.redeem(wagerId)).to.be.not.reverted
            let userABalanceAfter = await wethContract.balanceOf(wagerData.userA)

            let expectedAmount = wagerData.amountUserA.add(wagerData.amountUserB)

            expect(userABalanceAfter.sub(userABalanceBefore)).to.equal(expectedAmount)
        })

        it("Should send funds to UserB when they win", async function () {
            let sushi_price = "500000000" // $5
            await wager.updatePaymentToken(WETH, WETH_USD_ORACLE, true)
            await wager.updateWagerToken(SUSHI, SUSHI_USD_ORACLE, true)

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [wethWhale],
            })
            signer = await ethers.getSigner(wethWhale)

            await wethContract.connect(signer).approve(wager.address, amountUserA)
            

            await wager.connect(signer).createWager(
                p2m,
                SUSHI,
                WETH,
                sushi_price,
                amountUserA,
                amountUserB,
                duration,
                true, {
                value: amountUserA
            })

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

            let userBBalanceBefore = await wethContract.balanceOf(wagerData.userB)
            await expect(wager.redeem(wagerId)).to.be.not.reverted
            let userBBalanceAfter = await wethContract.balanceOf(wagerData.userB)

            let expectedAmount = wagerData.amountUserA.add(wagerData.amountUserB)

            expect(userBBalanceAfter.sub(userBBalanceBefore)).to.equal(expectedAmount)
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
            

            await wager.connect(signer).createWager(
                p2m,
                SUSHI,
                WETH,
                sushi_price,
                amountUserA,
                amountUserB,
                duration,
                true, {
                value: amountUserA
            })

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
            

            await wager.connect(signer).createWager(
                p2m,
                SUSHI,
                WETH,
                sushi_price,
                amountUserA,
                amountUserB,
                duration,
                true, {
                value: amountUserA
            })

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
    })
})
