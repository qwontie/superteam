use anchor_lang::prelude::*;

use crate::errors::PactError;
use crate::events::Executed;
use crate::state::*;

#[derive(Accounts)]
pub struct Execute<'info> {
    pub executor: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.creator.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
    )]
    pub deal: Account<'info, Deal>,
}

pub fn handler<'info>(ctx: Context<'info, Execute<'info>>, rule_index: u8) -> Result<()> {
    let deal = &ctx.accounts.deal;
    let recipients = ctx.remaining_accounts;

    require!(deal.status == DealStatus::Funded, PactError::NotFunded);
    let rule = deal
        .rules
        .get(usize::from(rule_index))
        .ok_or(PactError::RuleOutOfRange)?;

    let now = Clock::get()?.unix_timestamp;
    for condition in &rule.when {
        require!(deal.holds(condition, now), PactError::ConditionNotMet);
    }

    require!(
        recipients.len() == deal.parties.len(),
        PactError::WrongPayoutAccounts
    );
    for (account, party) in recipients.iter().zip(&deal.parties) {
        require!(account.key == party, PactError::WrongPayoutAccounts);
    }

    let amount = deal.amount;
    let payouts = split(amount, &rule.pay);
    let deal_info = deal.to_account_info();
    for (party, lamports) in payouts {
        let recipient = &recipients[usize::from(party)];
        require!(*recipient.key != OPEN_SLOT, PactError::OpenSlotNotBound);
        require!(recipient.is_writable, PactError::WrongPayoutAccounts);
        deal_info.sub_lamports(lamports)?;
        recipient.add_lamports(lamports)?;
    }

    let deal = &mut ctx.accounts.deal;
    deal.status = DealStatus::Settled;
    deal.settled_rule = Some(rule_index);

    emit!(Executed {
        deal: deal.key(),
        rule: rule_index,
        executor: ctx.accounts.executor.key(),
        amount,
    });
    Ok(())
}

fn split(amount: u64, pay: &[Payout]) -> Vec<(u8, u64)> {
    let mut left = amount;
    let mut payouts: Vec<(u8, u64)> = pay
        .iter()
        .map(|payout| {
            let share =
                (u128::from(amount) * u128::from(payout.bps) / u128::from(TOTAL_BPS)) as u64;
            left -= share;
            (payout.party, share)
        })
        .collect();
    if let Some(last) = payouts.last_mut() {
        last.1 += left;
    }
    payouts
}
