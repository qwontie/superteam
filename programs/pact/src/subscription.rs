use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::errors::PactError;

pub const SUBSCRIPTION_SEED: &[u8] = b"sub";
pub const PRICE_LAMPORTS: u64 = 50_000_000;
pub const PERIOD_SECONDS: i64 = 30 * 24 * 60 * 60;
pub const MAX_PERIODS: u8 = 12;
pub const REVENUE: Pubkey = pubkey!("3p4TEJLZo7mA1pqcK8bRiLtNd1kVEPAHRLSwzwcRoHrQ");

#[account]
#[derive(InitSpace)]
pub struct Subscription {
    pub user: Pubkey,
    pub expires_at: i64,
    pub bump: u8,
}

#[event]
pub struct Subscribed {
    pub user: Pubkey,
    pub expires_at: i64,
    pub lamports: u64,
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Subscription::INIT_SPACE,
        seeds = [SUBSCRIPTION_SEED, user.key().as_ref()],
        bump,
    )]
    pub subscription: Account<'info, Subscription>,
    #[account(mut, address = REVENUE @ PactError::WrongRevenue)]
    pub revenue: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn subscribe(ctx: Context<Subscribe>, periods: u8) -> Result<()> {
    require!((1..=MAX_PERIODS).contains(&periods), PactError::BadPeriods);
    let lamports = PRICE_LAMPORTS * u64::from(periods);
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.revenue.to_account_info(),
            },
        ),
        lamports,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let subscription = &mut ctx.accounts.subscription;
    subscription.user = ctx.accounts.user.key();
    subscription.bump = ctx.bumps.subscription;
    subscription.expires_at =
        subscription.expires_at.max(now) + PERIOD_SECONDS * i64::from(periods);

    emit!(Subscribed {
        user: subscription.user,
        expires_at: subscription.expires_at,
        lamports,
    });
    Ok(())
}
