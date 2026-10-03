use anchor_lang::prelude::*;

#[event]
pub struct DealCreated {
    pub deal: Pubkey,
    pub creator: Pubkey,
    pub deal_id: u64,
    pub amount: u64,
}

#[event]
pub struct DealFunded {
    pub deal: Pubkey,
    pub funder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Signaled {
    pub deal: Pubkey,
    pub party: u8,
    pub ts: i64,
}

#[event]
pub struct Attested {
    pub deal: Pubkey,
    pub check: u8,
    pub witness: Pubkey,
    pub verdict: bool,
    pub nominee: Option<Pubkey>,
    pub yes: u8,
    pub no: u8,
}

#[event]
pub struct Executed {
    pub deal: Pubkey,
    pub rule: u8,
    pub executor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DealClosed {
    pub deal: Pubkey,
    pub creator: Pubkey,
    pub lamports: u64,
}
