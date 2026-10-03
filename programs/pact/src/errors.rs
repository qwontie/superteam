use anchor_lang::prelude::*;

#[error_code]
pub enum PactError {
    #[msg("Title must be 1 to 48 bytes")]
    TitleLength,
    #[msg("A deal needs 2 to 4 parties")]
    PartyCount,
    #[msg("The same party appears twice")]
    DuplicateParty,
    #[msg("Funder index is not a party")]
    FunderOutOfRange,
    #[msg("Amount must be above zero")]
    ZeroAmount,
    #[msg("A deal has at most 3 checks")]
    CheckCount,
    #[msg("Unknown check kind")]
    UnknownCheckKind,
    #[msg("Check target must be 1 to 128 bytes")]
    TargetLength,
    #[msg("Check expect must be at most 64 bytes")]
    ExpectLength,
    #[msg("A check needs 1 to 5 witnesses")]
    WitnessCount,
    #[msg("The same witness appears twice")]
    DuplicateWitness,
    #[msg("Threshold must be between 1 and the number of witnesses")]
    BadThreshold,
    #[msg("A deal needs 1 to 6 rules")]
    RuleCount,
    #[msg("A rule needs 1 to 4 conditions")]
    ConditionCount,
    #[msg("A rule needs 1 to 4 payouts")]
    PayoutCount,
    #[msg("Shares of a rule must add up to 10000")]
    SharesNotWhole,
    #[msg("Party index out of range")]
    PartyOutOfRange,
    #[msg("Check index out of range")]
    CheckOutOfRange,
    #[msg("Rule index out of range")]
    RuleOutOfRange,
    #[msg("No exit rule made only of time conditions")]
    NoExitRule,
    #[msg("The exit rule must open in the future")]
    ExitNotInFuture,
    #[msg("Deal is not a draft")]
    NotDraft,
    #[msg("Deal is not funded")]
    NotFunded,
    #[msg("Signer is not the funder of this deal")]
    WrongFunder,
    #[msg("Signer is not the creator of this deal")]
    NotCreator,
    #[msg("Signer is not a party of this deal")]
    NotAParty,
    #[msg("This party has already signaled")]
    AlreadySignaled,
    #[msg("Signer is not a witness of this check")]
    NotAWitness,
    #[msg("This witness has already voted")]
    AlreadyVoted,
    #[msg("A condition of this rule does not hold")]
    ConditionNotMet,
    #[msg("Payout accounts must be the deal parties, in order and writable")]
    WrongPayoutAccounts,
    #[msg("The funder cannot be an open slot")]
    FunderIsOpen,
    #[msg("A check can only bind an open slot")]
    BindsNotOpenSlot,
    #[msg("Two checks bind the same open slot")]
    DuplicateBinding,
    #[msg("A rule that pays an open slot must require the check that fills it")]
    UnboundPayout,
    #[msg("A yes vote on this check must name a nominee")]
    NomineeRequired,
    #[msg("This vote cannot carry a nominee")]
    NomineeNotExpected,
    #[msg("The nominee cannot be empty or an existing party")]
    BadNominee,
    #[msg("The open slot of this check is already filled")]
    AlreadyBound,
    #[msg("The rule pays an open slot that is still empty")]
    OpenSlotNotBound,
}
