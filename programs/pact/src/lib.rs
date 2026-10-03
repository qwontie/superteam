use anchor_lang::prelude::*;

declare_id!("6uhLn2f5NZzydXocLTaxhGYKZ2pQQvrhrbwyMmM9YsCk");

#[program]
pub mod pact {
    use super::*;

    pub fn ping(ctx: Context<Ping>) -> Result<()> {
        emit!(Pinged {
            caller: ctx.accounts.caller.key(),
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Ping<'info> {
    pub caller: Signer<'info>,
}

#[event]
pub struct Pinged {
    pub caller: Pubkey,
}
