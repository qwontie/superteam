/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/pact.json`.
 */
export type Pact = {
  "address": "6uhLn2f5NZzydXocLTaxhGYKZ2pQQvrhrbwyMmM9YsCk",
  "metadata": {
    "name": "pact",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Trustless deals without intermediaries"
  },
  "instructions": [
    {
      "name": "ping",
      "discriminator": [
        173,
        0,
        94,
        236,
        73,
        133,
        225,
        153
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        }
      ],
      "args": []
    }
  ],
  "events": [
    {
      "name": "pinged",
      "discriminator": [
        50,
        38,
        24,
        188,
        75,
        109,
        130,
        119
      ]
    }
  ],
  "types": [
    {
      "name": "pinged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "caller",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
