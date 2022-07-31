import { utils } from 'ethers'
import { ethers } from 'hardhat'

function encodeParam(dataType: any, data: any) {
    const abiCoder = ethers.utils.defaultAbiCoder
    return abiCoder.encode(dataType, data)
}

function buildCreate2Address(creatorAddress: string, saltHex: any, byteCode: any) {
    let x = utils.keccak256(
        `0x${["ff", creatorAddress, saltHex, ethers.utils.keccak256(byteCode)]
            .map((x) => x.replace(/0x/, ""))
            .join("")}`
    )

    return `0x${x.slice(-40)}`.toLowerCase()
}

// converts an int to uint256
export function numberToUint256(value: any) {
    const hex = value.toString(16)
    return `0x${"0".repeat(64 - hex.length)}${hex}`
}


export async function findAddress(bytecode: string, factoryAddress: string) {
    let regex = /^0x00000000(.){32}$/
    let salt = 0
    let computedAddr = "0"
    while (!computedAddr.toLowerCase().match(regex)) {
        computedAddr = buildCreate2Address(
            factoryAddress,
            numberToUint256(salt),
            bytecode
        )
        if (computedAddr.toLowerCase().match(/^0x00000(.){35}$/)) {
            console.log(computedAddr, "salt:", salt.toString())
        }
        salt++
    }

    console.log("salt:", --salt, "addr:", computedAddr)
    return {
        salt: salt,
        address: computedAddr
    }
}
