use anchor_lang::prelude::*;

use crate::errors::PactError;
use crate::state::*;

#[derive(Accounts)]
pub struct Cancel<'info> {
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

pub fn handler(ctx: Context<Cancel>) -> Result<()> {
    require!(
        ctx.accounts.deal.status == DealStatus::Draft,
        PactError::NotDraft
    );
    Ok(())
}
