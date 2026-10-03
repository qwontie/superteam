use anchor_lang::prelude::*;

use crate::errors::PactError;
use crate::events::DealClosed;
use crate::state::*;

#[derive(Accounts)]
pub struct Close<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        close = creator,
        has_one = creator @ PactError::NotCreator,
        seeds = [DEAL_SEED, deal.creator.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
    )]
    pub deal: Account<'info, Deal>,
}

pub fn handler(ctx: Context<Close>) -> Result<()> {
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Settled, PactError::NotSettled);

    emit!(DealClosed {
        deal: deal.key(),
        creator: deal.creator,
        lamports: deal.get_lamports(),
    });
    Ok(())
}
