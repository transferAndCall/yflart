const YFLArt = artifacts.require('YFLArt')
const Token = artifacts.require('Token')
const MockyYFL = artifacts.require('MockyYFL')
const MockMarketplace = artifacts.require('MockMarketplace')
const { BN, constants, expectRevert, ether, time } = require('@openzeppelin/test-helpers')

// You must run ganache-cli with the --fork flag of mainnet for this test to work
contract('YFLArt', () => {
  const owner = '0x2DCE66Feaf042fbB03c9B613855c6c845829473d'
  const whale = '0xD8595ac2836B7a8040f046E751B42088436B6365'

  beforeEach(async () => {
    this.yfl = await Token.at('0x28cb7e841ee97947a86B06fA4090C8451f64c0be')
    this.paymentToken = await Token.at('0x28cb7e841ee97947a86B06fA4090C8451f64c0be')
    //this.yflart = await YFLArt.at('0x4F137F7156e4AdBa567B6ceb43D9c8DF31295195')
    this.yYFL = await MockyYFL.at('0x75D1aA733920b14fC74c9F6e6faB7ac1EcE8482E')
    this.yflart = await YFLArt.new(
      'YFLArt',
      'YFLA',
      'https://example.com/',
      this.yYFL.address,
      { from: owner }
    )
  })

  it('should be functional', async () => {
    await this.yflart.register(0, 'test', owner, owner, this.yfl.address, ether('0.1'), ether('0.1'), { from: owner })
    await this.yfl.approve(this.yflart.address, ether('0.2'), { from: owner })
    await this.yflart.buy(0, { from: owner })
    await this.yflart.stake(0, { from: owner })
    await this.yfl.approve(this.yflart.address, ether('0.2'), { from: owner })
    await this.yflart.resell(0, this.paymentToken.address, ether('.1'), { from: owner })
    await this.yfl.approve(this.yflart.address, ether('0.2'), { from: whale })
    await this.yflart.buy(0, { from: whale })
  })
})
