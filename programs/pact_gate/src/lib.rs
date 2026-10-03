use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use solana_program_v2::account_info::AccountInfo as AccountInfoV2;
use solana_program_v2::pubkey::Pubkey as PubkeyV2;
use switchboard_on_demand::QuoteVerifier;

declare_id!("CYb16ChX7J5LPB6nv8HtPVmLE72cjhgHpKCxoujrgUmn");

pub const GATE_SEED: &[u8] = b"gate";
pub const MIN_SIGNATURES: u8 = 3;
pub const MAX_AGE_SLOTS: u64 = 150;
pub const TRUE_VALUE: i128 = 1_000_000_000_000_000_000;
pub const PACT_PROGRAM: Pubkey = pubkey!("6uhLn2f5NZzydXocLTaxhGYKZ2pQQvrhrbwyMmM9YsCk");
pub const SWITCHBOARD_QUEUE: Pubkey = pubkey!("EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7");
const SLOT_HASHES: Pubkey = pubkey!("SysvarS1otHashes111111111111111111111111111");
const INSTRUCTIONS: Pubkey = pubkey!("Sysvar1nstructions1111111111111111111111111");
const ATTEST_DISCRIMINATOR: [u8; 8] = [83, 148, 120, 119, 144, 139, 117, 160];

#[program]
pub mod pact_gate {
    use super::*;

    pub fn confirm(ctx: Context<Confirm>, feed_hash: [u8; 32], check: u8) -> Result<()> {
        let quote = verify_quote(ctx.accounts)?;
        require!(
            quote.signatures >= MIN_SIGNATURES,
            GateError::TooFewSignatures
        );
        let value = quote
            .feeds
            .iter()
            .find(|(feed, _)| *feed == feed_hash)
            .map(|(_, value)| *value)
            .ok_or(GateError::WrongFeed)?;
        require!(value == TRUE_VALUE, GateError::NotTrue);

        let mut data = ATTEST_DISCRIMINATOR.to_vec();
        data.extend_from_slice(&[check, 1, 0]);
        let attest = Instruction {
            program_id: PACT_PROGRAM,
            accounts: vec![
                AccountMeta::new_readonly(ctx.accounts.gate.key(), true),
                AccountMeta::new(ctx.accounts.deal.key(), false),
            ],
            data,
        };
        invoke_signed(
            &attest,
            &[
                ctx.accounts.gate.to_account_info(),
                ctx.accounts.deal.to_account_info(),
                ctx.accounts.pact_program.to_account_info(),
            ],
            &[&[GATE_SEED, feed_hash.as_ref(), &[ctx.bumps.gate]]],
        )?;

        emit!(Confirmed {
            feed_hash,
            deal: ctx.accounts.deal.key(),
            check,
            slot: quote.slot,
            signatures: quote.signatures,
        });
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(feed_hash: [u8; 32])]
pub struct Confirm<'info> {
    /// CHECK: signs the attest call as the witness of the feed hash, holds no data
    #[account(seeds = [GATE_SEED, feed_hash.as_ref()], bump)]
    pub gate: UncheckedAccount<'info>,
    /// CHECK: the pact program checks the deal and that the gate is its witness
    #[account(mut, owner = PACT_PROGRAM)]
    pub deal: UncheckedAccount<'info>,
    /// CHECK: pinned to the Switchboard devnet queue by address
    #[account(address = SWITCHBOARD_QUEUE)]
    pub queue: UncheckedAccount<'info>,
    /// CHECK: SlotHashes sysvar
    #[account(address = SLOT_HASHES)]
    pub slothashes: UncheckedAccount<'info>,
    /// CHECK: Instructions sysvar
    #[account(address = INSTRUCTIONS)]
    pub instructions: UncheckedAccount<'info>,
    /// CHECK: pinned to the pact program by address
    #[account(address = PACT_PROGRAM)]
    pub pact_program: UncheckedAccount<'info>,
}

struct Quote {
    slot: u64,
    signatures: u8,
    feeds: Vec<([u8; 32], i128)>,
}

fn verify_quote(accounts: &Confirm) -> Result<Quote> {
    let ix_info = accounts.instructions.to_account_info();
    let ix_index = {
        let data = ix_info.try_borrow_data()?;
        require!(data.len() >= 2, GateError::MissingQuote);
        u16::from_le_bytes([data[data.len() - 2], data[data.len() - 1]])
    };
    require!(ix_index > 0, GateError::MissingQuote);
    let clock_slot = Clock::get()?.slot;
    let queue_info = accounts.queue.to_account_info();
    let slot_info = accounts.slothashes.to_account_info();
    let mut queue_data = queue_info.try_borrow_mut_data()?;
    let mut slot_data = slot_info.try_borrow_mut_data()?;
    let mut ix_data = ix_info.try_borrow_mut_data()?;
    let (mut queue_lamports, mut slot_lamports, mut ix_lamports) = (0u64, 0u64, 0u64);
    let queue_owner = PubkeyV2::new_from_array(queue_info.owner.to_bytes());
    let sysvar_owner = PubkeyV2::new_from_array(slot_info.owner.to_bytes());
    let queue_key = PubkeyV2::new_from_array(queue_info.key.to_bytes());
    let slot_key = PubkeyV2::new_from_array(slot_info.key.to_bytes());
    let ix_key = PubkeyV2::new_from_array(ix_info.key.to_bytes());
    let queue_v2 = AccountInfoV2::new(
        &queue_key,
        false,
        false,
        &mut queue_lamports,
        &mut queue_data,
        &queue_owner,
        false,
        0,
    );
    let slot_v2 = AccountInfoV2::new(
        &slot_key,
        false,
        false,
        &mut slot_lamports,
        &mut slot_data,
        &sysvar_owner,
        false,
        0,
    );
    let ix_v2 = AccountInfoV2::new(
        &ix_key,
        false,
        false,
        &mut ix_lamports,
        &mut ix_data,
        &sysvar_owner,
        false,
        0,
    );
    let quote = QuoteVerifier::new()
        .queue(&queue_v2)
        .slothash_sysvar(&slot_v2)
        .ix_sysvar(&ix_v2)
        .clock_slot(clock_slot)
        .max_age(MAX_AGE_SLOTS)
        .verify_instruction_at(i64::from(ix_index) - 1)
        .map_err(|_| error!(GateError::QuoteRejected))?;
    let count = usize::from(quote.oracle_count);
    for i in 0..count {
        for j in (i + 1)..count {
            require!(
                quote.oracle_idxs[i] != quote.oracle_idxs[j],
                GateError::DuplicateOracle
            );
        }
    }
    Ok(Quote {
        slot: quote.recent_slot,
        signatures: quote.oracle_count,
        feeds: quote
            .feeds()
            .iter()
            .map(|feed| (*feed.feed_id(), feed.feed_value()))
            .collect(),
    })
}

#[event]
pub struct Confirmed {
    pub feed_hash: [u8; 32],
    pub deal: Pubkey,
    pub check: u8,
    pub slot: u64,
    pub signatures: u8,
}

#[error_code]
pub enum GateError {
    #[msg("No Switchboard quote instruction before confirm")]
    MissingQuote,
    #[msg("Switchboard quote failed verification")]
    QuoteRejected,
    #[msg("Quote has fewer oracle signatures than required")]
    TooFewSignatures,
    #[msg("Quote is signed twice by the same oracle")]
    DuplicateOracle,
    #[msg("Quote does not contain the gate's feed")]
    WrongFeed,
    #[msg("Feed value is not true")]
    NotTrue,
}
