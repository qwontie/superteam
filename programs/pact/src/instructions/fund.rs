use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::errors::PactError;
use crate::events::DealFunded;
use crate::state::*;

#[derive(Accounts)]
pub struct Fund<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.creator.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
    )]
    pub deal: Account<'info, Deal>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Fund>) -> Result<()> {
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Draft, PactError::NotDraft);
    require_keys_eq!(
        ctx.accounts.funder.key(),
        deal.parties[usize::from(deal.funder)],
        PactError::WrongFunder
    );

    let amount = deal.amount;
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.funder.to_account_info(),
                to: ctx.accounts.deal.to_account_info(),
            },
        ),
        amount,
    )?;

    let deal = &mut ctx.accounts.deal;
    deal.status = DealStatus::Funded;
    emit!(DealFunded {
        deal: deal.key(),
        funder: ctx.accounts.funder.key(),
        amount,
    });
    Ok(())
}
