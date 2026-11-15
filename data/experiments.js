// Experiments section (Sec. V of the paper, release version of 2026-11-11). Every number below is copied
// from the paper's tables / figure; success rates are in percent. Suite columns follow the tables:
// rigid SG SX DG DX, then deformable SG SX DG DX (S/D = single/dual arm, G/X = gripper/dexterous hand).
// Rows are Level 1..4.
window.MANILADDER_EXPERIMENTS = {
 "paper": "ManiLadder paper, release version (2026-11-11), Sec. V",
 "suites": [
  { "object": "rigid_body", "embodiment": "single_arm_gripper", "short": "SG", "tasks": 4 },
  { "object": "rigid_body", "embodiment": "single_arm_dex", "short": "SX", "tasks": 4 },
  { "object": "rigid_body", "embodiment": "dual_arm_gripper", "short": "DG", "tasks": 4 },
  { "object": "rigid_body", "embodiment": "dual_arm_dex", "short": "DX", "tasks": 4 },
  { "object": "deformable", "embodiment": "single_arm_gripper", "short": "SG", "tasks": 3 },
  { "object": "deformable", "embodiment": "single_arm_dex", "short": "SX", "tasks": 3 },
  { "object": "deformable", "embodiment": "dual_arm_gripper", "short": "DG", "tasks": 3 },
  { "object": "deformable", "embodiment": "dual_arm_dex", "short": "DX", "tasks": 3 }
 ],

 // Q1 · Table IV (π0.5 single-task and its change vs. the small flow-matching policy) and
 //      Table V (GPT6-Astra and its change vs. π0.5). Small FM = π0.5 − (π0.5 vs FM).
 "q1": {
  "source": "Paper, Tables IV and V",
  "pi05": [
   [48.0, 95.5, 83.0, 59.5, 70.7, 92.7, 68.0, 90.7],
   [38.0, 52.5, 41.5, 13.5, 50.7, 75.3, 30.7, 28.7],
   [11.5, 9.0, 3.5, 6.0, 48.7, 28.0, 17.3, 12.7],
   [5.0, 2.0, 0.5, 2.0, 2.7, 2.0, 0.7, 1.3]
  ],
  "pi05VsFm": [
   [-23.5, 27.5, 9.5, -13.5, 0.7, 16.7, -2.0, 20.7],
   [2.5, 17.0, 2.5, -27.5, 13.3, 36.0, -2.0, -10.0],
   [3.0, 0.0, -5.0, -3.5, 34.0, 11.3, 4.0, -6.0],
   [5.0, 2.0, 0.5, 2.0, 2.7, 0.7, 0.7, 1.3]
  ],
  "astra": [
   [55.5, 78.0, 83.5, 33.0, 54.7, 95.3, 69.3, 76.7],
   [44.5, 65.5, 25.0, 51.5, 30.7, 49.3, 94.0, 8.0],
   [41.5, 27.0, 10.5, 37.3, 37.3, 34.7, 14.6, 0.0],
   [0.0, 7.0, 38.0, 0.0, 3.3, 13.3, 0.0, 15.3]
  ],
  "astraVsPi05": [
   [7.5, -17.5, 0.5, -26.5, -16.0, 2.7, 1.3, -14.0],
   [6.5, 13.0, -16.5, 38.0, -20.0, -26.0, 63.3, -20.7],
   [30.0, 18.0, 7.0, 31.3, -11.3, 6.7, -2.7, -12.7],
   [-5.0, 5.0, 37.5, -2.0, 0.7, 11.3, -0.7, 14.0]
  ]
 },

 // Q2 · Table VI (across levels; "isolated" trains on the target level only) and
 //      Table VII (across Level-2 suites). Changes are percentage points as printed.
 "q2": {
  "source": "Paper, Tables VI and VII",
  "levels": {
   "all":        { "iso": { "1": 57.9, "2": 24.1, "3": 0.5 }, "xfer": [
     { "from": 2, "to": 1, "v": 62.0, "d": 4.1 }, { "from": 1, "to": 2, "v": 21.8, "d": -2.3 },
     { "from": 3, "to": 2, "v": 19.7, "d": -4.4 }, { "from": 2, "to": 3, "v": 0.2, "d": -0.3 } ] },
   "rigid":      { "iso": { "1": 57.5, "2": 19.8, "3": 0.3 }, "xfer": [
     { "from": 2, "to": 1, "v": 59.3, "d": 1.8 }, { "from": 1, "to": 2, "v": 20.4, "d": 0.6 },
     { "from": 3, "to": 2, "v": 19.0, "d": -0.8 }, { "from": 2, "to": 3, "v": 0.0, "d": -0.3 } ] },
   "deformable": { "iso": { "1": 58.5, "2": 30.0, "3": 1.0 }, "xfer": [
     { "from": 2, "to": 1, "v": 65.7, "d": 7.2 }, { "from": 1, "to": 2, "v": 23.7, "d": -6.3 },
     { "from": 3, "to": 2, "v": 20.7, "d": -9.3 }, { "from": 2, "to": 3, "v": 0.6, "d": -0.4 } ] }
  },
  // each pair: a ⇄ b. aToB = transfer from a into b (scored on b), bToA = from b into a (scored on a).
  "pairs": [
   { "axis": "Object", "a": "Rigid", "b": "Deformable", "aTask": "HangMug-v1", "bTask": "FoldShirt-v1",
     "isoA": 17.3, "isoB": 16.7, "bToA": { "v": 19.9, "d": 2.6 }, "aToB": { "v": 25.8, "d": 9.2 } },
   { "axis": "End-effector", "a": "Gripper", "b": "Dexterous", "aTask": "DualArmCleanupPotEnv-v1", "bTask": "DualArmOpenBottle-v1",
     "isoA": 16.6, "isoB": 21.0, "bToA": { "v": 22.7, "d": 6.1 }, "aToB": { "v": 28.0, "d": 7.0 } },
   { "axis": "Arms", "a": "Single-arm", "b": "Dual-arm", "aTask": "RollingPin-v1", "bTask": "DualArmPouringTwoCups-v1",
     "isoA": 24.1, "isoB": 12.0, "bToA": { "v": 24.0, "d": -0.1 }, "aToB": { "v": 13.9, "d": 1.9 } }
  ]
 },

 // Q3 · Table VIII: π0.5 trained jointly on all 112 tasks (MT-A) and its change vs. single-task (ST, Table IV).
 //      Per-level means in the text: ST 75.4 / 40.7, MT-A 25.9 / 8.2 / 0.1 / 0.1, overall 33.5 vs 8.6;
 //      one policy per level (MT-L, isolated rows of Table VI): 57.9 / 24.1 / 0.5.
 "q3": {
  "source": "Paper, Tables IV, VI and VIII",
  "mta": [
   [15.5, 44.0, 16.5, 29.0, 12.0, 36.7, 15.3, 37.3],
   [10.0, 18.0, 8.0, 1.0, 4.7, 7.3, 3.3, 12.0],
   [0.0, 0.0, 0.0, 0.0, 0.7, 0.0, 0.0, 0.0],
   [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
  ],
  "mtaVsSt": [
   [-32.5, -51.5, -66.5, -30.5, -58.7, -56.0, -52.7, -53.4],
   [-28.0, -34.5, -33.5, -12.5, -46.0, -68.0, -27.4, -16.7],
   [-11.5, -9.0, -3.5, -6.0, -48.0, -28.0, -17.3, -12.7],
   [-5.0, -1.0, -0.5, -2.0, -2.7, -2.0, -0.7, -1.3]
  ],
  "mtl": { "1": 57.9, "2": 24.1, "3": 0.5 },
  // per-level means, Levels 1..4. ST L1/L2 and every MT-A value are stated in the text; ST L3/L4 are not,
  // so they are the task-weighted means of Table IV (these reproduce the stated 33.5% overall)
  "perLevel": { "st": [75.4, 40.7, 15.7, 2.1], "mta": [25.9, 8.2, 0.1, 0.1] },
  "overall": { "st": 33.5, "mta": 8.6 }
 },

 // Q4 · Fig. 8: π0.5 trained jointly on the 16 Level-2 rigid-body tasks, 100k steps, 50 episodes per task.
 //      Point values read from the figure's vector data; "all" matches the text (21.4 / 27.8 / 29.6 / 31.8).
 "q4": {
  "source": "Paper, Fig. 8",
  "demos": [20, 50, 100, 200],
  "all": [21.4, 27.8, 29.6, 31.8],
  "series": [
   { "key": "SG", "name": "Single-arm gripper", "values": [22.0, 35.5, 31.0, 33.0] },
   { "key": "SX", "name": "Single-arm hand", "values": [31.0, 51.0, 49.5, 53.0] },
   { "key": "DG", "name": "Dual-arm grippers", "values": [20.0, 10.5, 18.5, 12.0] },
   { "key": "DX", "name": "Dual-arm hands", "values": [12.5, 14.0, 19.5, 29.0] }
  ]
 },

 // Q5 · Table IX: flow-matching policy, 20 demonstrations per task; real-world tasks evaluated over 50 trials.
 "q5": {
  "source": "Paper, Table IX and Fig. 7",
  "tasks": [
   { "name": "PickPlacePen", "level": 1, "object": "rigid_body", "id": "PickPlacePen-v1", "real": 100, "sim": 80 },
   { "name": "UnfoldShirt", "level": 1, "object": "deformable", "id": "UnfoldShirt-v1", "real": 80, "sim": 70 },
   { "name": "HangMug", "level": 2, "object": "rigid_body", "id": "HangMug-v1", "real": 40, "sim": 44 },
   { "name": "FoldShirt", "level": 2, "object": "deformable", "id": "FoldShirt-v1", "real": 40, "sim": 44 },
   { "name": "Stack6Blocks", "level": 3, "object": "rigid_body", "id": "Stack6Blocks-v1", "real": 10, "sim": 10 },
   { "name": "BagHanging", "level": 3, "object": "deformable", "id": "BagHanging-v1", "real": 10, "sim": 6 },
   { "name": "PingPongTransport", "level": 4, "object": "rigid_body", "id": "PingPongBallTransport-v1", "real": 0, "sim": 0 },
   { "name": "BuildTent", "level": 4, "object": "deformable", "id": "BuildTent-v1", "real": 0, "sim": 0 }
  ]
 }
};
