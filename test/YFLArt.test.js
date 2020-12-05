const YFLArt = artifacts.require('YFLArt')
const Token = artifacts.require('Token')
const MockyYFL = artifacts.require('MockyYFL')
const MockMarketplace = artifacts.require('MockMarketplace')
const { BN, constants, expectRevert, ether } = require('@openzeppelin/test-helpers')

contract('YFLArt', ([deployer, user1, user2, signer, artist, treasury]) => {
  beforeEach(async () => {
    this.yfl = await Token.new('YFLink', 'YFL')
    this.paymentToken = await Token.new('Stablecoin', 'STBL')
    this.yyfl = await MockyYFL.new(
      this.yfl.address,
      treasury
    )
    this.yflart = await YFLArt.new(
      'YFLArt',
      'YFLA',
      'https://example.com/{address}',
      this.yyfl.address
    )
    this.market = await MockMarketplace.new(this.yflart.address,)

    await this.yflart.addSigner(signer)
    await this.yfl.transfer(user1, ether('100'))
    await this.yfl.transfer(user2, ether('100'))
    await this.paymentToken.transfer(user1, ether('100'))
    await this.paymentToken.transfer(user2, ether('100'))
  })

  describe('register', () => {
    it('should register', async () => {
      // must be called by owner
      await expectRevert(
        this.yflart.register(0, 'test', user1, artist, this.paymentToken.address, ether('1'), ether('1'), { from: user1 }),
        'Ownable: caller is not the owner.'
      )
      // cannot register without an artist
      await expectRevert(
        this.yflart.register(0, 'test', user1, constants.ZERO_ADDRESS, this.paymentToken.address, ether('1'), ether('1'), { from: deployer }),
        '!_artist'
      )
      // cannot register without YFL backing
      await expectRevert(
        this.yflart.register(0, 'test', user1, artist, this.paymentToken.address, ether('1'), 0, { from: deployer }),
        '!_yflAmount'
      )
      await this.yflart.register(0, 'test', user1, artist, this.paymentToken.address, ether('1'), ether('1'), { from: deployer })
      let token = await this.yflart.registry(0)
      assert.equal(token.tokenURI, 'test')
      assert.equal(token.artist, artist)
      assert.equal(token.paymentToken, this.paymentToken.address)
      assert.isTrue(ether('1').eq(token.paymentAmount))
      assert.isTrue(ether('1').eq(token.yflAmount))
      // can register without a payment token
      await this.yflart.register(1, 'test', user1, artist, constants.ZERO_ADDRESS, 0, ether('1'), { from: deployer })
      token = await this.yflart.registry(1)
      assert.equal(token.tokenURI, 'test')
      assert.equal(token.artist, artist)
      assert.equal(token.paymentToken, constants.ZERO_ADDRESS)
      assert.isTrue(ether('0').eq(token.paymentAmount))
      assert.isTrue(ether('1').eq(token.yflAmount))
    })
  })

  describe('signerRegister', () => {
    it('should register with a signer', async () => {
      const hash = web3.utils.soliditySha3(0)
      // this private key is simply from ganache - do not use in production!
      const fakeSignature = await web3.eth.accounts.sign(hash, '0xe44cbcf099f75d70efac164a3211ef0e6bb88475fbf7d2691fe461be354d687d')
      // does not allow non-signers
      await expectRevert(
        this.yflart.signerRegister(
          0,
          fakeSignature.v,
          fakeSignature.r,
          fakeSignature.s,
          'test',
          user1,
          artist,
          this.paymentToken.address,
          ether('1'),
          ether('1'),
          { from: user1 }
        ),
        '!signer'
      )
      // this private key is simply from ganache - do not use in production!
      const signature = await web3.eth.accounts.sign(hash, '0x51c82b4cbf18b70f33b898ade94839d4bba8d22f4d8134eda770adb9c39ccb97')
      await this.yflart.signerRegister(
        0,
        signature.v,
        signature.r,
        signature.s,
        'test',
        user1,
        artist,
        this.paymentToken.address,
        ether('1'),
        ether('1'),
        { from: deployer }
      )
    })
  })

  describe('buy', () => {
    it('should buy', async () => {
      // NFT must be registered
      await expectRevert(
        this.yflart.buy(0, { from: user1 }),
        '!registered'
      )
      await this.yflart.register(0, 'test', user1, artist, this.paymentToken.address, ether('1'), ether('1'), { from: deployer })
      // users must approve the YFLArt contract to spend YFL
      await expectRevert(
        this.yflart.buy(0, { from: user1 }),
        'ERC20: transfer amount exceeds allowance.'
      )
      await this.yfl.approve(this.yflart.address, ether('100'), { from: user1 })
      // users must approve the YFLArt contract to spend payment token
      await expectRevert(
        this.yflart.buy(0, { from: user1 }),
        'ERC20: transfer amount exceeds allowance.'
      )
      await this.paymentToken.approve(this.yflart.address, ether('100'), { from: user1 })
      // cannot buy if not the original buyer
      await this.yfl.approve(this.yflart.address, ether('100'), { from: user2 })
      await this.paymentToken.approve(this.yflart.address, ether('100'), { from: user2 })
      await expectRevert(
        this.yflart.buy(0, { from: user2 }),
        '!originalBuyer'
      )
      // buying works
      assert.isTrue(ether('0').eq(await this.paymentToken.balanceOf(treasury)))
      assert.isTrue(ether('0').eq(await this.paymentToken.balanceOf(artist)))
      await this.yflart.buy(0, { from: user1 })
      assert.isTrue(ether('.8').eq(await this.paymentToken.balanceOf(treasury)))
      assert.isTrue(ether('.2').eq(await this.paymentToken.balanceOf(artist)))
      // same id cannot be used to buy again
      await expectRevert(
        this.yflart.buy(0, { from: user1 }),
        '!buy'
      )
      // user receives NFT
      assert.equal(1, await this.yflart.balanceOf(user1))
      // NFT is keeping track of stored YFL
      assert.isTrue(ether('1').eq(await this.yflart.balances(0)))
      // total YFL on NFT contract
      assert.isTrue(ether('1').eq(await this.yfl.balanceOf(await this.yflart.address)))
      // NFT is funded
      assert.isTrue(await this.yflart.isFunded(0))
      // YFL spent from user
      assert.isTrue(ether('99').eq(await this.yfl.balanceOf(user1)))
    })

    context('when resold', () => {
      beforeEach(async () => {
        await this.yfl.approve(this.yflart.address, ether('1'), { from: user1 })
        await this.paymentToken.approve(this.yflart.address, ether('1'), { from: user1 })
        await this.yflart.register(0, 'test', user1, artist, this.paymentToken.address, ether('1'), ether('1'), { from: deployer })
        await this.yflart.buy(0, { from: user1 })
        await this.yflart.approve(this.yflart.address, 0, { from: user1 })
        await this.yflart.resell(
          0,
          this.paymentToken.address,
          ether('.1'),
          { from: user1 }
        )
      })

      it('should buy', async () => {
        await this.paymentToken.approve(this.yflart.address, ether('.1'), { from: user2 })
        await this.yfl.approve(this.yflart.address, ether('1'), { from: user2 })
        assert.isTrue(ether('.2').eq(await this.paymentToken.balanceOf(artist)))
        assert.isTrue(ether('.8').eq(await this.paymentToken.balanceOf(treasury)))
        assert.isTrue(ether('99').eq(await this.paymentToken.balanceOf(user1)))
        await this.yflart.buy(0, { from: user2 })
        assert.equal(user2, await this.yflart.ownerOf(0))
        assert.isTrue(ether('.205').eq(await this.paymentToken.balanceOf(artist)))
        assert.isTrue(ether('.805').eq(await this.paymentToken.balanceOf(treasury)))
        assert.isTrue(ether('99.09').eq(await this.paymentToken.balanceOf(user1)))
      })
    })
  })

  describe('transferFrom', () => {
    beforeEach(async () => {
      await this.yflart.register(0, 'test', user1, artist, this.paymentToken.address, 0, ether('1'), { from: deployer })
      await this.yfl.approve(this.yflart.address, ether('1'), { from: user1 })
      await this.yflart.buy(0, { from: user1 })
    })

    it('should transfer from the owner to the new user', async () => {
      assert.equal(user1, await this.yflart.ownerOf(0))
      await this.yflart.transferFrom(user1, user2, 0, { from: user1 })
      assert.equal(user2, await this.yflart.ownerOf(0))
    })

    it('should work with contracts', async () => {
      assert.equal(user1, await this.yflart.ownerOf(0))
      // sending NFT to a contract must approve the contract first
      await this.yflart.approve(this.market.address, 0, { from: user1 })
      await this.market.deposit(0, { from: user1 })
      assert.equal(this.market.address, await this.yflart.ownerOf(0))
      await this.market.purchase(0, { from: user2 })
      assert.equal(user2, await this.yflart.ownerOf(0))
    })
  })

  describe('stake', () => {
    beforeEach(async () => {
      await this.yfl.approve(this.yflart.address, ether('1'), { from: user1 })
      await this.paymentToken.approve(this.yflart.address, ether('1'), { from: user1 })
      await this.yflart.register(0, 'test', user1, artist, this.paymentToken.address, ether('1'), ether('1'), { from: deployer })
      await this.yflart.buy(0, { from: user1 })
    })

    it('should stake', async () => {
      await this.yflart.stake(0, { from: user1 })
      // user receives yYFL
      assert.isTrue(ether('1').eq(await this.yyfl.balanceOf(user1)))
      // yYFL receives YFL
      assert.isTrue(ether('1').eq(await this.yfl.balanceOf(this.yyfl.address)))
      // user retains NFT
      assert.equal(1, await this.yflart.balanceOf(user1))
      // NFT is not funded
      assert.isFalse(await this.yflart.isFunded(0))
      assert.isTrue(ether('0').eq(await this.yfl.balanceOf(await this.yflart.address)))
      // transferring unfunded NFTs requires approval for YFL to move with it
      await expectRevert(
        this.yflart.transferFrom(user1, user2, 0, { from: user1 }),
        'ERC20: transfer amount exceeds allowance.'
      )
      await this.yfl.approve(this.yflart.address, ether('1'), { from: user1 })
      await this.yflart.transferFrom(user1, user2, 0, { from: user1 })
      // transferring NFTs after approving YFLArt to spend YFL moves YFL with the NFT
      assert.isTrue(await this.yflart.isFunded(0))
      assert.isTrue(ether('1').eq(await this.yfl.balanceOf(await this.yflart.address)))
      assert.equal(0, await this.yflart.balanceOf(user1))
      assert.equal(1, await this.yflart.balanceOf(user2))
    })
  })

  describe('resell', () => {
    beforeEach(async () => {
      await this.yfl.approve(this.yflart.address, ether('1'), { from: user1 })
      await this.paymentToken.approve(this.yflart.address, ether('1'), { from: user1 })
      await this.yflart.register(0, 'test', user1, artist, this.paymentToken.address, ether('1'), ether('1'), { from: deployer })
      await this.yflart.buy(0, { from: user1 })
    })

    it('should resell', async () => {
      // user must approve NFT to spend NFT
      await this.yflart.approve(this.yflart.address, 0, { from: user1 })
      assert.isTrue(await this.yflart.isFunded(0))
      assert.equal(user1, await this.yflart.ownerOf(0))
      await this.yflart.resell(
        0,
        this.paymentToken.address,
        ether('.1'),
        { from: user1 }
      )
      assert.isTrue(ether('0').eq(await this.yfl.balanceOf(this.yflart.address)))
      assert.isFalse(await this.yflart.isFunded(0))
      assert.equal(this.yflart.address, await this.yflart.ownerOf(0))
    })

    context('when YFL is staked', () => {
      beforeEach(async () =>{
        await this.yflart.stake(0, { from: user1 })
      })

      it('should resell', async () => {
        assert.isFalse(await this.yflart.isFunded(0))
        await this.yfl.approve(this.yflart.address, ether('1'), { from: user1 })
        await this.yflart.resell(
          0,
          this.paymentToken.address,
          ether('.1'),
          { from: user1 }
        )
        assert.isTrue(ether('0').eq(await this.yfl.balanceOf(this.yflart.address)))
        assert.isFalse(await this.yflart.isFunded(0))
        assert.equal(this.yflart.address, await this.yflart.ownerOf(0))
      })
    })
  })

  describe('fund', () => {
    beforeEach(async () => {
      await this.yfl.approve(this.yflart.address, ether('1'), { from: user1 })
      await this.paymentToken.approve(this.yflart.address, ether('1'), { from: user1 })
      await this.yflart.register(0, 'test', user1, artist, this.paymentToken.address, ether('1'), ether('1'), { from: deployer })
      await this.yflart.buy(0, { from: user1 })
      await this.yflart.stake(0, { from: user1 })
    })

    it('should fund a NFT', async () => {
      assert.isFalse(await this.yflart.isFunded(0))
      // users cannot transfer unfunded NFTs
      await expectRevert(
        this.yflart.transferFrom(user1, user2, 0, { from: user1 }),
        'ERC20: transfer amount exceeds allowance.'
      )
      // users must approve the YFLArt contract to spend YFL
      await expectRevert(
        this.yflart.fund(0, { from: user1 }),
        'ERC20: transfer amount exceeds allowance.'
      )
      await this.yfl.approve(this.yflart.address, ether('1'), { from: user1 })
      // the NFT must exist
      await expectRevert(
        this.yflart.fund(1, { from: user1 }),
        '!exists'
      )
      await this.yflart.fund(0, { from: user1 })
      assert.isTrue(await this.yflart.isFunded(0))
    })
  })

  describe('recoverStuckTokens', () => {
    beforeEach(async () => {
      await this.yfl.approve(this.yflart.address, ether('1'), { from: user1 })
      await this.paymentToken.approve(this.yflart.address, ether('1'), { from: user1 })
      await this.yflart.register(0, 'test', user1, artist, this.paymentToken.address, ether('1'), ether('1'), { from: deployer })
      await this.yflart.buy(0, { from: user1 })
    })

    it('should recover stuck tokens', async () => {
      assert.isTrue(ether('1').eq(await this.yfl.balanceOf(this.yflart.address)))
      await this.yfl.transfer(this.yflart.address, ether('1'))
      assert.isTrue(ether('2').eq(await this.yfl.balanceOf(this.yflart.address)))
      // cannot take from locked YFL
      await expectRevert(
        this.yflart.recoverStuckTokens(this.yfl.address, deployer, ether('2'), { from: deployer }),
        '!_amount'
      )
      await this.yflart.recoverStuckTokens(this.yfl.address, deployer, ether('1'), { from: deployer })
      assert.isTrue(ether('1').eq(await this.yfl.balanceOf(this.yflart.address)))
      // any other token on the NFT contract shouldn't be there
      await this.paymentToken.transfer(this.yflart.address, ether('1'))
      assert.isTrue(ether('1').eq(await this.paymentToken.balanceOf(this.yflart.address)))
      await this.yflart.recoverStuckTokens(this.paymentToken.address, deployer, ether('1'), { from: deployer })
      assert.isTrue(ether('0').eq(await this.paymentToken.balanceOf(this.yflart.address)))
    })
  })

  describe('addSigner', () => {
    it('should add a signer', async () => {
      // deployer can add signers
      assert.isTrue(await this.yflart.isSigner(deployer))
      assert.isFalse(await this.yflart.isSigner(user1))
      await this.yflart.addSigner(user1)
      assert.isTrue(await this.yflart.isSigner(user1))
      // added signer can add signer
      assert.isFalse(await this.yflart.isSigner(user2))
      await this.yflart.addSigner(user2, { from: user1 })
      assert.isTrue(await this.yflart.isSigner(user2))
    })
  })
})
