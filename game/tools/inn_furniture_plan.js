// Generated from docs/blueprints/inn_hideout_v2.json.
export const plan = {
  "name": "Inn / player hideout",
  "status": "painted furniture and expanded walls integrated; collision calibration in review",
  "units": "game world cells",
  "size": [
    20,
    18
  ],
  "entrance": {
    "side": "north",
    "span": [
      10,
      12
    ],
    "kind": "sliding door"
  },
  "rooms": [
    {
      "name": "Crew quarters",
      "rect": [
        0,
        0,
        6,
        9
      ]
    },
    {
      "name": "Guest room",
      "rect": [
        14.5,
        0,
        20,
        8
      ]
    },
    {
      "name": "Kitchen and stores",
      "rect": [
        0,
        9,
        6,
        18
      ]
    },
    {
      "name": "Planning and gear",
      "rect": [
        14.5,
        8,
        20,
        18
      ]
    },
    {
      "name": "Common hall",
      "rect": [
        6,
        0,
        14.5,
        18
      ]
    }
  ],
  "partitions": [
    {
      "along": "z",
      "at": 6,
      "segments": [
        [
          0,
          4
        ],
        [
          6,
          12
        ],
        [
          14,
          18
        ]
      ],
      "doorSpans": [
        [
          4,
          6
        ],
        [
          12,
          14
        ]
      ]
    },
    {
      "along": "z",
      "at": 14.5,
      "segments": [
        [
          0,
          4
        ],
        [
          6,
          12
        ],
        [
          14,
          18
        ]
      ],
      "doorSpans": [
        [
          4,
          6
        ],
        [
          12,
          14
        ]
      ]
    },
    {
      "along": "x",
      "at": 9,
      "segments": [
        [
          0,
          6
        ]
      ]
    },
    {
      "along": "x",
      "at": 8,
      "segments": [
        [
          14.5,
          20
        ]
      ]
    }
  ],
  "proposedWindows": [
    {
      "side": "north",
      "span": [
        2,
        4
      ]
    },
    {
      "side": "north",
      "span": [
        16,
        18
      ]
    },
    {
      "side": "west",
      "span": [
        3,
        5
      ]
    },
    {
      "side": "west",
      "span": [
        13,
        15
      ]
    },
    {
      "side": "east",
      "span": [
        3,
        5
      ]
    },
    {
      "side": "east",
      "span": [
        13,
        15
      ]
    },
    {
      "side": "south",
      "span": [
        2,
        4
      ]
    },
    {
      "side": "south",
      "span": [
        16,
        18
      ]
    }
  ],
  "objects": [
    {
      "id": "C1",
      "room": "Crew quarters",
      "name": "Crew futon 1",
      "rect": [
        0.8,
        1.6,
        3.7,
        3.1
      ]
    },
    {
      "id": "C2",
      "room": "Crew quarters",
      "name": "Crew futon 2",
      "rect": [
        0.8,
        5.6,
        3.7,
        7.1
      ]
    },
    {
      "id": "C3",
      "room": "Crew quarters",
      "name": "Clothing chest",
      "rect": [
        4.2,
        1.6,
        5.4,
        2.8
      ]
    },
    {
      "id": "C4",
      "room": "Crew quarters",
      "name": "Hanging lantern",
      "rect": [
        4,
        7,
        5,
        8
      ],
      "light": true,
      "mount": "ceiling"
    },
    {
      "id": "G1",
      "room": "Guest room",
      "name": "Guest futon 1",
      "rect": [
        16.3,
        1.6,
        19.2,
        3.1
      ]
    },
    {
      "id": "G2",
      "room": "Guest room",
      "name": "Guest futon 2",
      "rect": [
        16.3,
        5.6,
        19.2,
        6.8
      ]
    },
    {
      "id": "G3",
      "room": "Guest room",
      "name": "Guest clothing chest",
      "rect": [
        14.6,
        1.6,
        15.8,
        2.8
      ]
    },
    {
      "id": "G4",
      "room": "Guest room",
      "name": "Hanging lantern",
      "rect": [
        18,
        7,
        19,
        8
      ],
      "light": true,
      "mount": "ceiling"
    },
    {
      "id": "K1",
      "room": "Kitchen and stores",
      "name": "Cooking hearth",
      "rect": [
        0.8,
        10.5,
        3.2,
        12.5
      ]
    },
    {
      "id": "K2",
      "room": "Kitchen and stores",
      "name": "Food-preparation table",
      "rect": [
        1.1,
        13.2,
        3.5,
        14.5
      ]
    },
    {
      "id": "K3",
      "room": "Kitchen and stores",
      "name": "Pantry rack",
      "rect": [
        0.2,
        16.6,
        1.3,
        17.8
      ]
    },
    {
      "id": "K4",
      "room": "Kitchen and stores",
      "name": "Water tub",
      "rect": [
        2.4,
        15.8,
        3.5,
        16.9
      ]
    },
    {
      "id": "K5",
      "room": "Kitchen and stores",
      "name": "Hanging lantern",
      "rect": [
        4,
        16,
        5,
        17
      ],
      "light": true,
      "mount": "ceiling"
    },
    {
      "id": "P1",
      "room": "Planning and gear",
      "name": "Planning table",
      "rect": [
        16.3,
        10.2,
        18.7,
        11.7
      ]
    },
    {
      "id": "P2",
      "room": "Planning and gear",
      "name": "Map and document rack",
      "rect": [
        14.2,
        9.2,
        15.2,
        10.3
      ]
    },
    {
      "id": "P3",
      "room": "Planning and gear",
      "name": "Weapon rack",
      "rect": [
        14.2,
        10.6,
        15.2,
        11.7
      ]
    },
    {
      "id": "P4",
      "room": "Planning and gear",
      "name": "Gear chest",
      "rect": [
        15,
        15.3,
        17.2,
        16.5
      ]
    },
    {
      "id": "P5",
      "room": "Planning and gear",
      "name": "Hanging lantern",
      "rect": [
        18,
        16,
        19,
        17
      ],
      "light": true,
      "mount": "ceiling"
    },
    {
      "id": "H1",
      "room": "Common hall",
      "name": "Reception counter",
      "rect": [
        6.6,
        2.2,
        8.4,
        4.7
      ]
    },
    {
      "id": "H2",
      "room": "Common hall",
      "name": "Communal dining table",
      "rect": [
        8.8,
        7.4,
        11.6,
        9.1
      ]
    },
    {
      "id": "H3",
      "room": "Common hall",
      "name": "North-left seat cushion",
      "rect": [
        8.9,
        6.3,
        9.6,
        7
      ]
    },
    {
      "id": "H4",
      "room": "Common hall",
      "name": "North-right seat cushion",
      "rect": [
        10.8,
        6.3,
        11.5,
        7
      ]
    },
    {
      "id": "H5",
      "room": "Common hall",
      "name": "South-left seat cushion",
      "rect": [
        8.9,
        9.5,
        9.6,
        10.2
      ]
    },
    {
      "id": "H6",
      "room": "Common hall",
      "name": "South-right seat cushion",
      "rect": [
        10.8,
        9.5,
        11.5,
        10.2
      ]
    },
    {
      "id": "H7",
      "room": "Common hall",
      "name": "Linen and service shelf",
      "rect": [
        12.4,
        10.1,
        13.5,
        12
      ]
    },
    {
      "id": "H8",
      "room": "Common hall",
      "name": "Low tea table",
      "rect": [
        8.9,
        13.8,
        11.5,
        15.1
      ]
    },
    {
      "id": "H9",
      "room": "Common hall",
      "name": "North tea cushion",
      "rect": [
        9.8,
        12.8,
        10.6,
        13.5
      ]
    },
    {
      "id": "H10",
      "room": "Common hall",
      "name": "South tea cushion",
      "rect": [
        9.8,
        15.4,
        10.6,
        16.1
      ]
    },
    {
      "id": "H11",
      "room": "Common hall",
      "name": "Hanging lantern",
      "rect": [
        7,
        15,
        8,
        16
      ],
      "light": true,
      "mount": "ceiling"
    }
  ]
};
