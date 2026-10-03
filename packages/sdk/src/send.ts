import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  type Commitment,
  createTransactionMessage,
  type GetEpochInfoApi,
  type GetLatestBlockhashApi,
  type GetSignatureStatusesApi,
  getSignatureFromTransaction,
  type Instruction,
  pipe,
  type Rpc,
  type RpcSubscriptions,
  type SendTransactionApi,
  type SignatureNotificationsApi,
  type SlotNotificationsApi,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type TransactionSigner,
} from "@solana/kit";

export interface SendInput {
  commitment?: Commitment;
  feePayer: TransactionSigner;
  instructions: Instruction[];
  rpc: Rpc<
    GetEpochInfoApi &
      GetLatestBlockhashApi &
      GetSignatureStatusesApi &
      SendTransactionApi
  >;
  rpcSubscriptions: RpcSubscriptions<
    SignatureNotificationsApi & SlotNotificationsApi
  >;
}

export const sendInstructions = async (input: SendInput) => {
  const { value: blockhash } = await input.rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (draft) => setTransactionMessageFeePayerSigner(input.feePayer, draft),
    (draft) => setTransactionMessageLifetimeUsingBlockhash(blockhash, draft),
    (draft) => appendTransactionMessageInstructions(input.instructions, draft)
  );
  const transaction = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(transaction);
  await sendAndConfirmTransactionFactory({
    rpc: input.rpc,
    rpcSubscriptions: input.rpcSubscriptions,
  })(transaction, { commitment: input.commitment ?? "confirmed" });
  return getSignatureFromTransaction(transaction);
};
