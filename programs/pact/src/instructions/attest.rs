use anchor_lang::prelude::*;

use crate::errors::PactError;
use crate::events::Attested;
use crate::state::*;

#[derive(Accounts)]
pub struct Attest<'info> {
    pub witness: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.creator.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
    )]
    pub deal: Account<'info, Deal>,
}

pub fn handler(ctx: Context<Attest>, check: u8, verdict: bool) -> Result<()> {
    let deal_key = ctx.accounts.deal.key();
    let deal = &mut ctx.accounts.deal;
    require!(deal.status == DealStatus::Funded, PactError::NotFunded);
    let target = deal
        .checks
        .get_mut(usize::from(check))
        .ok_or(PactError::CheckOutOfRange)?;
    let witness = target
        .witnesses
        .iter()
        .position(|key| key == ctx.accounts.witness.key)
        .ok_or(PactError::NotAWitness)?;

    let bit = 1u8 << witness;
    require!((target.yes | target.no) & bit == 0, PactError::AlreadyVoted);
    if verdict {
        target.yes |= bit;
    } else {
        target.no |= bit;
    }

    emit!(Attested {
        deal: deal_key,
        check,
        witness: ctx.accounts.witness.key(),
        verdict,
        yes: target.yes.count_ones() as u8,
        no: target.no.count_ones() as u8,
    });
    Ok(())
}
