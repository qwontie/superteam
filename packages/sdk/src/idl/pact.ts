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
      "name": "attest",
      "discriminator": [
        83,
        148,
        120,
        119,
        144,
        139,
        117,
        160
      ],
      "accounts": [
        {
          "name": "witness",
          "signer": true
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.creator",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "check",
          "type": "u8"
        },
        {
          "name": "verdict",
          "type": "bool"
        }
      ]
    },
    {
      "name": "cancel",
      "discriminator": [
        232,
        219,
        223,
        41,
        219,
        236,
        220,
        190
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.creator",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createDeal",
      "discriminator": [
        198,
        212,
        144,
        151,
        97,
        56,
        149,
        113
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "dealId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "dealId",
          "type": "u64"
        },
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "parties",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "funder",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "checks",
          "type": {
            "vec": {
              "defined": {
                "name": "checkSpec"
              }
            }
          }
        },
        {
          "name": "rules",
          "type": {
            "vec": {
              "defined": {
                "name": "rule"
              }
            }
          }
        }
      ]
    },
    {
      "name": "execute",
      "discriminator": [
        130,
        221,
        242,
        154,
        13,
        193,
        189,
        29
      ],
      "accounts": [
        {
          "name": "executor",
          "signer": true
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.creator",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "rule",
          "type": "u8"
        }
      ]
    },
    {
      "name": "fund",
      "discriminator": [
        218,
        188,
        111,
        221,
        152,
        113,
        174,
        7
      ],
      "accounts": [
        {
          "name": "funder",
          "writable": true,
          "signer": true
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.creator",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "signal",
      "discriminator": [
        106,
        129,
        52,
        212,
        183,
        190,
        163,
        21
      ],
      "accounts": [
        {
          "name": "party",
          "signer": true
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.creator",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.dealId",
                "account": "deal"
              }
            ]
          }
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "deal",
      "discriminator": [
        125,
        223,
        160,
        234,
        71,
        162,
        182,
        219
      ]
    }
  ],
  "events": [
    {
      "name": "attested",
      "discriminator": [
        184,
        102,
        113,
        199,
        220,
        197,
        96,
        50
      ]
    },
    {
      "name": "dealCreated",
      "discriminator": [
        27,
        18,
        50,
        52,
        104,
        175,
        46,
        101
      ]
    },
    {
      "name": "dealFunded",
      "discriminator": [
        64,
        84,
        19,
        153,
        179,
        255,
        127,
        144
      ]
    },
    {
      "name": "executed",
      "discriminator": [
        8,
        232,
        139,
        132,
        197,
        45,
        29,
        164
      ]
    },
    {
      "name": "signaled",
      "discriminator": [
        61,
        209,
        52,
        36,
        211,
        226,
        143,
        82
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "titleLength",
      "msg": "Title must be 1 to 48 bytes"
    },
    {
      "code": 6001,
      "name": "partyCount",
      "msg": "A deal needs 2 to 4 parties"
    },
    {
      "code": 6002,
      "name": "duplicateParty",
      "msg": "The same party appears twice"
    },
    {
      "code": 6003,
      "name": "funderOutOfRange",
      "msg": "Funder index is not a party"
    },
    {
      "code": 6004,
      "name": "zeroAmount",
      "msg": "Amount must be above zero"
    },
    {
      "code": 6005,
      "name": "checkCount",
      "msg": "A deal has at most 2 checks"
    },
    {
      "code": 6006,
      "name": "unknownCheckKind",
      "msg": "Unknown check kind"
    },
    {
      "code": 6007,
      "name": "targetLength",
      "msg": "Check target must be 1 to 128 bytes"
    },
    {
      "code": 6008,
      "name": "expectLength",
      "msg": "Check expect must be at most 64 bytes"
    },
    {
      "code": 6009,
      "name": "witnessCount",
      "msg": "A check needs 1 to 5 witnesses"
    },
    {
      "code": 6010,
      "name": "duplicateWitness",
      "msg": "The same witness appears twice"
    },
    {
      "code": 6011,
      "name": "badThreshold",
      "msg": "Threshold must be between 1 and the number of witnesses"
    },
    {
      "code": 6012,
      "name": "ruleCount",
      "msg": "A deal needs 1 to 6 rules"
    },
    {
      "code": 6013,
      "name": "conditionCount",
      "msg": "A rule needs 1 to 4 conditions"
    },
    {
      "code": 6014,
      "name": "payoutCount",
      "msg": "A rule needs 1 to 4 payouts"
    },
    {
      "code": 6015,
      "name": "sharesNotWhole",
      "msg": "Shares of a rule must add up to 10000"
    },
    {
      "code": 6016,
      "name": "partyOutOfRange",
      "msg": "Party index out of range"
    },
    {
      "code": 6017,
      "name": "checkOutOfRange",
      "msg": "Check index out of range"
    },
    {
      "code": 6018,
      "name": "ruleOutOfRange",
      "msg": "Rule index out of range"
    },
    {
      "code": 6019,
      "name": "noExitRule",
      "msg": "No exit rule made only of time conditions"
    },
    {
      "code": 6020,
      "name": "exitNotInFuture",
      "msg": "The exit rule must open in the future"
    },
    {
      "code": 6021,
      "name": "notDraft",
      "msg": "Deal is not a draft"
    },
    {
      "code": 6022,
      "name": "notFunded",
      "msg": "Deal is not funded"
    },
    {
      "code": 6023,
      "name": "wrongFunder",
      "msg": "Signer is not the funder of this deal"
    },
    {
      "code": 6024,
      "name": "notCreator",
      "msg": "Signer is not the creator of this deal"
    },
    {
      "code": 6025,
      "name": "notAParty",
      "msg": "Signer is not a party of this deal"
    },
    {
      "code": 6026,
      "name": "alreadySignaled",
      "msg": "This party has already signaled"
    },
    {
      "code": 6027,
      "name": "notAWitness",
      "msg": "Signer is not a witness of this check"
    },
    {
      "code": 6028,
      "name": "alreadyVoted",
      "msg": "This witness has already voted"
    },
    {
      "code": 6029,
      "name": "conditionNotMet",
      "msg": "A condition of this rule does not hold"
    },
    {
      "code": 6030,
      "name": "wrongPayoutAccounts",
      "msg": "Payout accounts must be the deal parties, in order and writable"
    }
  ],
  "types": [
    {
      "name": "attested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "deal",
            "type": "pubkey"
          },
          {
            "name": "check",
            "type": "u8"
          },
          {
            "name": "witness",
            "type": "pubkey"
          },
          {
            "name": "verdict",
            "type": "bool"
          },
          {
            "name": "yes",
            "type": "u8"
          },
          {
            "name": "no",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "check",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "target",
            "type": "string"
          },
          {
            "name": "expect",
            "type": "string"
          },
          {
            "name": "witnesses",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "threshold",
            "type": "u8"
          },
          {
            "name": "yes",
            "type": "u8"
          },
          {
            "name": "no",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "checkSpec",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "target",
            "type": "string"
          },
          {
            "name": "expect",
            "type": "string"
          },
          {
            "name": "witnesses",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "threshold",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "condition",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "after",
            "fields": [
              {
                "name": "ts",
                "type": "i64"
              }
            ]
          },
          {
            "name": "signed",
            "fields": [
              {
                "name": "party",
                "type": "u8"
              }
            ]
          },
          {
            "name": "unsigned",
            "fields": [
              {
                "name": "party",
                "type": "u8"
              }
            ]
          },
          {
            "name": "attested",
            "fields": [
              {
                "name": "check",
                "type": "u8"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "deal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "dealId",
            "type": "u64"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "parties",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "funder",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "dealStatus"
              }
            }
          },
          {
            "name": "settledRule",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "signals",
            "type": {
              "vec": {
                "option": "i64"
              }
            }
          },
          {
            "name": "checks",
            "type": {
              "vec": {
                "defined": {
                  "name": "check"
                }
              }
            }
          },
          {
            "name": "rules",
            "type": {
              "vec": {
                "defined": {
                  "name": "rule"
                }
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "dealCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "deal",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "dealId",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "dealFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "deal",
            "type": "pubkey"
          },
          {
            "name": "funder",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "dealStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "draft"
          },
          {
            "name": "funded"
          },
          {
            "name": "settled"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "executed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "deal",
            "type": "pubkey"
          },
          {
            "name": "rule",
            "type": "u8"
          },
          {
            "name": "executor",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "payout",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "party",
            "type": "u8"
          },
          {
            "name": "bps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "rule",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "when",
            "type": {
              "vec": {
                "defined": {
                  "name": "condition"
                }
              }
            }
          },
          {
            "name": "pay",
            "type": {
              "vec": {
                "defined": {
                  "name": "payout"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "signaled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "deal",
            "type": "pubkey"
          },
          {
            "name": "party",
            "type": "u8"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
