use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::{CheckSpec, Rule};

declare_id!("6uhLn2f5NZzydXocLTaxhGYKZ2pQQvrhrbwyMmM9YsCk");

#[program]
pub mod pact {
    use super::*;

    #[allow(clippy::too_many_arguments)]
    pub fn create_deal(
        ctx: Context<CreateDeal>,
        deal_id: u64,
        title: String,
        parties: Vec<Pubkey>,
        funder: u8,
        amount: u64,
        checks: Vec<CheckSpec>,
        rules: Vec<Rule>,
    ) -> Result<()> {
        instructions::create_deal::handler(
            ctx, deal_id, title, parties, funder, amount, checks, rules,
        )
    }

    pub fn fund(ctx: Context<Fund>) -> Result<()> {
        instructions::fund::handler(ctx)
    }

    pub fn signal(ctx: Context<Signal>) -> Result<()> {
        instructions::signal::handler(ctx)
    }

    pub fn attest(ctx: Context<Attest>, check: u8, verdict: bool) -> Result<()> {
        instructions::attest::handler(ctx, check, verdict)
    }

    pub fn execute<'info>(ctx: Context<'info, Execute<'info>>, rule: u8) -> Result<()> {
        instructions::execute::handler(ctx, rule)
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        instructions::cancel::handler(ctx)
    }
}
