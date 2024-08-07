const { expect } = require('chai');
const { time, loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
require("@nomicfoundation/hardhat-chai-matchers");

const ZERO = BigInt('0');
const ONE = BigInt('1');
const TWO = BigInt('2');
const THREE = BigInt('3');
const FOUR = BigInt('4');
const FIVE = BigInt('5');
const SEVEN = BigInt('7');
const TEN = BigInt('10');
const HUNDRED = BigInt('100');
const THOUSAND = BigInt('1000');


const ONE_ETH = ethers.parseEther('1');

//const TOTALSUPPLY = ethers.parseEther('1000000000');    
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';

const NO_COSTMANAGER = ZERO_ADDRESS;
const NO_HOOK = ZERO_ADDRESS;
const SubscriptionState = {
    // NONE:0, 
    // EXPIRED:1, 
    // ACTIVE:2, 
    // BROKEN:3
    NONE:0, 
    LAPSED:1, 
    ACTIVE:2, 
    BROKEN:3,
    EXPIRED:4,
    CANCELED:5,
};

const NO_RECIPIENT_TOKEN_ID = 0;
var owner;
var alice;
var bob;
var charlie;
var david;
var recipient;

describe("Test", function () {
    
    
    var tmp;
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
            const accounts = await ethers.getSigners();
            owner = accounts[0];                     
            alice = accounts[1];
            bob = accounts[2];
            charlie = accounts[3];
            david = accounts[4];
            recipient = accounts[5];

            let ReleaseManagerFactoryF = await ethers.getContractFactory("MockReleaseManagerFactory");
            let ReleaseManagerF = await ethers.getContractFactory("MockReleaseManager");
            
            //CommunityMockF = await ethers.getContractFactory("CommunityMock");    
            
            let implementationReleaseManager    = await ReleaseManagerF.deploy();

            let releaseManagerFactory   = await ReleaseManagerFactoryF.connect(owner).deploy(implementationReleaseManager.target);
            let tx,rc,event,instance,instancesCount;
            //
            tx = await releaseManagerFactory.connect(owner).produce();
            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceProduced');
            [instance, instancesCount] = event.args;
            releaseManager = await ethers.getContractAt("MockReleaseManager",instance);

            let SubscriptionsManagerFactoryF = await ethers.getContractFactory("MockSubscriptionsManagerFactory");
            let SubscriptionsManagerF = await ethers.getContractFactory("SubscriptionsManagerUpgradeable");

            SubscriptionsManagerImpl = await SubscriptionsManagerF.connect(owner).deploy();
            SubscriptionsManagerFactory = await SubscriptionsManagerFactoryF.connect(owner).deploy(SubscriptionsManagerImpl.target, NO_COSTMANAGER, releaseManager.target);

            // 
            const factoriesList = [SubscriptionsManagerFactory.target];
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
                erc20.target, //address token,
                ONE_ETH, //uint256 price,
                ZERO_ADDRESS, //address controller,
                recipient.address, //address recipient,
                NO_RECIPIENT_TOKEN_ID,
                NO_HOOK //bool recipientImplementsHooks
            ];
            
            // rc = await tx.wait(); // 0ms, as tx is already confirmed
            // event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceCreated');
            // [instance, instancesCount] = event.args;
            // SubscriptionsManager = await ethers.getContractAt("SubscriptionsManager",instance);
        });

        it("should produce", async() => {

            let tx = await SubscriptionsManagerFactory.connect(owner).produce(...p);

            const rc = await tx.wait(); // 0ms, as tx is already confirmed
            const event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceCreated');
            const [instance,] = event.args;
            expect(instance).not.to.be.eq(ZERO_ADDRESS);
            
        });
        
        it("should produce deterministic", async() => {
            p = [salt, ...p]; // prepend salt into params as first param
            let tx = await SubscriptionsManagerFactory.connect(owner).produceDeterministic(...p);

            let rc = await tx.wait(); // 0ms, as tx is already confirmed
            let event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceCreated');
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
            event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceCreated');
            [instanceWithSalt,] = event.args;
            //revert snapshot
            await ethers.provider.send('evm_revert', [snapId]);

            let p2 =[salt2, ...p]; // prepend salt into params as first param
            // make create2. then create and finally again with salt. 
            tx = await SubscriptionsManagerFactory.connect(owner).produceDeterministic(...p2);
            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceCreated');
            [instanceWithSalt2,] = event.args;
            
            await SubscriptionsManagerFactory.connect(owner).produce(...p);

            tx = await SubscriptionsManagerFactory.connect(owner).produceDeterministic(...p1);
            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceCreated');
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
            event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceCreated');
            [instance,] = event.args;
            
            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceCreated');
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
                86400, 20, 1, 3, erc20.target, ONE_ETH,
                recipient.address, //address controller,
                recipient.address, NO_RECIPIENT_TOKEN_ID, NO_HOOK
            ];
            await expect(
                SubscriptionsManagerFactory.connect(owner).produce(...pWithWrongControllerAsEOAUser)
            ).to.be.revertedWithCustomError(SubscriptionsManagerFactory, 'UnauthorizedContract').withArgs(recipient.address);

            pWithWrongControllerAsERC20 = [
                86400, 20, 1, 3, erc20.target, ONE_ETH,
                erc20.target, //address controller,
                recipient.address, NO_RECIPIENT_TOKEN_ID, NO_HOOK
            ];
            await expect(
                SubscriptionsManagerFactory.connect(owner).produce(...pWithWrongControllerAsERC20)
            ).to.be.revertedWithCustomError(SubscriptionsManagerFactory, 'UnauthorizedContract').withArgs(erc20.target);

        });

        it("instancesCount shoud be increase after produce", async() => {
            let beforeProduce = await SubscriptionsManagerFactory.instancesCount();
            await SubscriptionsManagerFactory.connect(owner).produce(...p);
            let afterProduce = await SubscriptionsManagerFactory.instancesCount();
            expect(afterProduce).to.be.eq(beforeProduce+(ONE))
        });

        it("should registered instance in release manager", async() => {
            let tx, rc, event, instance;
            tx = await SubscriptionsManagerFactory.connect(owner).produce(...p);

            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceCreated');
            [instance,] = event.args;
            
            let success = await releaseManager.checkInstance(instance);
            expect(success).to.be.true;
            let notSuccess = await releaseManager.checkInstance(erc20.target);
            expect(notSuccess).to.be.false;
        });

        it("should revert if call charge any contract expect factory instances", async() => {
            let MockSubscriptionsManagerChargeTestF = await ethers.getContractFactory("MockSubscriptionsManagerChargeTest");
            let MockSubscriptionsManagerChargeTest = await MockSubscriptionsManagerChargeTestF.connect(owner).deploy();

            // call from contract
            await expect(
                MockSubscriptionsManagerChargeTest.connect(owner).chargeMock(
                    SubscriptionsManagerFactory.target,
                    erc20.target,
                    ONE_ETH,
                    alice.address,
                    bob.address
                )
            ).to.be.revertedWithCustomError(SubscriptionsManagerFactory, 'OnlyInstances');

            // call directly
            await expect(
                SubscriptionsManagerFactory.connect(owner).doCharge(
                    erc20.target,
                    ONE_ETH,
                    alice.address,
                    bob.address
                )
            ).to.be.revertedWithCustomError(SubscriptionsManagerFactory, 'OnlyInstances');
        
        });

        it("shouldnt revert tx when call charge", async() => {
            let MockSubscriptionsManagerChargeTestF = await ethers.getContractFactory("MockSubscriptionsManagerChargeTest");
            let MockSubscriptionsManagerChargeTest = await MockSubscriptionsManagerChargeTestF.connect(owner).deploy();

            await SubscriptionsManagerFactory.addIntoInstances(MockSubscriptionsManagerChargeTest.target);
            
            await MockSubscriptionsManagerChargeTest.connect(owner).chargeMock(
                SubscriptionsManagerFactory.target,
                erc20.target,
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

            await SubscriptionsManagerFactory.addIntoInstances(MockSubscriptionsManagerChargeTest.target);
            
            let amountToCharge = ONE_ETH;
            await erc20.connect(owner).mint(alice.address, amountToCharge);
            await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, amountToCharge);
            
            let aliceBalanceBefore,bobBalanceBefore,aliceBalanceAfter,bobBalanceAfter;
            aliceBalanceBefore = await erc20.balanceOf(alice.address);
            bobBalanceBefore = await erc20.balanceOf(bob.address);
            await MockSubscriptionsManagerChargeTest.connect(owner).chargeMock(
                SubscriptionsManagerFactory.target,
                erc20.target,
                amountToCharge,
                alice.address,
                bob.address
            );
            aliceBalanceAfter = await erc20.balanceOf(alice.address);
            bobBalanceAfter = await erc20.balanceOf(bob.address);

            let success = await MockSubscriptionsManagerChargeTest.viewState();
            expect(success).to.be.true; // 

            // balances should be correct also
            expect(aliceBalanceBefore-(aliceBalanceAfter)).to.be.eq(amountToCharge);
            expect(bobBalanceAfter-(bobBalanceBefore)).to.be.eq(amountToCharge);

            
        });

        it("sender should be an owner of instance, not factory!", async() => {
            let tx = await SubscriptionsManagerFactory.connect(bob).produce(...p);

            const rc = await tx.wait(); // 0ms, as tx is already confirmed
            const event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceCreated');
            const [instance,] = event.args;

            let SubscriptionsManager = await ethers.getContractAt("SubscriptionsManagerUpgradeable",instance);
            let ownerOfInstance = await SubscriptionsManager.owner();
            expect(ownerOfInstance).not.to.be.eq(SubscriptionsManagerFactory.target);
            expect(ownerOfInstance).not.to.be.eq(owner.target);
            expect(ownerOfInstance).to.be.eq(bob.address);
            
        });
    });

    describe("instance checks", function () {
        
        var SubscriptionsManager;
        var SubscriptionsManagerFactory;
        var SubscriptionsManagerImpl;
        
        //var CommunityMock;
        var releaseManager;
        var erc20;
        var p;

        beforeEach("before", async() => {
            let ReleaseManagerFactoryF = await ethers.getContractFactory("MockReleaseManagerFactory");
            let ReleaseManagerF = await ethers.getContractFactory("MockReleaseManager");
            
            //CommunityMockF = await ethers.getContractFactory("CommunityMock");    
            
            let implementationReleaseManager    = await ReleaseManagerF.deploy();

            let releaseManagerFactory   = await ReleaseManagerFactoryF.connect(owner).deploy(implementationReleaseManager.target);
            let tx,rc,event,instance,instancesCount;
            //
            tx = await releaseManagerFactory.connect(owner).produce();
            rc = await tx.wait(); // 0ms, as tx is already confirmed
            event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceProduced');
            [instance, instancesCount] = event.args;
            releaseManager = await ethers.getContractAt("MockReleaseManager",instance);

            let SubscriptionsManagerFactoryF = await ethers.getContractFactory("MockSubscriptionsManagerFactory");
            let SubscriptionsManagerF = await ethers.getContractFactory("MockSubscriptionsManagerUpgradeable");

            SubscriptionsManagerImpl = await SubscriptionsManagerF.connect(owner).deploy();
            SubscriptionsManagerFactory = await SubscriptionsManagerFactoryF.connect(owner).deploy(SubscriptionsManagerImpl.target, NO_COSTMANAGER, releaseManager.target);

            // 
            const factoriesList = [SubscriptionsManagerFactory.target];
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

            
        });

        it("shouldn't produce if controller wasn't in our ecosystem", async() => {
                let MockControllerF = await ethers.getContractFactory("MockController");
                let MockController = await MockControllerF.connect(owner).deploy();
                p = [
                    86400, //uint32 interval,
                    20, //uint16 intervalsMax,
                    1, //uint16 intervalsMin,
                    3, //uint8 retries,
                    erc20.target, //address token,
                    ONE_ETH, //uint256 price,
                    MockController.target, //address controller,
                    recipient.address, //address recipient,
                    NO_RECIPIENT_TOKEN_ID,
                    NO_HOOK //bool recipientImplementsHooks
                ];
                
                await expect(SubscriptionsManagerFactory.connect(owner).produce(...p)).to.be.revertedWithCustomError(SubscriptionsManagerFactory, 'UnauthorizedContract').withArgs(MockController.target);
        });
        
        for(const controllerUsed of [true, false]) {
        
        describe(controllerUsed ? "with external controller(contract)" : "without controller", function () {
            var MockController;
            var subscriptionPrice;
            var specialPrice = ONE_ETH/(TEN);
            
            var totalMintToAlice = ONE_ETH*(TEN);
            var interval = 86400;
            var intervalsMin = TWO;
            var commonPrice = ONE_ETH;

            beforeEach("deploying", async() => {
                subscriptionPrice = controllerUsed ? specialPrice : (commonPrice);

                let MockControllerF = await ethers.getContractFactory("MockController");
                MockController = await MockControllerF.connect(owner).deploy();
                p = [
                    interval, //uint32 interval,
                    20, //uint16 intervalsMax,
                    intervalsMin, //uint16 intervalsMin,
                    3, //uint8 retries,
                    erc20.target, //address token,
                    commonPrice, //uint256 price,
                    controllerUsed ? MockController.target : ZERO_ADDRESS, //address controller,
                    recipient.address, //address recipient,
                    NO_RECIPIENT_TOKEN_ID,
                    NO_HOOK //bool recipientImplementsHooks
                ];

                if (controllerUsed) {
                    await releaseManager.connect(owner).customRegisterInstance(MockController.target);
                }

                tx = await SubscriptionsManagerFactory.connect(owner).produce(...p);

                rc = await tx.wait(); // 0ms, as tx is already confirmed
                event = rc.logs.find(event => event.fragment && event.fragment.name=== 'InstanceCreated');
                [instance, instancesCount] = event.args;
                SubscriptionsManager = await ethers.getContractAt("MockSubscriptionsManagerUpgradeable",instance);
            });
            
            it("new subscription shouldnt be active immediately but tx will revert with `SubscriptionCantStart()` if pay not consume", async() => {
                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                if (controllerUsed) {
                    await expect(MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE)).to.be.revertedWithCustomError(SubscriptionsManager, "SubscriptionCantStart");
                } else {
                    await expect(SubscriptionsManager.connect(alice).subscribe(FIVE)).to.be.revertedWithCustomError(SubscriptionsManager, "SubscriptionCantStart");
                }

            });
            it("should add caller only by owner", async() => {
                expect(await SubscriptionsManager.callers(bob.address)).to.be.false;

                await expect (
                    SubscriptionsManager.connect(bob).addCaller(bob.address)
                ).to.be.revertedWith("Ownable: caller is not the owner");

                await SubscriptionsManager.connect(owner).addCaller(bob.address);
                expect(await SubscriptionsManager.callers(bob.address)).to.be.true;
            });
            it("should remove caller only by owner", async() => {
                await SubscriptionsManager.connect(owner).addCaller(bob.address);

                expect(await SubscriptionsManager.callers(bob.address)).to.be.true;

                await expect (
                    SubscriptionsManager.connect(bob).removeCaller(bob.address)
                ).to.be.revertedWith("Ownable: caller is not the owner");

                await SubscriptionsManager.connect(owner).removeCaller(bob.address);
                expect(await SubscriptionsManager.callers(bob.address)).to.be.false;
            });

            if (controllerUsed) {
            it("shouldnt call subscribeFromController if controller wrong", async() => {
                await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                await expect(
                    SubscriptionsManager.connect(alice).subscribeFromController(alice.address, subscriptionPrice, FIVE)
                ).to.be.revertedWithCustomError(SubscriptionsManager, 'ControllerOnly').withArgs(MockController.target);
                
            });
            } else {
            it("shouldnt call subscribeFromController if controller does not present", async() => {
                await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                await expect(
                    MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE)
                ).to.be.revertedWithCustomError(SubscriptionsManager, "NotSupported");
                
            });
            }
            it("new subscription should be active immediately if pay-tokens is enough consumed", async() => {
                await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                let aliceERC20TokenBalanceBefore = await erc20.balanceOf(alice.address);
                
                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.NONE);
                if (controllerUsed) {
                    await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                } else {
                    await SubscriptionsManager.connect(alice).subscribe(FIVE);
                }
                let aliceERC20TokenBalanceAfter = await erc20.balanceOf(alice.address);
                
                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                expect(aliceERC20TokenBalanceBefore-(aliceERC20TokenBalanceAfter)).to.be.eq(subscriptionPrice*(intervalsMin));

                let ts = await SubscriptionsManager.currentBlockTimestamp();
                expect(await SubscriptionsManager.activeUntil(alice.address)).to.be.eq(ts+(BigInt(interval)*(intervalsMin)));
            });

            it("should send subscription pay to recipient", async() => {
                await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                let recipientERC20TokenBalanceBefore = await erc20.balanceOf(recipient.address);
                
                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.NONE);
                if (controllerUsed) {
                    await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                } else {
                    await SubscriptionsManager.connect(alice).subscribe(FIVE);
                }

                let recipientERC20TokenBalanceAfter = await erc20.balanceOf(recipient.address);

                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                expect(recipientERC20TokenBalanceAfter-(recipientERC20TokenBalanceBefore)).to.be.eq(subscriptionPrice*(intervalsMin));
            });

            it("hook. should call onCharge", async() => {
                let MockSubscriptionsHookF = await ethers.getContractFactory("MockSubscriptionsHook");
                let MockSubscriptionsHook = await MockSubscriptionsHookF.connect(owner).deploy();
                
                await SubscriptionsManager.connect(owner).setHook(MockSubscriptionsHook.target);

                await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                expect(await MockSubscriptionsHook.chargeCallbackTriggered()).to.be.false;
                if (controllerUsed) {
                    await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                } else {
                    await SubscriptionsManager.connect(alice).subscribe(FIVE);
                }
                expect(await MockSubscriptionsHook.chargeCallbackTriggered()).to.be.true;

                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

            });
            it("hook. revert subscribe action if onCharge was revert", async() => {
                let MockSubscriptionsHookBadF = await ethers.getContractFactory("MockSubscriptionsHookBad");
                let MockSubscriptionsHookBad = await MockSubscriptionsHookBadF.connect(owner).deploy();
                
                await SubscriptionsManager.connect(owner).setHook(MockSubscriptionsHookBad.target);

                await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                expect(await MockSubscriptionsHookBad.chargeCallbackTriggered()).to.be.false;
                if (controllerUsed) {
                    await expect(
                        MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE)
                    ).to.be.revertedWithCustomError(MockSubscriptionsHookBad, 'HappensSmthUnexpected');
                } else {
                    await expect(
                        SubscriptionsManager.connect(alice).subscribe(FIVE)
                    ).to.be.revertedWithCustomError(MockSubscriptionsHookBad, 'HappensSmthUnexpected');
                }
                expect(await MockSubscriptionsHookBad.chargeCallbackTriggered()).to.be.false;

                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

            });

            it("new subscription shouldnt be too short than minimum interval", async() => {
                
                if (controllerUsed) {
                    await expect(
                        MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, ONE)
                    ).to.be.revertedWithCustomError(SubscriptionsManager, 'SubscriptionTooShort');
                } else {
                    await expect(
                        SubscriptionsManager.connect(alice).subscribe(ONE)
                    ).to.be.revertedWithCustomError(SubscriptionsManager, 'SubscriptionTooShort');
                }
                
            });

            it("new subscription shouldnt be too long than maximum interval", async() => {
                
                if (controllerUsed) {
                    await expect(
                        MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, HUNDRED)
                    ).to.be.revertedWithCustomError(SubscriptionsManager, 'SubscriptionTooLong');
                } else {
                    await expect(
                        SubscriptionsManager.connect(alice).subscribe(HUNDRED)
                    ).to.be.revertedWithCustomError(SubscriptionsManager, 'SubscriptionTooLong');
                }
                
            });

            it("subscription should prolong subscribe active after charge happens afterward", async() => {
                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                await erc20.connect(owner).mint(alice.address, subscriptionPrice*(intervalsMin));
                await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, subscriptionPrice*(intervalsMin));

                if (controllerUsed) {
                    await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                } else {
                    await SubscriptionsManager.connect(alice).subscribe(FIVE);
                }
                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                //pass intervals
                await network.provider.send("evm_increaseTime", [interval]);
                await network.provider.send("evm_mine");
                await network.provider.send("evm_increaseTime", [interval]);
                await network.provider.send("evm_mine");

                await network.provider.send("evm_increaseTime", [10]);
                await network.provider.send("evm_mine");

                await SubscriptionsManager.connect(owner).charge([alice.address]);

                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.LAPSED);

                await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                await SubscriptionsManager.connect(owner).charge([alice.address]);

                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);
            });

            it("shouldnt consumed funds multiple times when charging a several time in one interval", async() => {
                
                await erc20.connect(owner).mint(alice.address, subscriptionPrice*(intervalsMin));
                await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, subscriptionPrice*(intervalsMin));

                if (controllerUsed) {
                    await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                } else {
                    await SubscriptionsManager.connect(alice).subscribe(FIVE);
                }
                //pass intervals
                await network.provider.send("evm_increaseTime", [interval]);
                await network.provider.send("evm_mine");
                await network.provider.send("evm_increaseTime", [interval]);
                await network.provider.send("evm_mine");

                await network.provider.send("evm_increaseTime", [10]);
                await network.provider.send("evm_mine");

                await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);
                let aliceERC20TokenBalanceBefore = await erc20.balanceOf(alice.address);

                await SubscriptionsManager.connect(owner).charge([alice.address]);
                await SubscriptionsManager.connect(owner).charge([alice.address]);
                await SubscriptionsManager.connect(owner).charge([alice.address]);
                await SubscriptionsManager.connect(owner).charge([alice.address]);
                await SubscriptionsManager.connect(owner).charge([alice.address]);

                let aliceERC20TokenBalanceAfter = await erc20.balanceOf(alice.address);
                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);
                
                expect(aliceERC20TokenBalanceBefore-(aliceERC20TokenBalanceAfter)).to.be.eq(subscriptionPrice);
            });

            it("should consumed funds when interval pass", async() => {
                await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                let aliceERC20TokenBalanceBefore = await erc20.balanceOf(alice.address);
                if (controllerUsed) {
                    await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                } else {
                    await SubscriptionsManager.connect(alice).subscribe(FIVE);
                }
                await SubscriptionsManager.connect(owner).charge([alice.address]);
                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                //pass another interval
                await network.provider.send("evm_increaseTime", [interval])
                await network.provider.send("evm_mine") // this one will have 02:00 PM as its timestamp

                await SubscriptionsManager.connect(owner).charge([alice.address]);
                let aliceERC20TokenBalanceAfter = await erc20.balanceOf(alice.address);

                // still active
                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);
                // expecting spent for 2 intervals
                expect(aliceERC20TokenBalanceBefore-(aliceERC20TokenBalanceAfter)).to.be.eq(subscriptionPrice*(TWO));
            });

            it("should turn subscription in LAPSED state when funds have not been consumed", async() => {
                
                await erc20.connect(owner).mint(alice.address, subscriptionPrice*(intervalsMin));
                await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, subscriptionPrice*(intervalsMin));

                let aliceERC20TokenBalanceBefore = await erc20.balanceOf(alice.address);
                if (controllerUsed) {
                    await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                } else {
                    await SubscriptionsManager.connect(alice).subscribe(FIVE);
                }
                await SubscriptionsManager.connect(owner).charge([alice.address]);

                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[0]).to.be.true;
                expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                //pass intervals
                await network.provider.send("evm_increaseTime", [interval]);
                await network.provider.send("evm_mine");
                await network.provider.send("evm_increaseTime", [interval]);
                await network.provider.send("evm_mine");

                await network.provider.send("evm_increaseTime", [10]);
                await network.provider.send("evm_mine");

                await SubscriptionsManager.connect(owner).charge([alice.address]);

                let aliceERC20TokenBalanceAfter = await erc20.balanceOf(alice.address);

                // still active but status LAPSED although didnt charge for second interval
                tmp = await SubscriptionsManager.isActive(alice.address);
                expect(tmp[0]).to.be.true;
                expect(tmp[1]).to.be.eq(SubscriptionState.LAPSED);

                expect(aliceERC20TokenBalanceBefore-(aliceERC20TokenBalanceAfter)).to.be.eq(subscriptionPrice*(intervalsMin));
                
            });

            describe("community tests", function () {
                var MockCommunity;
                var roleIndex = 5;
                beforeEach("before", async() => {

                    let MockCommunityF = await ethers.getContractFactory("MockCommunity");
                    MockCommunity = await MockCommunityF.connect(owner).deploy();

                    await releaseManager.customRegisterInstance(MockCommunity.target);

                    await SubscriptionsManager.connect(owner).setCommunity(MockCommunity.target, roleIndex);
                });
                it("should setCommunity be in our ecosystem", async() => {
                    await expect(
                        SubscriptionsManager.connect(owner).setCommunity(MockCommunity.target, ZERO)
                    ).revertedWithCustomError(SubscriptionsManager,"invalidCommunitySettings");
                }); 
                it("should setCommunity only by owner", async() => {
                    await expect(
                        SubscriptionsManager.connect(bob).setCommunity(MockCommunity.target, roleIndex)
                    ).revertedWith("Ownable: caller is not the owner");
                }); 
                
                it("should grant role when subscription become active", async() => {

                    await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                    expect(
                        await MockCommunity.hasRole(alice.address, roleIndex)
                    ).to.be.false;

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);
                    if (controllerUsed) {
                        await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                    } else {
                        await SubscriptionsManager.connect(alice).subscribe(FIVE);
                    }
                    
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                    expect(
                        await MockCommunity.hasRole(alice.address, roleIndex)
                    ).to.be.true;

                }); 
                it("should revoke role when subscription become lapsed", async() => {

                    await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, subscriptionPrice*(intervalsMin));

                    expect(
                        await MockCommunity.hasRole(alice.address, roleIndex)
                    ).to.be.false;

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);
                    if (controllerUsed) {
                        await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                    } else {
                        await SubscriptionsManager.connect(alice).subscribe(FIVE);
                    }
                    
                    tmp = await SubscriptionsManager.isActive(alice.address);

                    expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                    expect(
                        await MockCommunity.hasRole(alice.address, roleIndex)
                    ).to.be.true;

                    //pass minimum intervals
                    await network.provider.send("evm_increaseTime", [parseInt(intervalsMin*(BigInt(interval))+(FIVE).toString())]);
                    await network.provider.send("evm_mine");

                    await SubscriptionsManager.connect(owner).charge([alice.address]);

                    tmp = await SubscriptionsManager.isActive(alice.address);

                    expect(tmp[1]).to.be.eq(SubscriptionState.LAPSED);
                    
                    expect(
                        await MockCommunity.hasRole(alice.address, roleIndex)
                    ).to.be.false;
                }); 
            });

            describe("cancel subscription", function () {
                it("shouldnt cancel subscription if it wasnt created before", async() => {
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                    await SubscriptionsManager.connect(alice)["cancel()"]();

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);
                });
                it("shouldnt cancel subscription if it was lapsed before", async() => {
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                    await erc20.connect(owner).mint(alice.address, subscriptionPrice*(intervalsMin));
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, subscriptionPrice*(intervalsMin));

                    if (controllerUsed) {
                        await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                    } else {
                        await SubscriptionsManager.connect(alice).subscribe(FIVE);
                    }

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                    //pass intervals
                    await network.provider.send("evm_increaseTime", [interval]);
                    await network.provider.send("evm_mine");
                    await network.provider.send("evm_increaseTime", [interval]);
                    await network.provider.send("evm_mine");

                    await network.provider.send("evm_increaseTime", [10]);
                    await network.provider.send("evm_mine");
                    await SubscriptionsManager.connect(owner).charge([alice.address]);
                    
                    //cancel
                    await SubscriptionsManager.connect(alice)["cancel()"]();

                    // still LAPSED
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.LAPSED);

                });
                it("shouldnt cancel subscription if it was CANCELED before", async() => {
                    await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                    if (controllerUsed) {
                        await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                    } else {
                        await SubscriptionsManager.connect(alice).subscribe(FIVE);
                    }

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                    //cancel
                    await SubscriptionsManager.connect(alice)["cancel()"]();

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.CANCELED);

                    await SubscriptionsManager.connect(alice)["cancel()"]();
                    // still expired
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.CANCELED);

                });
                it("should cancel subscription if active before", async() => {
                    await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                    let aliceERC20TokenBalanceBefore = await erc20.balanceOf(alice.address);
                    
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                    if (controllerUsed) {
                        await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                    } else {
                        await SubscriptionsManager.connect(alice).subscribe(FIVE);
                    }
                    let aliceERC20TokenBalanceAfter = await erc20.balanceOf(alice.address);
                    
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                    expect(aliceERC20TokenBalanceBefore-(aliceERC20TokenBalanceAfter)).to.be.eq(subscriptionPrice*(intervalsMin));

                    await SubscriptionsManager.connect(alice)["cancel()"]();

                    let aliceERC20TokenBalanceAfterCancel = await erc20.balanceOf(alice.address);
                    expect(aliceERC20TokenBalanceAfter-(aliceERC20TokenBalanceAfterCancel)).to.be.eq(ZERO);

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[0]).to.be.false;
                    expect(tmp[1]).to.be.eq(SubscriptionState.CANCELED);
                });
                it("should cancel subscription by owner if active before", async() => {
                    await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                    let aliceERC20TokenBalanceBefore = await erc20.balanceOf(alice.address);
                    
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                    if (controllerUsed) {
                        await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                    } else {
                        await SubscriptionsManager.connect(alice).subscribe(FIVE);
                    }
                    let aliceERC20TokenBalanceAfter = await erc20.balanceOf(alice.address);
                    
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                    expect(aliceERC20TokenBalanceBefore-(aliceERC20TokenBalanceAfter)).to.be.eq(subscriptionPrice*(intervalsMin));

                    await SubscriptionsManager.connect(owner)["cancel(address[])"]([alice.address]);

                    let aliceERC20TokenBalanceAfterCancel = await erc20.balanceOf(alice.address);
                    expect(aliceERC20TokenBalanceAfter-(aliceERC20TokenBalanceAfterCancel)).to.be.eq(ZERO);

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[0]).to.be.false;
                    expect(tmp[1]).to.be.eq(SubscriptionState.CANCELED);
                });
            });
            
            describe("restore subscription", function () {
                it("shouldnt restore subscription if there are no additional funds", async() => {
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                    await erc20.connect(owner).mint(alice.address, subscriptionPrice*(intervalsMin));
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, subscriptionPrice*(intervalsMin));

                    if (controllerUsed) {
                        await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                    } else {
                        await SubscriptionsManager.connect(alice).subscribe(FIVE);
                    }
                    
                    //pass intervals
                    await network.provider.send("evm_increaseTime", [interval]);
                    await network.provider.send("evm_mine");
                    await network.provider.send("evm_increaseTime", [interval]);
                    await network.provider.send("evm_mine");

                    await network.provider.send("evm_increaseTime", [10]);
                    await network.provider.send("evm_mine");
                    await SubscriptionsManager.connect(owner).charge([alice.address]);

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.LAPSED);

                    await expect(
                        SubscriptionsManager.connect(alice)["restore()"]()
                    ).to.emit(SubscriptionsManager, 'ChargeFailed').withArgs(alice.address, subscriptionPrice);

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.LAPSED);

                });

                it("shouldnt restore subscription if it wasnt created before", async() => {
                     tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                    await SubscriptionsManager.connect(alice)["restore()"]();

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);
                });

                it("shouldnt restore subscription if passed all intervals.", async() => {
                    
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                    await erc20.connect(owner).mint(alice.address, subscriptionPrice*(intervalsMin));
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, subscriptionPrice*(intervalsMin));

                    if (controllerUsed) {
                        await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                    } else {
                        await SubscriptionsManager.connect(alice).subscribe(FIVE);
                    }

                    //pass intervals
                    await network.provider.send("evm_increaseTime", [interval]);
                    await network.provider.send("evm_mine");
                    await network.provider.send("evm_increaseTime", [interval]);
                    await network.provider.send("evm_mine");

                    await network.provider.send("evm_increaseTime", [10]);
                    await network.provider.send("evm_mine");
                    await SubscriptionsManager.connect(owner).charge([alice.address]);

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.LAPSED);

                    await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                    //pass all subscription intervals
                    await network.provider.send("evm_increaseTime", [100*interval+5]);
                    await network.provider.send("evm_mine");

                    await expect(
                        SubscriptionsManager.connect(alice)["restore()"]()
                    ).to.emit(SubscriptionsManager, "SubscriptionExpired");

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.EXPIRED);
                });    

                it("shouldnt restore subscription if exceeded maximum retries attempt", async() => {
                    
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                    await erc20.connect(owner).mint(alice.address, subscriptionPrice*(intervalsMin));
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, subscriptionPrice*(intervalsMin));

                    if (controllerUsed) {
                        await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                    } else {
                        await SubscriptionsManager.connect(alice).subscribe(FIVE);
                    }
                    
                    //pass intervals
                    await network.provider.send("evm_increaseTime", [parseInt(intervalsMin*(BigInt(interval))+(FIVE).toString())]);
                    await network.provider.send("evm_mine");
                    
                    await SubscriptionsManager.connect(owner).charge([alice.address]);

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.LAPSED);

                    //pass intervals
                    for( let i=4; i--; ) {

                        await network.provider.send("evm_increaseTime", [interval+5]);
                        await network.provider.send("evm_mine");
                        await SubscriptionsManager.connect(owner).charge([alice.address]);
                    };

                    await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                    await network.provider.send("evm_increaseTime", [interval+5]);
                    await network.provider.send("evm_mine");

                    await expect(
                        SubscriptionsManager.connect(alice)["restore()"]()
                    ).to.emit(SubscriptionsManager, 'RetriesExpired');

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.EXPIRED);
                });    

                it("shouldnt restore subscription if it was active before", async() => {
                    await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                    if (controllerUsed) {
                        await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                    } else {
                        await SubscriptionsManager.connect(alice).subscribe(FIVE);
                    }
                    
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                    await SubscriptionsManager.connect(alice)["restore()"]();

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                });

                it("shouldnt restore subscription if it was BROKEN before", async() => {
                    await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.NONE);

                    if (controllerUsed) {
                        await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                    } else {
                        await SubscriptionsManager.connect(alice).subscribe(FIVE);
                    }

                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                    await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, ZERO);
                    //pass intervals
                    for( let i=5; i--; ) {

                        await network.provider.send("evm_increaseTime", [interval+5]);
                        await network.provider.send("evm_mine");
                        await SubscriptionsManager.connect(owner).charge([alice.address]);
                    };
                    
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.BROKEN);

                    await SubscriptionsManager.connect(alice)["restore()"]();

                    // still expired
                    tmp = await SubscriptionsManager.isActive(alice.address);
                    expect(tmp[1]).to.be.eq(SubscriptionState.BROKEN);
                });

                describe("should restore when state LAPSED", function () {
                    var snapId;
                    let aliceERC20TokenBalanceBefore;
                    let aliceERC20TokenBalanceAfter;
                    
                    beforeEach("before", async() => {
                        //make snapshot
                        snapId = await ethers.provider.send('evm_snapshot', []);

                        await erc20.connect(owner).mint(alice.address, subscriptionPrice*(intervalsMin));
                        await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, subscriptionPrice*(intervalsMin));

                        if (controllerUsed) {
                            await MockController.connect(alice).subscribeViaController(SubscriptionsManager.target, alice.address, subscriptionPrice, FIVE);
                        } else {
                            await SubscriptionsManager.connect(alice).subscribe(FIVE);
                        }
                        await SubscriptionsManager.connect(owner).charge([alice.address]);

                        //pass intervals
                        await network.provider.send("evm_increaseTime", [interval]);
                        await network.provider.send("evm_mine");
                        await network.provider.send("evm_increaseTime", [interval]);
                        await network.provider.send("evm_mine");

                        await network.provider.send("evm_increaseTime", [10]);
                        await network.provider.send("evm_mine");

                        // try to charge  but approve are zero
                        await SubscriptionsManager.connect(owner).charge([alice.address]);
                        
                        tmp = await SubscriptionsManager.isActive(alice.address);
                        expect(tmp[0]).to.be.true;
                        expect(tmp[1]).to.be.eq(SubscriptionState.LAPSED);
                        //--------------------------------------------------------------------
                        //       [1]  [2]    [3]
                        // subscribe pass charge

                        // mint and approve smth
                        await erc20.connect(owner).mint(alice.address, totalMintToAlice);
                        await erc20.connect(alice).approve(SubscriptionsManagerFactory.target, totalMintToAlice);
                        aliceERC20TokenBalanceBefore = await erc20.balanceOf(alice.address);
                        
                        //pass another one interval
                        //and try to restore. 
                        //we expecting charge for two intervals 
                        await network.provider.send("evm_increaseTime", [interval+5]);
                        await network.provider.send("evm_mine");
                        //--------------------------------------------------------------------
                    });

                    afterEach("afterEach", async() => {
                        //--------------------------------------------------------------------
                        aliceERC20TokenBalanceAfter = await erc20.balanceOf(alice.address);
                        tmp = await SubscriptionsManager.isActive(alice.address);
                        expect(tmp[0]).to.be.true;
                        expect(tmp[1]).to.be.eq(SubscriptionState.ACTIVE);

                        expect(aliceERC20TokenBalanceBefore-(aliceERC20TokenBalanceAfter)).to.be.eq(subscriptionPrice*(TWO));
                        //--------------------------------------------------------------------
                        //revert snapshot
                        await ethers.provider.send('evm_revert', [snapId]);
                    });

                    it(" --- via sender", async() => {
                        await expect(
                            SubscriptionsManager.connect(alice)["restore()"]()
                        ).to.emit(SubscriptionsManager, 'Restored');
                    });
                    it(" --- via owner", async() => {
                        await expect(
                            SubscriptionsManager.connect(owner)["restore(address[])"]([alice.address])
                        ).to.emit(SubscriptionsManager, 'Restored');
                    });
                    it(" --- via caller", async() => {
                        await expect(
                            SubscriptionsManager.connect(bob)["restore(address[])"]([alice.address])
                        ).to.be.revertedWithCustomError(SubscriptionsManager, "OwnerOrCallerOnly");
                        await SubscriptionsManager.connect(owner).addCaller(bob.address);
                        
                        await expect(
                            SubscriptionsManager.connect(bob)["restore(address[])"]([alice.address])
                        ).to.emit(SubscriptionsManager, 'Restored');
                    });
                    it(" --- and emit event `Restored`", async() => {
                        await expect(
                            SubscriptionsManager.connect(alice)["restore()"]()
                        ).to.emit(SubscriptionsManager, 'Restored');
                    }); 
                });
            });
            
        });

        } // for(const controllerUsed of [true, false]) {
       
    });

});
