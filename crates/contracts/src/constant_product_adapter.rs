use crate::adapters::PoolAdapterTrait;
use crate::types::Asset;
use soroban_sdk::{contract, contractimpl, symbol_short, vec, Address, Env, IntoVal};

#[contract]
pub struct ConstantProductAdapter;

#[contractimpl]
impl PoolAdapterTrait for ConstantProductAdapter {
    fn swap(
        e: Env,
        input_asset: Asset,
        output_asset: Asset,
        amount_in: i128,
        min_out: i128,
    ) -> i128 {
        // 1. Get the underlying pool address (stored in this adapter's instance storage)
        let pool_address: Address = e.storage().instance().get(&symbol_short!("POOL")).unwrap();

        // 2. Translate to the specific AMM's function (e.g., Soroswap uses 'swap')
        // We use CCI to call the actual pool
        let out: i128 = e.invoke_contract(
            &pool_address,
            &symbol_short!("swap"),
            vec![
                &e,
                input_asset.into_val(&e),
                output_asset.into_val(&e),
                amount_in.into_val(&e),
                min_out.into_val(&e),
            ],
        );

        out
    }

    fn adapter_quote(e: Env, _input_asset: Asset, _output_asset: Asset, amount_in: i128) -> i128 {
        let (res_in, res_out) = Self::get_rsrvs(e.clone());

        // dy = (y * dx * 997) / (x * 1000 + dx * 997)
        let fee_multiplier: i128 = 997;
        let amount_with_fee = amount_in
            .checked_mul(fee_multiplier)
            .unwrap_or_else(|| panic!("overflow: amount_with_fee"));
        let numerator = amount_with_fee
            .checked_mul(res_out)
            .unwrap_or_else(|| panic!("overflow: numerator"));
        let denominator = res_in
            .checked_mul(1000)
            .and_then(|v| v.checked_add(amount_with_fee))
            .unwrap_or_else(|| panic!("overflow: denominator"));

        if denominator == 0 {
            panic!("division by zero: empty pool reserves");
        }

        numerator / denominator
    }

    fn get_rsrvs(e: Env) -> (i128, i128) {
        let pool_address: Address = e.storage().instance().get(&symbol_short!("POOL")).unwrap();
        // Call the underlying pool's reserve function
        e.invoke_contract(&pool_address, &symbol_short!("get_rsrvs"), vec![&e])
    }
}
