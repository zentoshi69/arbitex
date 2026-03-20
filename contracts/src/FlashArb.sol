// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ── Aave V3 Flash Loan interfaces ────────────────────────────────────────────

interface IPoolAddressesProvider {
    function getPool() external view returns (address);
}

interface IPool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface IFlashLoanSimpleReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

// ── DEX Router interface (UniswapV2-style) ───────────────────────────────────

interface IRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

// ── UniswapV3 Router interface ───────────────────────────────────────────────

interface ISwapRouterV3 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/**
 * @title FlashArb
 * @notice Executes atomic flash-loan arbitrage across two DEX venues.
 *
 * Flow:
 *   1. Borrow `amount` of `asset` from Aave V3 via flashLoanSimple
 *   2. Swap borrowed tokens on buy venue (lower price)
 *   3. Swap output tokens on sell venue (higher price)
 *   4. Repay flash loan + premium
 *   5. Profit stays in contract → owner withdraws
 *
 * The contract supports both V2-style and V3-style DEX routers.
 */
contract FlashArb is IFlashLoanSimpleReceiver, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Aave V3 addresses ────────────────────────────────────────────────────
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    IPool public immutable POOL;

    // ── Swap leg encoding ────────────────────────────────────────────────────
    enum DexType { V2, V3 }

    struct SwapLeg {
        DexType dexType;
        address router;
        address tokenIn;
        address tokenOut;
        uint24 fee;             // only used for V3
        uint256 amountOutMin;
        address[] v2Path;       // only used for V2
    }

    // ── Events ───────────────────────────────────────────────────────────────
    event ArbExecuted(
        address indexed asset,
        uint256 borrowed,
        uint256 profit,
        address buyRouter,
        address sellRouter
    );
    event Withdrawn(address indexed token, uint256 amount, address to);

    // ── Errors ───────────────────────────────────────────────────────────────
    error NotPool();
    error NotSelf();
    error ArbNotProfitable(uint256 repayAmount, uint256 balance);

    constructor(address _addressesProvider) Ownable(msg.sender) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressesProvider);
        POOL = IPool(ADDRESSES_PROVIDER.getPool());
    }

    /**
     * @notice Entry point — initiates the flash loan.
     * @param asset   The token to borrow (e.g. WAVAX, USDC)
     * @param amount  Amount to borrow
     * @param buyLeg  Encoded swap on the buy venue
     * @param sellLeg Encoded swap on the sell venue
     */
    function executeArb(
        address asset,
        uint256 amount,
        SwapLeg calldata buyLeg,
        SwapLeg calldata sellLeg
    ) external onlyOwner nonReentrant {
        bytes memory params = abi.encode(buyLeg, sellLeg);
        POOL.flashLoanSimple(address(this), asset, amount, params, 0);
    }

    /**
     * @notice Aave callback — executes the arb with borrowed funds.
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        if (msg.sender != address(POOL)) revert NotPool();
        if (initiator != address(this)) revert NotSelf();

        (SwapLeg memory buyLeg, SwapLeg memory sellLeg) =
            abi.decode(params, (SwapLeg, SwapLeg));

        // ── Buy leg: swap borrowed asset → intermediate token ────────────
        uint256 buyOutput = _executeSwap(buyLeg, amount);

        // ── Sell leg: swap intermediate → back to borrowed asset ─────────
        _executeSwap(sellLeg, buyOutput);

        // ── Repay flash loan ─────────────────────────────────────────────
        uint256 repayAmount = amount + premium;
        uint256 balance = IERC20(asset).balanceOf(address(this));
        if (balance < repayAmount) {
            revert ArbNotProfitable(repayAmount, balance);
        }

        IERC20(asset).safeIncreaseAllowance(address(POOL), repayAmount);

        emit ArbExecuted(
            asset,
            amount,
            balance - repayAmount,
            buyLeg.router,
            sellLeg.router
        );

        return true;
    }

    // ── Internal swap execution ──────────────────────────────────────────────

    function _executeSwap(SwapLeg memory leg, uint256 amountIn)
        internal
        returns (uint256 amountOut)
    {
        IERC20(leg.tokenIn).safeIncreaseAllowance(leg.router, amountIn);

        if (leg.dexType == DexType.V2) {
            uint256[] memory amounts = IRouter(leg.router)
                .swapExactTokensForTokens(
                    amountIn,
                    leg.amountOutMin,
                    leg.v2Path,
                    address(this),
                    block.timestamp + 120
                );
            amountOut = amounts[amounts.length - 1];
        } else {
            amountOut = ISwapRouterV3(leg.router).exactInputSingle(
                ISwapRouterV3.ExactInputSingleParams({
                    tokenIn: leg.tokenIn,
                    tokenOut: leg.tokenOut,
                    fee: leg.fee,
                    recipient: address(this),
                    amountIn: amountIn,
                    amountOutMinimum: leg.amountOutMin,
                    sqrtPriceLimitX96: 0
                })
            );
        }
    }

    // ── Owner-only profit withdrawal ─────────────────────────────────────────

    function withdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(token, amount, msg.sender);
    }

    function withdrawAll(address token) external onlyOwner {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) {
            IERC20(token).safeTransfer(msg.sender, bal);
            emit Withdrawn(token, bal, msg.sender);
        }
    }

    function withdrawNative() external onlyOwner {
        uint256 bal = address(this).balance;
        if (bal > 0) {
            (bool ok, ) = payable(msg.sender).call{value: bal}("");
            require(ok, "native transfer failed");
        }
    }

    receive() external payable {}
}
