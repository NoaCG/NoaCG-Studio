// THE PAUSE CONFORMANCE TABLE - Another system's Pause written down as data (docs/DATA_API.md
// "Pause"; data-sources C5, AC-7).
//
// Pause is the database's alone (supabase/migrations/0100_data_api_pause.sql): `/patch` merges into
// the tree and skips the resolve-diff-append, `/update` is held per graphic, operator presses and the
// server tick still air, and Resume sends exactly the final values once. So the cases are answered by
// the real plpgsql bodies: 0100's self-check runs every case below on a throwaway production, from a
// literal embedded in the migration, and scripts/data-pause.test.mjs fails the build unless that
// literal still equals this table. A case added later is answered by a later migration that calls
// the same bodies, as 0096 does for the merge-patch table.
//
// Steps: `patch` (/patch with the data key), `update` (/update: one graphic's field values), `press`
// (an operator press), `sheet` (the server tick), `owner` (the owner's Data view), `pause`, `resume`,
// and `data` (the tree operators read at that moment must be `expect`: while paused, what is on air).
// `rows` are the update rows the case appends, in order, as {graphic, src, data}; `data_after` is the
// final tree.

/** @type {{name: string, bindings: Record<string, Record<string, string>>, data: object, steps: object[], rows: object[], data_after: object}[]} */
export const PAUSE_CONFORMANCE = [
  {
    "name": "a paused patch keeps the tree and writes no row; Resume sends the final value once",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 2
            }
          }
        }
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 3
            }
          }
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "api",
        "data": {
          "f0": "3"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 3
        }
      }
    }
  },
  {
    "name": "an operator press airs at once while paused and is not sent again by Resume",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score",
        "f1": "show.title"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      },
      "show": {
        "title": "A"
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 2
            }
          }
        }
      },
      {
        "op": "press",
        "patch": {
          "show": {
            "title": "B"
          }
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "operator",
        "data": {
          "f1": "B"
        }
      },
      {
        "graphic": "Bug",
        "src": "api",
        "data": {
          "f0": "2"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 2
        }
      },
      "show": {
        "title": "B"
      }
    }
  },
  {
    "name": "a press on a path the API holds wins and Resume sends nothing for it",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 2
            }
          }
        }
      },
      {
        "op": "press",
        "patch": {
          "api": {
            "bug": {
              "score": 5
            }
          }
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "operator",
        "data": {
          "f0": "5"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 5
        }
      }
    }
  },
  {
    "name": "a press of the value the API holds still airs, because air is the paused tree",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 3
            }
          }
        }
      },
      {
        "op": "sheet",
        "patch": {
          "api": {
            "bug": {
              "score": 3
            }
          }
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "sheet",
        "data": {
          "f0": "3"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 3
        }
      }
    }
  },
  {
    "name": "a null while paused deletes the path and Resume sends nothing for it, as an unpaused null",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score",
        "f1": "api.bug.name"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1,
          "name": "A"
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 2,
              "name": "B"
            }
          }
        }
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": null
            }
          }
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "api",
        "data": {
          "f1": "B"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "name": "B"
        }
      }
    }
  },
  {
    "name": "a value sent after a null while paused is the final value",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": null
            }
          }
        }
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 4
            }
          }
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "api",
        "data": {
          "f0": "4"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 4
        }
      }
    }
  },
  {
    "name": "Resume after an unchanged value sends nothing",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 2
            }
          }
        }
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 1
            }
          }
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [],
    "data_after": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    }
  },
  {
    "name": "an /update while paused is held newest per field and sent after the diff, one row per graphic",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "update",
        "graphic": "Card",
        "data": {
          "f0": "a",
          "f1": "b"
        }
      },
      {
        "op": "update",
        "graphic": "Card",
        "data": {
          "f0": "c"
        }
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 2
            }
          }
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "api",
        "data": {
          "f0": "2"
        }
      },
      {
        "graphic": "Card",
        "src": "api",
        "data": {
          "f0": "c",
          "f1": "b"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 2
        }
      }
    }
  },
  {
    "name": "a held /update to a bound field is laid over the diff in the same row",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score",
        "f1": "api.bug.name"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1,
          "name": "A"
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 2,
              "name": "B"
            }
          }
        }
      },
      {
        "op": "update",
        "graphic": "Bug",
        "data": {
          "f0": "9"
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "api",
        "data": {
          "f0": "9",
          "f1": "B"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 2,
          "name": "B"
        }
      }
    }
  },
  {
    "name": "pausing twice holds once, and a second Resume sends nothing more",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "resume"
      },
      {
        "op": "pause"
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 2
            }
          }
        }
      },
      {
        "op": "pause"
      },
      {
        "op": "resume"
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "api",
        "data": {
          "f0": "2"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 2
        }
      }
    }
  },
  {
    "name": "unpaused, a patch and an /update air at once as before",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 2
            }
          }
        }
      },
      {
        "op": "update",
        "graphic": "Card",
        "data": {
          "f0": "x"
        }
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "api",
        "data": {
          "f0": "2"
        }
      },
      {
        "graphic": "Card",
        "src": "api",
        "data": {
          "f0": "x"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 2
        }
      }
    }
  },
  {
    "name": "while paused, operators read the on-air tree; Resume makes the API's tree the tree",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 2
            }
          }
        }
      },
      {
        "op": "data",
        "expect": {
          "api": {
            "bug": {
              "score": 1
            }
          }
        }
      },
      {
        "op": "resume"
      },
      {
        "op": "data",
        "expect": {
          "api": {
            "bug": {
              "score": 2
            }
          }
        }
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "api",
        "data": {
          "f0": "2"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 2
        }
      }
    }
  },
  {
    "name": "a press after a held /update supersedes it",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "update",
        "graphic": "Bug",
        "data": {
          "f0": "9"
        }
      },
      {
        "op": "press",
        "patch": {
          "api": {
            "bug": {
              "score": 5
            }
          }
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "operator",
        "data": {
          "f0": "5"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 5
        }
      }
    }
  },
  {
    "name": "a /patch after a held /update moves the field, so the patch's value is final",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "update",
        "graphic": "Bug",
        "data": {
          "f0": "9"
        }
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 2
            }
          }
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "api",
        "data": {
          "f0": "2"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 2
        }
      }
    }
  },
  {
    "name": "a value the API sends after a press is the final value",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "press",
        "patch": {
          "api": {
            "bug": {
              "score": 5
            }
          }
        }
      },
      {
        "op": "patch",
        "patch": {
          "api": {
            "bug": {
              "score": 3
            }
          }
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "operator",
        "data": {
          "f0": "5"
        }
      },
      {
        "graphic": "Bug",
        "src": "api",
        "data": {
          "f0": "3"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 3
        }
      }
    }
  },
  {
    "name": "the owner's Data view airs while paused and is not a receipt",
    "bindings": {
      "Bug": {
        "f0": "api.bug.score"
      }
    },
    "data": {
      "api": {
        "bug": {
          "score": 1
        }
      }
    },
    "steps": [
      {
        "op": "pause"
      },
      {
        "op": "owner",
        "patch": {
          "api": {
            "bug": {
              "score": 4
            }
          }
        }
      },
      {
        "op": "resume"
      }
    ],
    "rows": [
      {
        "graphic": "Bug",
        "src": "operator",
        "data": {
          "f0": "4"
        }
      }
    ],
    "data_after": {
      "api": {
        "bug": {
          "score": 4
        }
      }
    }
  }
];
