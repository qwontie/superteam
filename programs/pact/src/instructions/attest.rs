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

pub fn handler(
    ctx: Context<Attest>,
    check: u8,
    verdict: bool,
    nominee: Option<Pubkey>,
) -> Result<()> {
    let deal_key = ctx.accounts.deal.key();
    let deal = &mut ctx.accounts.deal;
    require!(deal.status == DealStatus::Funded, PactError::NotFunded);
    let target = deal
        .checks
        .get(usize::from(check))
        .ok_or(PactError::CheckOutOfRange)?;
    let witness = target
        .witnesses
        .iter()
        .position(|key| key == ctx.accounts.witness.key)
        .ok_or(PactError::NotAWitness)?;
    let bit = 1u8 << witness;
    require!((target.yes | target.no) & bit == 0, PactError::AlreadyVoted);
    validate_nominee(deal, target, verdict, nominee)?;

    let binds = target.binds;
    let threshold = target.threshold;
    let target = &mut deal.checks[usize::from(check)];
    if verdict {
        target.yes |= bit;
    } else {
        target.no |= bit;
    }
    if let Some(nominee) = nominee {
        target.nominees[witness] = nominee;
    }
    let yes = target.yes.count_ones() as u8;
    let no = target.no.count_ones() as u8;

    if let (Some(slot), Some(nominee)) = (binds, nominee) {
        if target.yes_votes_for(&nominee) >= threshold {
            deal.parties[usize::from(slot)] = nominee;
        }
    }

    emit!(Attested {
        deal: deal_key,
        check,
        witness: ctx.accounts.witness.key(),
        verdict,
        nominee,
        yes,
        no,
    });
    Ok(())
}

fn validate_nominee(
    deal: &Deal,
    check: &Check,
    verdict: bool,
    nominee: Option<Pubkey>,
) -> Result<()> {
    let Some(slot) = check.binds else {
        require!(nominee.is_none(), PactError::NomineeNotExpected);
        return Ok(());
    };
    require!(
        deal.parties[usize::from(slot)] == OPEN_SLOT,
        PactError::AlreadyBound
    );
    match (verdict, nominee) {
        (true, None) => err!(PactError::NomineeRequired),
        (false, Some(_)) => err!(PactError::NomineeNotExpected),
        (true, Some(key)) => {
            require!(
                key != OPEN_SLOT && deal.party_index(&key).is_none(),
                PactError::BadNominee
            );
            Ok(())
        }
        (false, None) => Ok(()),
    }
}
