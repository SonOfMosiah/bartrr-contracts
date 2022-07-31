import { ethers } from 'hardhat'
import hre from 'hardhat'
import { Deployer, FixedWager } from '../../typechain'
import { Deployer__factory, FixedWager__factory } from '../../typechain'
import { BigNumber } from '@ethersproject/bignumber'
import { numberToUint256, findAddress } from '../create2'
import { bytecode } from '../../artifacts/contracts/TokenLockup.sol/TokenLockup.json'
import log from 'ololog'

const FACTORY_ADDRESS = '0x381d7F421C72579c7Db349a3D6a8A7bF0ddACdD5'

async function main() {
    try {
        let salt = "0xbf7bf3d445aec7b0c357163d5594db8ca7c12d315f8d66e2d2b38007e7320488"
        let address = "0x0000000000B952afB12942405F20a1B1B1F575B4"
        await run(address, salt, bytecode)
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

    const result = await (await create2.deploy(bytecode, salt)).wait(5)

    console.log(result.transactionHash)

    await hre.run("verify:verify", {
        address: address,
        constructorArguments: [],
    })
}