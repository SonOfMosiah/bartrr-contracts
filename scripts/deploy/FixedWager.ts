import { ethers } from 'hardhat'
import hre from 'hardhat'
import { Deployer, FixedWager } from '../../typechain'
import { Deployer__factory, FixedWager__factory } from '../../typechain'
import { BigNumber } from '@ethersproject/bignumber'
import { numberToUint256, findAddress } from '../create2'
import { bytecode } from '../../artifacts/contracts/FixedWager.sol/FixedWager.json'
import log from 'ololog'

// mainnet imports
import { USDC, DAI, USDT, FRAX, ZERO, ETH } from '../address'
import { MULTISIG, TIMELOCK, WAGER_ORACLE_ARRAY, WAGER_TOKEN_ARRAY, PAYMENT_ORACLE_ARRAY, PAYMENT_TOKEN_ARRAY } from '../address'
import { MULTISIG_POLYGON, TIMELOCK_POLYGON, WAGER_ORACLE_ARRAY_POLYGON, WAGER_TOKEN_ARRAY_POLYGON, PAYMENT_ORACLE_ARRAY_POLYGON, PAYMENT_TOKEN_ARRAY_POLYGON } from '../address'
import { MULTISIG_AVAX, TIMELOCK_AVAX, WAGER_ORACLE_ARRAY_AVAX, WAGER_TOKEN_ARRAY_AVAX, PAYMENT_ORACLE_ARRAY_AVAX, PAYMENT_TOKEN_ARRAY_AVAX} from '../address'
import { MULTISIG_BSC, TIMELOCK_BSC, WAGER_ORACLE_ARRAY_BSC, WAGER_TOKEN_ARRAY_BSC, PAYMENT_ORACLE_ARRAY_BSC, PAYMENT_TOKEN_ARRAY_BSC } from '../address'
import { MULTISIG_OPTIMISM, TIMELOCK_OPTIMISM, WAGER_ORACLE_ARRAY_OPTIMISM, WAGER_TOKEN_ARRAY_OPTIMISM, PAYMENT_ORACLE_ARRAY_OPTIMISM, PAYMENT_TOKEN_ARRAY_OPTIMISM } from '../address'
import { MULTISIG_ARBITRUM, TIMELOCK_ARBITRUM, WAGER_ORACLE_ARRAY_ARBITRUM, WAGER_TOKEN_ARRAY_ARBITRUM, PAYMENT_ORACLE_ARRAY_ARBITRUM, PAYMENT_TOKEN_ARRAY_ARBITRUM } from '../address'

// Testnet imports
import { USDC_RINKEBY, DAI_RINKEBY, WBTC_RINKEBY, LINK_RINKEBY, WETH_RINKEBY, BAT_RINKEBY } from '../address'
import { USDC_ORACLE_RINKEBY, DAI_ORACLE_RINKEBY, BTC_ORACLE_RINKEBY, LINK_ORACLE_RINKEBY, ETH_ORACLE_RINKEBY, BAT_ORACLE_RINKEBY } from '../address'

const FACTORY_ADDRESS = '0x381d7F421C72579c7Db349a3D6a8A7bF0ddACdD5'

async function main() {
    const networkName = hre.network.name
    log.yellow("networkName:", networkName);

    let eth = ETH
    let usdc
    let dai

    try {
        // let { salt, address } = await findAddress(bytecode, FACTORY_ADDRESS)
        let salt = '0x087183a411770a645a96cf2e31fa69ab89e22f5e7dc32828b0bb00020cbd1af7'
        let address = '0x000000000a5396D115a0F0703160336a8835EC13'
        await run(address, salt, bytecode)

        const FixedWager: FixedWager__factory = (await ethers.getContractFactory("FixedWager")) as FixedWager__factory
        const fixedWager: FixedWager = FixedWager.attach(address)

        let feeAddress : string = ''
        let owner : string = ''

        let paymentTokenArray : string[] = []
        let paymentOracleArray : string[] = []
        let wagerTokenArray : string[] = []
        let wagerOracleArray : string[] = []

        let init
        let paymentTokens
        let wagerTokens
        switch (networkName) {
            case "mainnet":
                log.yellow("enter mainnet case")
                feeAddress = MULTISIG
                owner = TIMELOCK

                paymentTokenArray = PAYMENT_TOKEN_ARRAY
                paymentOracleArray = PAYMENT_ORACLE_ARRAY
                wagerTokenArray = WAGER_TOKEN_ARRAY
                wagerOracleArray = WAGER_ORACLE_ARRAY
                break
            case "polygon":
                log.yellow("enter polygon case")
                owner = TIMELOCK_POLYGON
                feeAddress = MULTISIG_POLYGON

                paymentTokenArray = PAYMENT_TOKEN_ARRAY_POLYGON
                paymentOracleArray = PAYMENT_ORACLE_ARRAY_POLYGON
                wagerTokenArray = WAGER_TOKEN_ARRAY_POLYGON
                wagerOracleArray = WAGER_ORACLE_ARRAY_POLYGON
                break
            case "avalanche":
                log.yellow("enter avalanche case")
                owner = TIMELOCK_AVAX
                feeAddress = MULTISIG_AVAX

                paymentTokenArray = PAYMENT_TOKEN_ARRAY_AVAX
                paymentOracleArray = PAYMENT_ORACLE_ARRAY_AVAX
                wagerTokenArray = WAGER_TOKEN_ARRAY_AVAX
                wagerOracleArray = WAGER_ORACLE_ARRAY_AVAX
                break
            case "bsc":
                log.yellow("enter bsc case")
                owner = TIMELOCK_BSC
                feeAddress = MULTISIG_BSC

                paymentTokenArray = PAYMENT_TOKEN_ARRAY_BSC
                paymentOracleArray = PAYMENT_ORACLE_ARRAY_BSC
                wagerTokenArray = WAGER_TOKEN_ARRAY_BSC
                wagerOracleArray = WAGER_ORACLE_ARRAY_BSC
                break
            case "arbitrumOne":
                log.yellow("enter arbitrum case")
                owner = TIMELOCK_ARBITRUM
                feeAddress = MULTISIG_ARBITRUM

                paymentTokenArray = PAYMENT_TOKEN_ARRAY_ARBITRUM
                paymentOracleArray = PAYMENT_ORACLE_ARRAY_ARBITRUM
                wagerTokenArray = WAGER_TOKEN_ARRAY_ARBITRUM
                wagerOracleArray = WAGER_ORACLE_ARRAY_ARBITRUM
                break
            case "optimisticEthereum":
                log.yellow("enter optimism case")
                owner = TIMELOCK_OPTIMISM
                feeAddress = MULTISIG_OPTIMISM

                paymentTokenArray = PAYMENT_TOKEN_ARRAY_OPTIMISM
                paymentOracleArray = PAYMENT_ORACLE_ARRAY_OPTIMISM
                wagerTokenArray = WAGER_TOKEN_ARRAY_OPTIMISM
                wagerOracleArray = WAGER_ORACLE_ARRAY_OPTIMISM
                break
            case "rinkeby":
                log.yellow("enter rinkeby case")
                // tokens
                let usdc, dai, wbtc, weth, link, bat
                // token oracles
                let usdcOracle, daiOracle, btcOracle, linkOracle, ethOracle, batOracle
                usdc = USDC_RINKEBY
                usdcOracle = USDC_ORACLE_RINKEBY
                dai = DAI_RINKEBY
                daiOracle = DAI_ORACLE_RINKEBY
                wbtc = WBTC_RINKEBY
                btcOracle = BTC_ORACLE_RINKEBY
                weth = WETH_RINKEBY
                ethOracle = ETH_ORACLE_RINKEBY
                link = LINK_RINKEBY
                linkOracle = LINK_ORACLE_RINKEBY
                bat = BAT_RINKEBY
                batOracle = BAT_ORACLE_RINKEBY

                feeAddress = MULTISIG
                // init = await fixedWager.init(feeAddress, "0x087183a411770a645A96cf2e31fA69Ab89e22F5E", {
                //     gasPrice: ethers.utils.parseUnits('100', 'gwei'),
                // })
                // await init.wait()
                // log.yellow("init:", init.hash)

                let paymentTokens = await fixedWager.updatePaymentTokens([usdc, dai, weth, eth, wbtc], [usdcOracle, daiOracle, ethOracle, ethOracle, btcOracle], true,{
                    gasPrice: ethers.utils.parseUnits('100', 'gwei'),
                });
                await paymentTokens.wait()
                log.yellow("update payment tokens:", paymentTokens.hash)

                let wagerTokens = await fixedWager.updateWagerTokens([wbtc, link, bat, weth, eth], [btcOracle, linkOracle, batOracle, ethOracle, ethOracle], true, {
                    gasPrice: ethers.utils.parseUnits('100', 'gwei'),
                });
                await wagerTokens.wait()
                log.yellow("update wager tokens:", wagerTokens.hash)

                let wager1 = await fixedWager.createWager(
                    ZERO,
                    wbtc,
                    ETH,
                    '120000000000',
                    ethers.utils.parseEther('0.1'),
                    ethers.utils.parseEther('0.1'),
                    86400,
                    true,
                    {
                        value: ethers.utils.parseEther('0.1')
                    }
                )
                await wager1.wait()
                log.yellow("wager1:", wager1.hash)

                let wager2 = await fixedWager.createWager(
                    "0xBF7BF3d445aEc7B0c357163d5594DB8ca7C12D31",
                    wbtc,
                    ETH,
                    '120000000000',
                    ethers.utils.parseEther('0.1'),
                    ethers.utils.parseEther('0.1'),
                    86400,
                    true,
                    {
                        value: ethers.utils.parseEther('0.1')
                    }
                )
                await wager2.wait()
                log.yellow("wager2:", wager2.hash)
                
                break
            default:
                break
        }

        paymentTokens = await fixedWager.updatePaymentTokens(paymentTokenArray, paymentOracleArray, true)
        await paymentTokens.wait()
        log.yellow('paymentTokens:', paymentTokens.hash)

        wagerTokens = await fixedWager.updateWagerTokens(wagerTokenArray, wagerOracleArray, true)
        await wagerTokens.wait()
        log.yellow('wagerTokens:', wagerTokens.hash)

        init = await fixedWager.init(feeAddress, owner)
        await init.wait()
        log.yellow('init:', init.hash)

    } catch (e) {
        console.error(e)
    }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})


async function run(address: string, salt: string, bytecode: string) {
    const Create2: Deployer__factory = (await ethers.getContractFactory("Deployer")) as Deployer__factory
    const create2: Deployer = Create2.attach(FACTORY_ADDRESS)

    // const result = await (await create2.deploy(bytecode, salt)).wait(5)

    // console.log(result.transactionHash)

    await hre.run("verify:verify", {
        address: address,
        constructorArguments: [],
    })
}