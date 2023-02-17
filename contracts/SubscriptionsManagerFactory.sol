// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@artman325/releasemanager/contracts/CostManagerFactoryHelper.sol";
import "@artman325/releasemanager/contracts/ReleaseManagerHelper.sol";
import "@artman325/releasemanager/contracts/ReleaseManager.sol";
import "./interfaces/ISubscriptionsManagerUpgradeable.sol";
import "./interfaces/ISubscriptionsManagerFactory.sol";


contract SubscriptionsManagerFactory  is CostManagerFactoryHelper, ReleaseManagerHelper, ISubscriptionsManagerFactory {
    using Clones for address;
    using Address for address;

    /**
    * @custom:shortd implementation address
    * @notice implementation address
    */
    address public immutable implementation;

    address[] public instances;
    
    error InstanceCreatedFailed();
    error UnauthorizedContract(address controller);

    event InstanceCreated(address instance, uint instancesCount);

    /**
    */
    constructor(
        address _implementation,
        address _costManager,
        address _releaseManager
    ) 
        CostManagerFactoryHelper(_costManager) 
        ReleaseManagerHelper(_releaseManager) 
    {
        implementation = _implementation;
    }

    ////////////////////////////////////////////////////////////////////////
    // external section ////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////

    /**
    * @dev view amount of created instances
    * @return amount amount instances
    * @custom:shortd view amount of created instances
    */
    function instancesCount()
        external 
        view 
        returns (uint256 amount) 
    {
        amount = instances.length;
    }

    ////////////////////////////////////////////////////////////////////////
    // public section //////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////

    /**
    * @param interval interval count
    * @param intervalsMax max interval
    * @param intervalsMin min interval
    * @param retries amount of retries
    * @param token token address to charge
    * @param price price for subsription on single interval
    * @param controller [optional] controller address
    * @param recipient address which will obtain pay for subscription
    * @param recipientImplementsHooks if true then contract expected recipient as contract and will try to call ISubscriptionsHook(recipient).onCharge
    * @return instance address of created instance `SubscriptionsManager`
    * @custom:shortd creation SubscriptionsManager instance
    */
    function produce(
        uint32 interval,
        uint16 intervalsMax,
        uint16 intervalsMin,
        uint8 retries,
        address token,
        uint256 price,
        address controller,
        address recipient,
        bool recipientImplementsHooks
    ) 
        public 
        returns (address instance) 
    {
        instance = address(implementation).clone();
        _produce(instance, interval, intervalsMax, intervalsMin, retries, token, price, controller, recipient, recipientImplementsHooks);
    }

    /**
    * @param interval interval count
    * @param intervalsMax max interval
    * @param intervalsMin min interval
    * @param retries amount of retries
    * @param token token address to charge
    * @param price price for subsription on single interval
    * @param controller [optional] controller address
    * @param recipient address which will obtain pay for subscription
    * @param recipientImplementsHooks if true then contract expected recipient as contract and will try to call ISubscriptionsHook(recipient).onCharge
    * @return instance address of created instance `SubscriptionsManager`
    * @custom:shortd creation SubscriptionsManager instance
    */
    function produceDeterministic(
        bytes32 salt,
        uint32 interval,
        uint16 intervalsMax,
        uint16 intervalsMin,
        uint8 retries,
        address token,
        uint256 price,
        address controller,
        address recipient,
        bool recipientImplementsHooks
    ) 
        public 
        returns (address instance) 
    {
        instance = address(implementation).cloneDeterministic(salt);
        _produce(instance, interval, intervalsMax, intervalsMin, retries, token, price, controller, recipient, recipientImplementsHooks);
    }

    function doCharge(
        address targetToken, 
        uint256 amount, 
        address from, 
        address to
    ) 
        external 
        returns(bool returnSuccess) 
    {
        // we shoud not revert transaction, just return failed condition of `transferFrom` attempt
        bytes memory data = abi.encodeWithSelector(IERC20(targetToken).transferFrom.selector, from, to, amount);
        (bool success, bytes memory returndata) = address(targetToken).call{value: 0}(data);

        if (success) {
            if (returndata.length == 0) {
                // only check isContract if the call was successful and the return data is empty
                // otherwise we already know that it was a contract
                require(targetToken.isContract(), "Address: call to non-contract");
            }
            returnSuccess = true;
        } else {
            returnSuccess = false;
        }
    }


    ////////////////////////////////////////////////////////////////////////
    // internal section ////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////
    function _produce(
        address instance,
        uint32 interval,
        uint16 intervalsMax,
        uint16 intervalsMin,
        uint8 retries,
        address token,
        uint256 price,
        address controller,
        address recipient,
        bool recipientImplementsHooks
    ) 
        internal
    {
        //before initialize
        if (instance == address(0)) {
            revert InstanceCreatedFailed();
        }
        instances.push(instance);
        emit InstanceCreated(instance, instances.length);

        if (controller != address(0)) {
            bool isControllerinOurEcosystem = ReleaseManager(releaseManager()).checkInstance(controller);
            if (!isControllerinOurEcosystem) {
                revert UnauthorizedContract(controller);
            }
        }
    
        //initialize
        ISubscriptionsManagerUpgradeable(instance).initialize(interval, intervalsMax, intervalsMin, retries, token, price, controller, recipient, recipientImplementsHooks, costManager, msg.sender);

        //after initialize
        //----

        //-- register instance in release manager
        registerInstance(instance);
        //-----------------
    }

}