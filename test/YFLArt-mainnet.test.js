const YFLArt = artifacts.require('YFLArt')
const Token = artifacts.require('Token')
const MockyYFI = artifacts.require('MockyYFI')
const MockMarketplace = artifacts.require('MockMarketplace')
const { BN, constants, expectRevert, ether } = require('@openzeppelin/test-helpers')

// You must run ganache-cli with the --fork flag of mainnet for this test to work
contract('YFLArt', () => {
  const owner = '0x2DCE66Feaf042fbB03c9B613855c6c845829473d'
  const yYFL = '0x75D1aA733920b14fC74c9F6e6faB7ac1EcE8482E'
  beforeEach(async () => {
    this.yfl = await Token.at('0x28cb7e841ee97947a86B06fA4090C8451f64c0be')
    this.paymentToken = await Token.at('0x28cb7e841ee97947a86B06fA4090C8451f64c0be')
    this.yflart = await YFLArt.new(
      'YFLArt',
      'YFLA',
      'https://example.com/',
      yYFL,
      { from: owner }
    )
  })

  it('should be functional', async () => {
    await this.yflart.register(0, 'test', owner, this.yfl.address, ether('0.1'), ether('0.1'), { from: owner })
    await this.yfl.approve(this.yflart.address, ether('2'), { from: owner })
    await this.yflart.buy(0, { from: owner })
    await this.yflart.stake(0, { from: owner })
  })
})
