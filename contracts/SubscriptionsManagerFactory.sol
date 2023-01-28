// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@artman325/releasemanager/contracts/CostManagerFactoryHelper.sol";
import "@artman325/releasemanager/contracts/ReleaseManagerHelper.sol";
import "./interfaces/ISubscriptionsManager.sol";

contract SubscriptionsManagerFactory  is CostManagerFactoryHelper, ReleaseManagerHelper {
    using Clones for address;

    /**
    * @custom:shortd implementation address
    * @notice implementation address
    */
    address public immutable implementation;

    address[] public instances;
    
    error InstanceCreatedFailed();
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
        address controller
    ) 
        public 
        returns (address instance) 
    {
        instance = address(implementation).clone();
        _produce(instance, interval, intervalsMax, intervalsMin, retries, token, price, controller);
    }

    /**
    * @param interval interval count
    * @param intervalsMax max interval
    * @param intervalsMin min interval
    * @param retries amount of retries
    * @param token token address to charge
    * @param price price for subsription on single interval
    * @param controller [optional] controller address
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
        address controller
    ) 
        public 
        returns (address instance) 
    {
        instance = address(implementation).cloneDeterministic(salt);
        _produce(instance, interval, intervalsMax, intervalsMin, retries, token, price, controller);
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
        address controller
    ) 
        internal
    {
        //before initialize
        if (instance == address(0)) {
            revert InstanceCreatedFailed();
        }
        instances.push(instance);
        emit InstanceCreated(instance, instances.length);

        //initialize
        ISubscriptionsManager(instance).initialize(interval, intervalsMax, intervalsMin, retries, token, price, controller);

        //after initialize
        //----

        //-- register instance in release manager
        registerInstance(instance);
        //-----------------
    }

}