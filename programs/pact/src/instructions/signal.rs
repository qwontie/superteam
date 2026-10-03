use anchor_lang::prelude::*;

use crate::errors::PactError;
use crate::events::Signaled;
use crate::state::*;

#[derive(Accounts)]
pub struct Signal<'info> {
    pub party: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.creator.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
    )]
    pub deal: Account<'info, Deal>,
}

pub fn handler(ctx: Context<Signal>) -> Result<()> {
    let deal = &mut ctx.accounts.deal;
    require!(deal.status == DealStatus::Funded, PactError::NotFunded);
    let party = deal
        .party_index(ctx.accounts.party.key)
        .ok_or(PactError::NotAParty)?;
    require!(deal.signals[party].is_none(), PactError::AlreadySignaled);

    let now = Clock::get()?.unix_timestamp;
    deal.signals[party] = Some(now);

    emit!(Signaled {
        deal: deal.key(),
        party: party as u8,
        ts: now,
    });
    Ok(())
}
