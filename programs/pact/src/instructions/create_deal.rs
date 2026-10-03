use anchor_lang::prelude::*;

use crate::errors::PactError;
use crate::events::DealCreated;
use crate::state::*;

#[derive(Accounts)]
#[instruction(deal_id: u64)]
pub struct CreateDeal<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Deal::INIT_SPACE,
        seeds = [DEAL_SEED, creator.key().as_ref(), &deal_id.to_le_bytes()],
        bump,
    )]
    pub deal: Account<'info, Deal>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<CreateDeal>,
    deal_id: u64,
    title: String,
    parties: Vec<Pubkey>,
    funder: u8,
    amount: u64,
    checks: Vec<CheckSpec>,
    rules: Vec<Rule>,
) -> Result<()> {
    require!(
        (1..=MAX_TITLE_BYTES).contains(&title.len()),
        PactError::TitleLength
    );
    validate_parties(&parties, funder)?;
    require!(amount > 0, PactError::ZeroAmount);
    validate_checks(&checks)?;
    validate_rules(&rules, parties.len(), checks.len())?;
    validate_exit(&rules, Clock::get()?.unix_timestamp)?;

    let deal = &mut ctx.accounts.deal;
    deal.creator = ctx.accounts.creator.key();
    deal.deal_id = deal_id;
    deal.title = title;
    deal.signals = vec![None; parties.len()];
    deal.parties = parties;
    deal.funder = funder;
    deal.amount = amount;
    deal.status = DealStatus::Draft;
    deal.settled_rule = None;
    deal.checks = checks.into_iter().map(Check::from).collect();
    deal.rules = rules;
    deal.bump = ctx.bumps.deal;

    emit!(DealCreated {
        deal: deal.key(),
        creator: deal.creator,
        deal_id,
        amount,
    });
    Ok(())
}

fn validate_parties(parties: &[Pubkey], funder: u8) -> Result<()> {
    require!(
        (MIN_PARTIES..=MAX_PARTIES).contains(&parties.len()),
        PactError::PartyCount
    );
    require!(!has_duplicates(parties), PactError::DuplicateParty);
    require!(
        usize::from(funder) < parties.len(),
        PactError::FunderOutOfRange
    );
    Ok(())
}

fn validate_checks(checks: &[CheckSpec]) -> Result<()> {
    require!(checks.len() <= MAX_CHECKS, PactError::CheckCount);
    for check in checks {
        require!(check.kind <= MAX_CHECK_KIND, PactError::UnknownCheckKind);
        require!(
            (1..=MAX_TARGET_BYTES).contains(&check.target.len()),
            PactError::TargetLength
        );
        require!(
            check.expect.len() <= MAX_EXPECT_BYTES,
            PactError::ExpectLength
        );
        require!(
            (MIN_WITNESSES..=MAX_WITNESSES).contains(&check.witnesses.len()),
            PactError::WitnessCount
        );
        require!(
            !has_duplicates(&check.witnesses),
            PactError::DuplicateWitness
        );
        require!(
            (1..=check.witnesses.len()).contains(&usize::from(check.threshold)),
            PactError::BadThreshold
        );
    }
    Ok(())
}

fn validate_rules(rules: &[Rule], parties: usize, checks: usize) -> Result<()> {
    require!(
        (MIN_RULES..=MAX_RULES).contains(&rules.len()),
        PactError::RuleCount
    );
    for rule in rules {
        require!(
            (MIN_CONDITIONS..=MAX_CONDITIONS).contains(&rule.when.len()),
            PactError::ConditionCount
        );
        for condition in &rule.when {
            match *condition {
                Condition::After { .. } => {}
                Condition::Signed { party } | Condition::Unsigned { party } => {
                    require!(usize::from(party) < parties, PactError::PartyOutOfRange)
                }
                Condition::Attested { check } => {
                    require!(usize::from(check) < checks, PactError::CheckOutOfRange)
                }
            }
        }
        require!(
            (MIN_PAYOUTS..=MAX_PAYOUTS).contains(&rule.pay.len()),
            PactError::PayoutCount
        );
        for payout in &rule.pay {
            require!(
                usize::from(payout.party) < parties,
                PactError::PartyOutOfRange
            );
        }
        let total: u32 = rule.pay.iter().map(|payout| u32::from(payout.bps)).sum();
        require!(total == TOTAL_BPS, PactError::SharesNotWhole);
    }
    Ok(())
}

fn validate_exit(rules: &[Rule], now: i64) -> Result<()> {
    let latest_exit = rules.iter().filter_map(exit_time).max();
    match latest_exit {
        None => err!(PactError::NoExitRule),
        Some(ts) if ts <= now => err!(PactError::ExitNotInFuture),
        Some(_) => Ok(()),
    }
}

fn exit_time(rule: &Rule) -> Option<i64> {
    rule.when
        .iter()
        .map(|condition| match *condition {
            Condition::After { ts } => Some(ts),
            _ => None,
        })
        .collect::<Option<Vec<i64>>>()?
        .into_iter()
        .max()
}

fn has_duplicates(keys: &[Pubkey]) -> bool {
    keys.iter()
        .enumerate()
        .any(|(position, key)| keys[..position].contains(key))
}

impl From<CheckSpec> for Check {
    fn from(spec: CheckSpec) -> Self {
        Check {
            kind: spec.kind,
            target: spec.target,
            expect: spec.expect,
            witnesses: spec.witnesses,
            threshold: spec.threshold,
            yes: 0,
            no: 0,
        }
    }
}
