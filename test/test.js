const { ethers, waffle } = require('hardhat');
const { BigNumber } = require('ethers');
const { expect } = require('chai');
const chai = require('chai');
const { time } = require('@openzeppelin/test-helpers');

const ZERO = BigNumber.from('0');
const ONE = BigNumber.from('1');
const TWO = BigNumber.from('2');
const THREE = BigNumber.from('3');
const FOUR = BigNumber.from('4');
const FIVE = BigNumber.from('5');
const SEVEN = BigNumber.from('7');
const TEN = BigNumber.from('10');
const HUNDRED = BigNumber.from('100');
const THOUSAND = BigNumber.from('1000');


const ONE_ETH = ethers.utils.parseEther('1');

//const TOTALSUPPLY = ethers.utils.parseEther('1000000000');    
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';

const NO_COSTMANAGER = ZERO_ADDRESS;

describe("Test", function () {
    const accounts = waffle.provider.getWallets();
    const owner = accounts[0];                     
    const alice = accounts[1];
    const bob = accounts[2];
    const charlie = accounts[3];
    const david = accounts[4];
    const recipient = accounts[5];
    
    
    describe("factory produce", function () {
        const salt    = "0x00112233445566778899AABBCCDDEEFF00000000000000000000000000000000";
        const salt2   = "0x00112233445566778899AABBCCDDEEFF00000000000000000000000000000001";

        var SubscriptionsManager;
        var SubscriptionsManagerFactory;
        var SubscriptionsManagerImpl;
        
        //var CommunityMock;
        var releaseManager;
        var erc20;
        var p;

        beforeEach("deploying", async() => {
            let ReleaseManagerFactoryF = await ethers.getContractFactory("MockReleaseManagerFactory");
            let ReleaseManagerF = await ethers.getContractFactory("MockReleaseManager");
            
            //CommunityMockF = await ethers.getContractFactory("CommunityMock");    
            
            let implementationReleaseManager    = await ReleaseManagerF.deploy();

            let releaseManagerFactory   = await ReleaseManagerFactoryF.connect(owner).deploy(implementationReleaseManager.address);
            let tx,rc,event,instance,instancesCount;
            //
            tx = await releaseManagerFactory.connect(owner).produce();
            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.events.find(event => event.event === 'InstanceProduced');
            [instance, instancesCount] = event.args;
            releaseManager = await ethers.getContractAt("MockReleaseManager",instance);

            let SubscriptionsManagerFactoryF = await ethers.getContractFactory("MockSubscriptionsManagerFactory");
            let SubscriptionsManagerF = await ethers.getContractFactory("SubscriptionsManagerUpgradeable");

            SubscriptionsManagerImpl = await SubscriptionsManagerF.connect(owner).deploy();
            SubscriptionsManagerFactory = await SubscriptionsManagerFactoryF.connect(owner).deploy(SubscriptionsManagerImpl.address, NO_COSTMANAGER, releaseManager.address);

            // 
            const factoriesList = [SubscriptionsManagerFactory.address];
            const factoryInfo = [
                [
                    1,//uint8 factoryIndex; 
                    1,//uint16 releaseTag; 
                    "0x53696c766572000000000000000000000000000000000000"//bytes24 factoryChangeNotes;
                ]
            ];

            await releaseManager.connect(owner).newRelease(factoriesList, factoryInfo);

            let ERC20Factory = await ethers.getContractFactory("ERC20Mintable");
            erc20 = await ERC20Factory.deploy("ERC20 Token", "ERC20");

            p = [
                86400, //uint32 interval,
                20, //uint16 intervalsMax,
                1, //uint16 intervalsMin,
                3, //uint8 retries,
                erc20.address, //address token,
                ONE_ETH, //uint256 price,
                ZERO_ADDRESS, //address controller,
                recipient.address, //address recipient,
                false //bool recipientImplementsHooks
            ];
            
            // rc = await tx.wait(); // 0ms, as tx is already confirmed
            // event = rc.events.find(event => event.event === 'InstanceCreated');
            // [instance, instancesCount] = event.args;
            // SubscriptionsManager = await ethers.getContractAt("SubscriptionsManager",instance);
        });

        it("should produce", async() => {

            let tx = await SubscriptionsManagerFactory.connect(owner).produce(...p);

            const rc = await tx.wait(); // 0ms, as tx is already confirmed
            const event = rc.events.find(event => event.event === 'InstanceCreated');
            const [instance,] = event.args;
            expect(instance).not.to.be.eq(ZERO_ADDRESS);
            
        });
        
        it("should produce deterministic", async() => {
            p = [salt, ...p]; // prepend salt into params as first param
            let tx = await SubscriptionsManagerFactory.connect(owner).produceDeterministic(...p);

            let rc = await tx.wait(); // 0ms, as tx is already confirmed
            let event = rc.events.find(event => event.event === 'InstanceCreated');
            let [instance,] = event.args;
            
            await expect(SubscriptionsManagerFactory.connect(owner).produceDeterministic(...p)).to.be.revertedWith('ERC1167: create2 failed');

        });

        it("can't create2 if created before with the same salt, even if different sender", async() => {
            let tx,event,instanceWithSaltAgain, instanceWithSalt, instanceWithSalt2;

            //make snapshot
            let snapId = await ethers.provider.send('evm_snapshot', []);
            let p1 =[salt, ...p]; // prepend salt into params as first param
            tx = await SubscriptionsManagerFactory.connect(owner).produceDeterministic(...p1);
            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.events.find(event => event.event === 'InstanceCreated');
            [instanceWithSalt,] = event.args;
            //revert snapshot
            await ethers.provider.send('evm_revert', [snapId]);

            let p2 =[salt2, ...p]; // prepend salt into params as first param
            // make create2. then create and finally again with salt. 
            tx = await SubscriptionsManagerFactory.connect(owner).produceDeterministic(...p2);
            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.events.find(event => event.event === 'InstanceCreated');
            [instanceWithSalt2,] = event.args;
            
            await SubscriptionsManagerFactory.connect(owner).produce(...p);

            tx = await SubscriptionsManagerFactory.connect(owner).produceDeterministic(...p1);
            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.events.find(event => event.event === 'InstanceCreated');
            [instanceWithSaltAgain,] = event.args;


            expect(instanceWithSaltAgain).to.be.eq(instanceWithSalt);
            expect(instanceWithSalt2).not.to.be.eq(instanceWithSalt);

            await expect(SubscriptionsManagerFactory.connect(owner).produceDeterministic(...p1)).to.be.revertedWith('ERC1167: create2 failed');
            await expect(SubscriptionsManagerFactory.connect(owner).produceDeterministic(...p2)).to.be.revertedWith('ERC1167: create2 failed');
            await expect(SubscriptionsManagerFactory.connect(alice).produceDeterministic(...p2)).to.be.revertedWith('ERC1167: create2 failed');
            
        });

        it("shouldnt initialize again", async() => {
            let tx, rc, event, instance, instancesCount;
            tx = await SubscriptionsManagerFactory.connect(owner).produce(...p);

            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.events.find(event => event.event === 'InstanceCreated');
            [instance,] = event.args;
            
            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.events.find(event => event.event === 'InstanceCreated');
            [instance, instancesCount] = event.args;
            let subscriptionsManager = await ethers.getContractAt("SubscriptionsManagerUpgradeable",instance);

            let p1 =[...p, ZERO_ADDRESS, ZERO_ADDRESS]; // prepend salt into params as first param
            await expect(
                subscriptionsManager.connect(owner).initialize(...p1)
            ).to.be.revertedWith('Initializable: contract is already initialized');

        });

        it("shouldnt initialize implementation", async() => {
            
            let p1 =[...p, ZERO_ADDRESS, ZERO_ADDRESS]; // prepend salt into params as first param
            await expect(
                SubscriptionsManagerImpl.connect(owner).initialize(...p1)
            ).to.be.revertedWith('Initializable: contract is already initialized');
            
        });

        it("controller must be optional(zero) overwise must be in out ecosystem", async() => {
            await SubscriptionsManagerFactory.connect(owner).produce(...p);
            let pWithWrongController;
            
            pWithWrongControllerAsEOAUser = [
                86400, 20, 1, 3, erc20.address, ONE_ETH,
                recipient.address, //address controller,
                recipient.address, false
            ];
            await expect(
                SubscriptionsManagerFactory.connect(owner).produce(...pWithWrongControllerAsEOAUser)
            ).to.be.revertedWith(`UnauthorizedContract("${recipient.address}")`);

            pWithWrongControllerAsERC20 = [
                86400, 20, 1, 3, erc20.address, ONE_ETH,
                erc20.address, //address controller,
                recipient.address, false
            ];
            await expect(
                SubscriptionsManagerFactory.connect(owner).produce(...pWithWrongControllerAsERC20)
            ).to.be.revertedWith(`UnauthorizedContract("${erc20.address}")`);

        });

        it("instancesCount shoud be increase after produce", async() => {
            let beforeProduce = await SubscriptionsManagerFactory.instancesCount();
            await SubscriptionsManagerFactory.connect(owner).produce(...p);
            let afterProduce = await SubscriptionsManagerFactory.instancesCount();
            expect(afterProduce).to.be.eq(beforeProduce.add(ONE))
        });

        it("should registered instance in release manager", async() => {
            let tx, rc, event, instance;
            tx = await SubscriptionsManagerFactory.connect(owner).produce(...p);

            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.events.find(event => event.event === 'InstanceCreated');
            [instance,] = event.args;
            
            let success = await releaseManager.checkInstance(instance);
            expect(success).to.be.true;
            let notSuccess = await releaseManager.checkInstance(erc20.address);
            expect(notSuccess).to.be.false;
        });

        it("should revert if call charge any contract expect factory instances", async() => {
            let MockSubscriptionsManagerChargeTestF = await ethers.getContractFactory("MockSubscriptionsManagerChargeTest");
            let MockSubscriptionsManagerChargeTest = await MockSubscriptionsManagerChargeTestF.connect(owner).deploy();

            // call from contract
            await expect(
                MockSubscriptionsManagerChargeTest.connect(owner).chargeMock(
                    SubscriptionsManagerFactory.address,
                    erc20.address,
                    ONE_ETH,
                    alice.address,
                    bob.address
                )
            ).to.be.revertedWith(`OnlyInstances()`);

            // call directly
            await expect(
                SubscriptionsManagerFactory.connect(owner).doCharge(
                    erc20.address,
                    ONE_ETH,
                    alice.address,
                    bob.address
                )
            ).to.be.revertedWith(`OnlyInstances()`);
        
        });

        it("shouldnt revert tx when call charge", async() => {
            let MockSubscriptionsManagerChargeTestF = await ethers.getContractFactory("MockSubscriptionsManagerChargeTest");
            let MockSubscriptionsManagerChargeTest = await MockSubscriptionsManagerChargeTestF.connect(owner).deploy();

            await SubscriptionsManagerFactory.addIntoInstances(MockSubscriptionsManagerChargeTest.address);
            
            await MockSubscriptionsManagerChargeTest.connect(owner).chargeMock(
                SubscriptionsManagerFactory.address,
                erc20.address,
                ONE_ETH,
                alice.address,
                bob.address
            );

            let success = await MockSubscriptionsManagerChargeTest.viewState();
            expect(success).to.be.false; // 

            
        });

        it("should correct charge", async() => {
            let MockSubscriptionsManagerChargeTestF = await ethers.getContractFactory("MockSubscriptionsManagerChargeTest");
            let MockSubscriptionsManagerChargeTest = await MockSubscriptionsManagerChargeTestF.connect(owner).deploy();

            await SubscriptionsManagerFactory.addIntoInstances(MockSubscriptionsManagerChargeTest.address);
            
            let amountToCharge = ONE_ETH;
            await erc20.connect(owner).mint(alice.address, amountToCharge);
            await erc20.connect(alice).approve(SubscriptionsManagerFactory.address, amountToCharge);
            
            let aliceBalanceBefore,bobBalanceBefore,aliceBalanceAfter,bobBalanceAfter;
            aliceBalanceBefore = await erc20.balanceOf(alice.address);
            bobBalanceBefore = await erc20.balanceOf(bob.address);
            await MockSubscriptionsManagerChargeTest.connect(owner).chargeMock(
                SubscriptionsManagerFactory.address,
                erc20.address,
                amountToCharge,
                alice.address,
                bob.address
            );
            aliceBalanceAfter = await erc20.balanceOf(alice.address);
            bobBalanceAfter = await erc20.balanceOf(bob.address);

            let success = await MockSubscriptionsManagerChargeTest.viewState();
            expect(success).to.be.true; // 

            // balances should be correct also
            expect(aliceBalanceBefore.sub(aliceBalanceAfter)).to.be.eq(amountToCharge);
            expect(bobBalanceAfter.sub(bobBalanceBefore)).to.be.eq(amountToCharge);

            
        });
    });

/*
    describe("instance checks", function () {
        var SubscriptionsManager;
        //var CommunityMock;
        var erc20;
        
        var CostManagerBad, CostManagerGood;
        beforeEach("deploying", async() => {
            let ReleaseManagerFactoryF = await ethers.getContractFactory("MockReleaseManagerFactory");
            let ReleaseManagerF = await ethers.getContractFactory("MockReleaseManager");
            
            //CommunityMockF = await ethers.getContractFactory("CommunityMock");    
            
            let implementationReleaseManager    = await ReleaseManagerF.deploy();

            let releaseManagerFactory   = await ReleaseManagerFactoryF.connect(owner).deploy(implementationReleaseManager.address);
            let tx,rc,event,instance,instancesCount;
            //
            tx = await releaseManagerFactory.connect(owner).produce();
            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.events.find(event => event.event === 'InstanceProduced');
            [instance, instancesCount] = event.args;
            let releaseManager = await ethers.getContractAt("MockReleaseManager",instance);

            let SubscriptionsManagerFactoryF = await ethers.getContractFactory("SubscriptionsManagerFactory");
            let SubscriptionsManagerF = await ethers.getContractFactory("SubscriptionsManager");

            let SubscriptionsManagerImpl = await SubscriptionsManagerF.connect(owner).deploy();
            let SubscriptionsManagerFactory = await SubscriptionsManagerFactoryF.connect(owner).deploy(SubscriptionsManagerImpl.address, NO_COSTMANAGER, releaseManager.address);

            // 
            const factoriesList = [SubscriptionsManagerFactory.address];
            const factoryInfo = [
                [
                    1,//uint8 factoryIndex; 
                    1,//uint16 releaseTag; 
                    "0x53696c766572000000000000000000000000000000000000"//bytes24 factoryChangeNotes;
                ]
            ];

            await releaseManager.connect(owner).newRelease(factoriesList, factoryInfo);

            let ERC20Factory = await ethers.getContractFactory("ERC20Mintable");
            erc20 = await ERC20Factory.deploy("ERC20 Token", "ERC20");

            let p = [
                86400, //uint32 interval,
                20, //uint16 intervalsMax,
                1, //uint16 intervalsMin,
                3, //uint8 retries,
                erc20.address, //address token,
                ONE_ETH, //uint256 price,
                ZERO_ADDRESS, //address controller,
                recipient.address, //address recipient,
                false //bool recipientImplementsHooks
            ];

            tx = await SubscriptionsManagerFactory.connect(owner).produce(
                ...p
            );
            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.events.find(event => event.event === 'InstanceCreated');
            [instance, instancesCount] = event.args;
            SubscriptionsManager = await ethers.getContractAt("SubscriptionsManager",instance);
        });

        it('test', async () => {
            expect(true).to.be.eq(true);
        });
    });
    */
    // setup useful vars
    
    


/*
    it('validate input params', async () => {
        
        //['sub-admins','members']
        await expect(
            ControlContractFactory.connect(owner).produce(ZERO_ADDRESS, [[1,2]])
        ).to.be.revertedWith("EmptyCommunityAddress()");

        await expect(
            ControlContractFactory.connect(owner).produce(CommunityMock.address, [])
        ).to.be.revertedWith("NoGroups()");

        //['sub-admins','members'],['admins','sub-admins']
        await expect(
            ControlContractFactory.connect(owner).produce(CommunityMock.address, [[1,2],[3,1]])
        ).to.be.revertedWith("RolesExistsOrInvokeEqualEndorse()");

    });

    it('factory instances count', async () => {

        let instancesCountBefore = await ControlContractFactory.instancesCount();

        await ControlContractFactory.connect(owner).produce(CommunityMock.address, [[1,2]]);
        await ControlContractFactory.connect(owner).produce(CommunityMock.address, [[3,4]]);
        await ControlContractFactory.connect(owner).produce(CommunityMock.address, [[5,6]]);
        
        let instancesCountAfter = await ControlContractFactory.instancesCount();
        expect(
            BigNumber.from(instancesCountAfter).sub(BigNumber.from(instancesCountBefore))
        ).to.be.eq(THREE);
    });

    describe("ControlContract tests", function () {
    
        describe("simple test methods", function () {
            var ControlContract;
            //var CommunityFactory;
            beforeEach("deploying", async() => {

                let tx,rc,event,instance,instancesCount;
                //
                tx = await ControlContractFactory.connect(owner).produce(CommunityMock.address, [[rolesIndex.get('sub-admins'),rolesIndex.get('members')]]);
                rc = await tx.wait(); // 0ms, as tx is already confirmed
                event = rc.events.find(event => event.event === 'InstanceCreated');
                [instance, instancesCount] = event.args;
                ControlContract = await ethers.getContractAt("ControlContractMock",instance);

            });

            it('with no params', async () => {
                
                await CommunityMock.setRoles(accountOne.address, [rolesIndex.get('sub-admins')]);
                await CommunityMock.setRoles(accountTwo.address, [rolesIndex.get('members')]);
                await CommunityMock.setRoles(accountThree.address, [rolesIndex.get('members')]);
                
                var SomeExternalMockF = await ethers.getContractFactory("SomeExternalMock");
                var SomeExternalMock = await SomeExternalMockF.connect(owner).deploy();

                var counterBefore = await SomeExternalMock.viewCounter();
                
                let funcHexademicalStr = await SomeExternalMock.returnFuncSignatureHexadecimalString();
                // await ControlContractInstance.allowInvoke('sub-admins',SomeExternalMockInstance.address,funcHexademicalStr,{ from: accountTen });
                // await ControlContractInstance.allowEndorse('members',SomeExternalMockInstance.address,funcHexademicalStr,{ from: accountTen });
                await ControlContract.connect(owner).addMethod(
                    SomeExternalMock.address,
                    funcHexademicalStr,
                    rolesIndex.get('sub-admins'),
                    rolesIndex.get('members'),
                    2, //uint256 minimum,
                    1 //uint256 fraction
                    ,
                )
                var invokeID; 

                let tx,rc,event;

                tx = await ControlContract.connect(accountOne).invoke(
                    SomeExternalMock.address,
                    funcHexademicalStr,
                    '' //string memory params
                    ,
                );
                
                rc = await tx.wait(); // 0ms, as tx is already confirmed
                event = rc.events.find(event => event.event === 'OperationInvoked');
                //invokeID, invokeIDWei, tokenAddr, method, params
                [invokeID,,,,] = event.args;

                await ControlContract.connect(accountTwo).endorse(invokeID);
                await ControlContract.connect(accountThree).endorse(invokeID);
                
                var counterAfter = await SomeExternalMock.viewCounter();
                
                expect(counterAfter-counterBefore).to.be.eq(1);
                
            });


            it('with params (mint tokens)', async () => {
            
                await CommunityMock.setRoles(accountOne.address, [rolesIndex.get('sub-admins')]);
                await CommunityMock.setRoles(accountTwo.address, [rolesIndex.get('members')]);
                await CommunityMock.setRoles(accountThree.address, [rolesIndex.get('members')]);
                
                var ERC20MintableF = await ethers.getContractFactory("ERC20Mintable");
                var ERC20Mintable = await ERC20MintableF.connect(owner).deploy();
                await ERC20Mintable.connect(owner).init('t1','t1');

                await ERC20Mintable.connect(owner).transferOwnership(ControlContract.address);
                
                var counterBefore = await ERC20Mintable.balanceOf(accountFive.address);

                // transfer to accountFive 10 tokens    
                //0x40c10f19000000000000000000000000ea674fdde714fd979de3edf0f56aa9716b898ec80000000000000000000000000000000000000000000000008ac7230489e80000
                let funcHexademicalStr = '40c10f19';
                let memoryParamsHexademicalStr = '000000000000000000000000'+((accountFive.address).replace('0x',''))+'0000000000000000000000000000000000000000000000008ac7230489e80000';
                // await ControlContractInstance.allowInvoke('sub-admins',ERC20MintableInstance.address,funcHexademicalStr,{ from: accountTen });
                // await ControlContractInstance.allowEndorse('members',ERC20MintableInstance.address,funcHexademicalStr,{ from: accountTen });
                await ControlContract.connect(owner).addMethod(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    rolesIndex.get('sub-admins'),
                    rolesIndex.get('members'),
                    2, //uint256 minimum,
                    1 //uint256 fraction
                    ,
                )
                let tx,rc;
                var invokeID,invokeIDWei; 

                tx = await ControlContract.connect(accountOne).invoke(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    memoryParamsHexademicalStr //string memory params
                    ,
                );
                
                rc = await tx.wait(); // 0ms, as tx is already confirmed
                event = rc.events.find(event => event.event === 'OperationInvoked');
                //invokeID, invokeIDWei, tokenAddr, method, params
                [invokeID,invokeIDWei,,,] = event.args;

                await ControlContract.connect(accountTwo).endorse(invokeID);

                //await ControlContractInstance.endorse(invokeID, { from: accountThree });

                await expect(
                    accountTwo.sendTransaction({to: ControlContract.address, value: invokeIDWei, gasLimit:10000000})
                ).to.be.revertedWith(`TxAlreadyEndorced("${accountTwo.address}")`);

                await expect(
                    accountThree.sendTransaction({to: ControlContract.address, value: invokeIDWei+2, gasLimit:80000})
                ).to.be.revertedWith(`UnknownInvokeId(0)`);

                await accountThree.sendTransaction({to: ControlContract.address, value: invokeIDWei})
                
                
                var counterAfter = await ERC20Mintable.balanceOf(accountFive.address);

                expect(BigNumber.from(counterAfter).sub(BigNumber.from(counterBefore))).to.be.eq(TEN.mul(ONE_ETH));
                

            });

            it('itself call', async () => {

                await CommunityMock.setRoles(accountOne.address, [rolesIndex.get('sub-admins')]);
                await CommunityMock.setRoles(accountTwo.address, [rolesIndex.get('members')]);
                await CommunityMock.setRoles(accountThree.address, [rolesIndex.get('members')]);

                await expect(
                    ControlContract.setInsideVar(2)
                ).to.be.revertedWith("able to call from itself only");

                var insideVarBefore = await ControlContract.getInsideVar();

                // call test mock method setInsideVar(uint256 i) 
                // 0xfdf172c20000000000000000000000000000000000000000000000000000000000000002
                // setInsideVar(2)
                let funcHexademicalStr = 'fdf172c2';
                let memoryParamsHexademicalStr = '0000000000000000000000000000000000000000000000000000000000000002';

                await ControlContract.connect(owner).addMethod(
                    ControlContract.address,
                    funcHexademicalStr,
                    rolesIndex.get('sub-admins'),
                    rolesIndex.get('members'),
                    2, //uint256 minimum,
                    1 //uint256 fraction
                    ,
                )
                let tx,rc;
                var invokeID,invokeIDWei; 

                tx = await ControlContract.connect(accountOne).invoke(
                    ControlContract.address,
                    funcHexademicalStr,
                    memoryParamsHexademicalStr //string memory params
                    ,
                );
                
                rc = await tx.wait(); // 0ms, as tx is already confirmed
                event = rc.events.find(event => event.event === 'OperationInvoked');
                //invokeID, invokeIDWei, tokenAddr, method, params
                [invokeID,invokeIDWei,,,] = event.args;

                await ControlContract.connect(accountTwo).endorse(invokeID);

                await accountThree.sendTransaction({to: ControlContract.address, value: invokeIDWei, gasLimit:10000000})
                
                var insideVarAfter = await ControlContract.getInsideVar();

                expect(insideVarBefore).to.be.eq(ZERO);
                expect(insideVarAfter).to.be.eq(TWO);
                

            });

        });

        describe("example transferownersip", function () {
            var ControlContract;
            var groupTimeoutActivity;
            var ERC20Mintable;
            var funcHexademicalStr;
            var memoryParamsHexademicalStr;

            var tx,rc,event,instance,instancesCount;
            //var CommunityFactory;
            beforeEach("deploying", async() => {

                let ControlContractMockF = await ethers.getContractFactory("ControlContractMock");    
                var ControlContractMockImpl = await ControlContractMockF.connect(owner).deploy();
                

                await CommunityMock.setRoles(accountOne.address, [rolesIndex.get('group1_can_invoke')]);
                await CommunityMock.setRoles(accountTwo.address, [rolesIndex.get('group1_can_endorse')]);
                await CommunityMock.setRoles(accountThree.address, [rolesIndex.get('group1_can_endorse')]);

                const ReleaseManagerFactoryF = await ethers.getContractFactory("MockReleaseManagerFactory");
                const ReleaseManagerF = await ethers.getContractFactory("MockReleaseManager");

                let implementationReleaseManager    = await ReleaseManagerF.deploy();
                let releaseManagerFactory   = await ReleaseManagerFactoryF.connect(owner).deploy(implementationReleaseManager.address);
                let tx,rc,event,instance,instancesCount;
                //
                tx = await releaseManagerFactory.connect(owner).produce();
                rc = await tx.wait(); // 0ms, as tx is already confirmed
                event = rc.events.find(event => event.event === 'InstanceProduced');
                [instance, instancesCount] = event.args;
                let releaseManager = await ethers.getContractAt("MockReleaseManager",instance);
                
                let ControlContractFactoryMock = await ControlContractFactoryF.connect(owner).deploy(ControlContractMockImpl.address, NO_COSTMANAGER, releaseManager.address);
                
                // 
                const factoriesList = [ControlContractFactoryMock.address];
                const factoryInfo = [
                    [
                        1,//uint8 factoryIndex; 
                        1,//uint16 releaseTag; 
                        "0x53696c766572000000000000000000000000000000000000"//bytes24 factoryChangeNotes;
                    ]
                ];

                await releaseManager.connect(owner).newRelease(factoriesList, factoryInfo);
                //-------------------------------------------------

                //
                tx = await ControlContractFactoryMock.connect(owner).produce(CommunityMock.address, [[rolesIndex.get('group1_can_invoke'),rolesIndex.get('group1_can_endorse')]]);
                rc = await tx.wait(); // 0ms, as tx is already confirmed
                event = rc.events.find(event => event.event === 'InstanceCreated');
                [instance, instancesCount] = event.args;
                ControlContract = await ethers.getContractAt("ControlContractMock",instance);

                groupTimeoutActivity = await ControlContract.getGroupTimeoutActivity();

                
                var ERC20MintableF = await ethers.getContractFactory("ERC20Mintable");
                ERC20Mintable = await ERC20MintableF.connect(owner).deploy();
                await ERC20Mintable.connect(owner).init('t1','t1');
                await ERC20Mintable.connect(owner).transferOwnership(ControlContract.address);
                
                
                
                // change ownership of ERC20MintableInstance to accountFive
                // 0xf2fde38b000000000000000000000000ea674fdde714fd979de3edf0f56aa9716b898ec8
                            
                funcHexademicalStr = 'f2fde38b';
                memoryParamsHexademicalStr = '000000000000000000000000'+(accountFive.address.replace('0x',''));

            });

            it('change ownership of destination erc20 token', async () => {

                var oldOwnerOfErc20 = await ERC20Mintable.owner();

                await ControlContract.connect(owner).addMethod(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    rolesIndex.get('group1_can_invoke'),
                    rolesIndex.get('group1_can_endorse'),
                    2, //uint256 minimum,
                    1 //uint256 fraction
                    ,
                )
                
                tx = await ControlContract.connect(accountOne).invoke(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    memoryParamsHexademicalStr //string memory params
                    ,
                );
                
                var invokeID; 

                rc = await tx.wait(); // 0ms, as tx is already confirmed
                event = rc.events.find(event => event.event === 'OperationInvoked');
                //invokeID, invokeIDWei, tokenAddr, method, params
                [invokeID,,,,] = event.args;

                await ControlContract.connect(accountTwo).endorse(invokeID);
                await ControlContract.connect(accountThree).endorse(invokeID);
                
                var newOwnerOfErc20 = await ERC20Mintable.owner();
                
                expect(oldOwnerOfErc20).not.to.be.eq(accountFive.address);
                expect(newOwnerOfErc20).to.be.eq(accountFive.address);
                //assert.equal(accountFive, newOwnerOfErc20,'can\'t change ownership');

            });
        }); 

        describe("time tests", function () {
            var ControlContract;
            var groupTimeoutActivity;
            var ERC20Mintable;
            var funcHexademicalStr;
            var memoryParamsHexademicalStr;

            //var CommunityFactory;
            beforeEach("deploying", async() => {

                let ControlContractMockF = await ethers.getContractFactory("ControlContractMock");    
                var ControlContractMockImpl = await ControlContractMockF.connect(owner).deploy();

                await CommunityMock.setRoles(accountOne.address, [rolesIndex.get('group1_can_invoke')]);
                await CommunityMock.setRoles(accountTwo.address, [rolesIndex.get('group1_can_endorse')]);
                await CommunityMock.setRoles(accountThree.address, [rolesIndex.get('group2_can_invoke')]);
                await CommunityMock.setRoles(accountFourth.address, [rolesIndex.get('group2_can_endorse')]);
                
                let tx,rc,event,instance,instancesCount;
                const ReleaseManagerFactoryF = await ethers.getContractFactory("MockReleaseManagerFactory");
                const ReleaseManagerF = await ethers.getContractFactory("MockReleaseManager");

                let implementationReleaseManager    = await ReleaseManagerF.deploy();
                let releaseManagerFactory   = await ReleaseManagerFactoryF.connect(owner).deploy(implementationReleaseManager.address);
                
                //
                tx = await releaseManagerFactory.connect(owner).produce();
                rc = await tx.wait(); // 0ms, as tx is already confirmed
                event = rc.events.find(event => event.event === 'InstanceProduced');
                [instance, instancesCount] = event.args;
                let releaseManager = await ethers.getContractAt("MockReleaseManager",instance);
                
                let ControlContractFactoryMock = await ControlContractFactoryF.connect(owner).deploy(ControlContractMockImpl.address, NO_COSTMANAGER, releaseManager.address);

                // 
                const factoriesList = [ControlContractFactoryMock.address];
                const factoryInfo = [
                    [
                        1,//uint8 factoryIndex; 
                        1,//uint16 releaseTag; 
                        "0x53696c766572000000000000000000000000000000000000"//bytes24 factoryChangeNotes;
                    ]
                ];

                await releaseManager.connect(owner).newRelease(factoriesList, factoryInfo);
                //-------------------------------------------------
                
                //
                tx = await ControlContractFactoryMock.connect(owner).produce(CommunityMock.address, [[rolesIndex.get('group1_can_invoke'),rolesIndex.get('group1_can_endorse')], [rolesIndex.get('group2_can_invoke'),rolesIndex.get('group2_can_endorse')]]);
                rc = await tx.wait(); // 0ms, as tx is already confirmed
                event = rc.events.find(event => event.event === 'InstanceCreated');
                [instance, instancesCount] = event.args;
                ControlContract = await ethers.getContractAt("ControlContractMock",instance);

                groupTimeoutActivity = await ControlContract.getGroupTimeoutActivity();

                
                var ERC20MintableF = await ethers.getContractFactory("ERC20Mintable");
                ERC20Mintable = await ERC20MintableF.connect(owner).deploy();
                await ERC20Mintable.connect(owner).init('t1','t1');
                await ERC20Mintable.connect(owner).transferOwnership(ControlContract.address);
                
                
                
                // transfer to accountFive 10 tokens    
                //0x40c10f19000000000000000000000000ea674fdde714fd979de3edf0f56aa9716b898ec80000000000000000000000000000000000000000000000008ac7230489e80000
                funcHexademicalStr = '40c10f19';
                memoryParamsHexademicalStr = '000000000000000000000000'+(accountFive.address.replace('0x',''))+'0000000000000000000000000000000000000000000000008ac7230489e80000';

            });

            it('group index', async () => {

                let groupIndex1 = await ControlContract.connect(owner).getExpectGroupIndex();

                await network.provider.send("evm_increaseTime", [parseInt(groupTimeoutActivity)+10]);
                await network.provider.send("evm_mine");

                let groupIndex2 = await ControlContract.connect(owner).getExpectGroupIndex();
                
                await network.provider.send("evm_increaseTime", [parseInt(groupTimeoutActivity)+10]);
                await network.provider.send("evm_mine");

                let groupIndex3 = await ControlContract.connect(owner).getExpectGroupIndex();

                await network.provider.send("evm_increaseTime", [parseInt(groupTimeoutActivity)+10]);
                await network.provider.send("evm_mine");

                let groupIndex4 = await ControlContract.connect(owner).getExpectGroupIndex();

                expect(groupIndex1).not.to.be.eq(groupIndex2);
                expect(groupIndex1+1).to.be.eq(groupIndex2);
                expect(groupIndex2).to.be.eq(groupIndex3);
                expect(groupIndex2).to.be.eq(groupIndex4);

            });

            it('heartbeat test', async () => {

                await ControlContract.connect(owner).addMethod(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    rolesIndex.get('group1_can_invoke'),
                    rolesIndex.get('group1_can_endorse'),
                    1, //uint256 minimum,
                    1 //uint256 fraction
                    ,
                )
                
                let rndMinium = 221;
                let rndFraction = 331;
                await expect(
                    ControlContract.connect(owner).addMethod(
                        ERC20Mintable.address,
                        funcHexademicalStr,
                        rolesIndex.get('group2_can_invoke'),
                        rolesIndex.get('group2_can_endorse'),
                        rndMinium, //uint256 minimum,
                        rndFraction //uint256 fraction
                        ,
                    )
                ).to.be.revertedWith(`MethodAlreadyRegistered("${funcHexademicalStr}", ${rndMinium}, ${rndFraction})`);
                
                await ControlContract.connect(owner).addMethod(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    rolesIndex.get('group2_can_invoke'),
                    rolesIndex.get('group2_can_endorse'),
                    1, //uint256 minimum,
                    1 //uint256 fraction
                    ,
                );
                
                var invokeID,invokeIDWei,currentGroupIndex; 
                await ControlContract.connect(accountOne).heartbeat();
                
                currentGroupIndex = await ControlContract.getCurrentGroupIndex();
                // now active is group1
                // group 2 can not endorse or invoke
                await expect(
                    ControlContract.connect(accountThree).invoke(
                        ERC20Mintable.address,
                        funcHexademicalStr,
                        memoryParamsHexademicalStr //string memory params
                        ,
                    )
                ).to.be.revertedWith(`SenderIsOutOfCurrentOwnerGroup("${accountThree.address}", ${currentGroupIndex})`);

                // pass groupTimeoutActivity = 30 days + extra seconds
                // NOTE: next transaction after advanceTimeAndBlock can be in block with +1or+0 seconds blocktimestamp. so in invoke we get the exact groupTimeoutActivity pass. in the end of period group is still have ownership.
                await network.provider.send("evm_increaseTime", [parseInt(groupTimeoutActivity)+10]);
                await network.provider.send("evm_mine");

                // and again
                await ControlContract.connect(accountThree).invoke(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    memoryParamsHexademicalStr //string memory params
                    ,
                );

                //return ownership by accountOne for group1
                await ControlContract.connect(accountOne).heartbeat();

                currentGroupIndex = await ControlContract.getCurrentGroupIndex();
                // now active is group1
                // group 2 can not endorse or invoke
                await expect(
                    ControlContract.connect(accountThree).invoke(
                        ERC20Mintable.address,
                        funcHexademicalStr,
                        memoryParamsHexademicalStr //string memory params
                        ,
                    )
                ).to.be.revertedWith(`SenderIsOutOfCurrentOwnerGroup("${accountThree.address}", ${currentGroupIndex})`);

                
            });

            it('changed ownership if first group did not send any transaction', async () => {
                
                await ControlContract.connect(owner).addMethod(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    rolesIndex.get('group1_can_invoke'),
                    rolesIndex.get('group1_can_endorse'),
                    1, //uint256 minimum,
                    1 //uint256 fraction
                    ,
                )
                await ControlContract.connect(owner).addMethod(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    rolesIndex.get('group2_can_invoke'),
                    rolesIndex.get('group2_can_endorse'),
                    1, //uint256 minimum,
                    1 //uint256 fraction
                    ,
                )

                let currentGroupIndex = await ControlContract.getCurrentGroupIndex();
                await expect(
                    ControlContract.connect(accountThree).invoke(
                        ERC20Mintable.address,
                        funcHexademicalStr,
                        memoryParamsHexademicalStr //string memory params
                        ,
                    )
                ).to.be.revertedWith(`SenderIsOutOfCurrentOwnerGroup("${accountThree.address}", ${currentGroupIndex})`);

                await network.provider.send("evm_increaseTime", [parseInt(groupTimeoutActivity)+10]);
                await network.provider.send("evm_mine");
                
                await ControlContract.connect(accountThree).invoke(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    memoryParamsHexademicalStr //string memory params
                    ,
                );

            });

            it('try to change ownership if first group got error via transaction', async () => {
        
                    
                await ControlContract.connect(owner).addMethod(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    rolesIndex.get('group1_can_invoke'),
                    rolesIndex.get('group1_can_endorse'),
                    1, //uint256 minimum,
                    1 //uint256 fraction
                    ,
                )
                await ControlContract.connect(owner).addMethod(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    rolesIndex.get('group2_can_invoke'),
                    rolesIndex.get('group2_can_endorse'),
                    1, //uint256 minimum,
                    1 //uint256 fraction
                    ,
                )

                await network.provider.send("evm_increaseTime", [parseInt(groupTimeoutActivity)+10]);
                await network.provider.send("evm_mine");
                
                await ControlContract.connect(accountThree).invoke(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    memoryParamsHexademicalStr //string memory params
                    ,
                );
                
                let invokeIDWeiWrong = 123123;
                await expect(
                    accountOne.sendTransaction({to: ControlContract.address, value: invokeIDWeiWrong})
                ).to.be.revertedWith(`UnknownInvokeId(0)`);

                await expect(
                    ControlContract.connect(accountTwo).endorse(invokeIDWeiWrong)
                ).to.be.revertedWith(`UnknownInvokeId(${invokeIDWeiWrong})`);

                // group2 membbers still owner of contract and still can invoke
                await ControlContract.connect(accountThree).invoke(
                    ERC20Mintable.address,
                    funcHexademicalStr,
                    memoryParamsHexademicalStr //string memory params
                    ,
                );
                
            });
            
        });
        
    });

    describe("Tokens Transfers", function () {
        var ControlContract;
        

        var MockERC20F,
            MockERC721F,
            MockERC777F,
            MockERC1155F,
            MockERC20,
            MockERC721,
            MockERC777,
            MockERC1155
        ;

        beforeEach("deploying", async() => {

            let tx,rc,event,instance,instancesCount;
            //
            tx = await ControlContractFactory.connect(owner).produce(CommunityMock.address, [[1,2]]);

            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.events.find(event => event.event === 'InstanceCreated');
            [instance, instancesCount] = event.args;
            ControlContract = await ethers.getContractAt("ControlContractMock",instance);

            MockERC20F = await ethers.getContractFactory("MockERC20");
            MockERC721F = await ethers.getContractFactory("MockERC721");
            MockERC777F = await ethers.getContractFactory("MockERC777");
            MockERC1155F = await ethers.getContractFactory("MockERC1155");

            MockERC20 = await MockERC20F.connect(owner).deploy("testname","testsymbol");
            MockERC721 = await MockERC721F.connect(owner).deploy("testname","testsymbol");
            MockERC777 = await MockERC777F.connect(owner).deploy("testname","testsymbol");
            MockERC1155 = await MockERC1155F.connect(owner).deploy();
        });
        
        it('ERC20: should obtain and send to some1', async () => {
            expect(await MockERC20.balanceOf(ControlContract.address)).to.be.eq(ZERO);
            //obtain
            await MockERC20.mint(ControlContract.address, ONE);
            expect(await MockERC20.balanceOf(ControlContract.address)).to.be.eq(ONE);
            //send
            await ControlContract.transferERC20(MockERC20.address, bob.address, ONE);
            expect(await MockERC20.balanceOf(bob.address)).to.be.eq(ONE);
            //
            expect(await MockERC20.balanceOf(ControlContract.address)).to.be.eq(ZERO);

        });
        it('ERC721: should obtain and send to some1', async () => {
            await expect(MockERC721.ownerOf(ONE)).to.be.revertedWith("ERC721: invalid token ID");
            //obtain
            await MockERC721.mint(ControlContract.address, ONE);
            expect(await MockERC721.ownerOf(ONE)).to.be.eq(ControlContract.address);
            //send
            await ControlContract.transferERC721(MockERC721.address, bob.address, ONE);
            expect(await MockERC721.ownerOf(ONE)).to.be.eq(bob.address);
        });

        it('ERC777: should obtain and send to some1', async () => {
            expect(await MockERC777.balanceOf(ControlContract.address)).to.be.eq(ZERO);
            //obtain
            await MockERC777.mint(ControlContract.address, ONE);
            expect(await MockERC777.balanceOf(ControlContract.address)).to.be.eq(ONE);
            //send
            await ControlContract.transferERC777(MockERC777.address, bob.address, ONE);
            expect(await MockERC777.balanceOf(bob.address)).to.be.eq(ONE);
            //
            expect(await MockERC777.balanceOf(ControlContract.address)).to.be.eq(ZERO);
        });
        it('ERC1155: should obtain and send to some1', async () => {

            expect(await MockERC1155.balanceOf(ControlContract.address, TWO)).to.be.eq(ZERO);
            //obtain
            await MockERC1155.mint(ControlContract.address, TWO, ONE);
            expect(await MockERC1155.balanceOf(ControlContract.address, TWO)).to.be.eq(ONE);
            //send
            await ControlContract.transferERC1155(MockERC1155.address, bob.address, TWO, ONE);
            expect(await MockERC1155.balanceOf(bob.address, TWO)).to.be.eq(ONE);
            //
            expect(await MockERC1155.balanceOf(ControlContract.address, TWO)).to.be.eq(ZERO);

        });
        
    });
*/

});
