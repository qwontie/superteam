use anchor_lang::prelude::*;

pub const DEAL_SEED: &[u8] = b"deal";
pub const TOTAL_BPS: u32 = 10_000;
pub const MAX_TITLE_BYTES: usize = 48;
pub const MIN_PARTIES: usize = 2;
pub const MAX_PARTIES: usize = 4;
pub const MAX_CHECKS: usize = 2;
pub const MAX_CHECK_KIND: u8 = 2;
pub const MAX_TARGET_BYTES: usize = 128;
pub const MAX_EXPECT_BYTES: usize = 64;
pub const MIN_WITNESSES: usize = 1;
pub const MAX_WITNESSES: usize = 5;
pub const MIN_RULES: usize = 1;
pub const MAX_RULES: usize = 6;
pub const MIN_CONDITIONS: usize = 1;
pub const MAX_CONDITIONS: usize = 4;
pub const MIN_PAYOUTS: usize = 1;
pub const MAX_PAYOUTS: usize = 4;

#[account]
#[derive(InitSpace)]
pub struct Deal {
    pub creator: Pubkey,
    pub deal_id: u64,
    #[max_len(MAX_TITLE_BYTES)]
    pub title: String,
    #[max_len(MAX_PARTIES)]
    pub parties: Vec<Pubkey>,
    pub funder: u8,
    pub amount: u64,
    pub status: DealStatus,
    pub settled_rule: Option<u8>,
    #[max_len(MAX_PARTIES)]
    pub signals: Vec<Option<i64>>,
    #[max_len(MAX_CHECKS)]
    pub checks: Vec<Check>,
    #[max_len(MAX_RULES)]
    pub rules: Vec<Rule>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum DealStatus {
    Draft,
    Funded,
    Settled,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Check {
    pub kind: u8,
    #[max_len(MAX_TARGET_BYTES)]
    pub target: String,
    #[max_len(MAX_EXPECT_BYTES)]
    pub expect: String,
    #[max_len(MAX_WITNESSES)]
    pub witnesses: Vec<Pubkey>,
    pub threshold: u8,
    pub yes: u8,
    pub no: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CheckSpec {
    pub kind: u8,
    pub target: String,
    pub expect: String,
    pub witnesses: Vec<Pubkey>,
    pub threshold: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Rule {
    #[max_len(MAX_CONDITIONS)]
    pub when: Vec<Condition>,
    #[max_len(MAX_PAYOUTS)]
    pub pay: Vec<Payout>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub enum Condition {
    After { ts: i64 },
    Signed { party: u8 },
    Unsigned { party: u8 },
    Attested { check: u8 },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct Payout {
    pub party: u8,
    pub bps: u16,
}

impl Deal {
    pub fn holds(&self, condition: &Condition, now: i64) -> bool {
        match *condition {
            Condition::After { ts } => now >= ts,
            Condition::Signed { party } => self.signals[party as usize].is_some(),
            Condition::Unsigned { party } => self.signals[party as usize].is_none(),
            Condition::Attested { check } => self.checks[check as usize].passed(),
        }
    }

    pub fn party_index(&self, key: &Pubkey) -> Option<usize> {
        self.parties.iter().position(|party| party == key)
    }
}

impl Check {
    pub fn passed(&self) -> bool {
        self.yes.count_ones() >= u32::from(self.threshold)
    }
}
