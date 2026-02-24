/**
 * Heat-Diffusion Simulation
 * =========================
 *
 * Contract:
 *   - Has access to globals: GRID_W, GRID_H, temp, setTemp, getTemp
 *   - Must export a function `updateGrid()` that is called once per frame.
 *
 * Replace this file (or create alternatives with the same contract) to
 * swap in different simulation behaviours.
 *
 * ─── Algorithm overview ───────────────────────────────────────────────
 *
 * Each frame we iterate over every cell in the 1000×1000 grid and look
 * at its four cardinal neighbours (top, bottom, left, right).
 * Out-of-bounds neighbours are simply ignored.
 *
 * For every valid neighbour we compute the signed temperature difference:
 *
 *     diff = neighbour_temp − cell_temp
 *
 *   • diff > 0  →  neighbour is hotter  →  heat flows IN to the cell
 *   • diff < 0  →  neighbour is cooler  →  heat flows OUT of the cell
 *   • diff = 0  →  thermal equilibrium  →  no transfer
 *
 * The raw transfer amount is:
 *
 *     raw = diff × FLOW_RATE            (FLOW_RATE ∈ (0, 1])
 *
 * To keep values as integers we round to the nearest integer:
 *
 *     transfer = Math.round(raw)
 *
 * ─── Equilibrium-safety clamp ─────────────────────────────────────────
 *
 * A transfer must never *overshoot* equilibrium, i.e. it must never
 * make the difference between the cell and that neighbour larger than
 * it was, or flip its sign.
 *
 * Because we use a double-buffer (read from a snapshot, write to the
 * live array), both the cell and its neighbour independently compute a
 * transfer for the same pair.  If cell A transfers +t from neighbour B,
 * then when B is processed it computes −t toward A.  The effective new
 * difference becomes:
 *
 *     new_diff = (B − t) − (A + t) = diff − 2t
 *
 * To prevent sign-reversal:  |t| ≤ |diff| / 2
 *
 * We clamp with  maxTransfer = trunc(diff / 2)  (truncation toward
 * zero), then:
 *
 *     if diff > 0:  transfer = min(transfer, maxTransfer)
 *     if diff < 0:  transfer = max(transfer, maxTransfer)
 *
 * ─── Accumulation & final clamp ───────────────────────────────────────
 *
 * We sum the clamped transfers from all valid neighbours into a delta
 * for the cell, then write:
 *
 *     newTemp = clamp(oldTemp + delta, 0, 100)
 *
 * This clamp keeps every cell inside the legal [0, 100] range.
 *
 * ─── Double-buffering ─────────────────────────────────────────────────
 *
 * We read temperatures from a *snapshot* taken at the start of the
 * frame (`oldTemp`) and write results directly into the live `temp`
 * array.  This prevents the order in which cells are visited from
 * affecting the outcome (no directional bias).
 */

/**
 * FLOW_RATE controls how quickly temperature equalises between
 * neighbouring cells each frame.
 *   0.01  →  very slow, gradual diffusion
 *   0.25  →  moderate (default)
 *   1.00  →  maximum speed, reaches equilibrium fast
 */
const FLOW_RATE = 0.25;

// Reusable snapshot buffer (allocated once on first use).
let oldTemp = null;

// Neighbour offsets: [dx, dy]
const NEIGHBOURS = [
  [0, -1], // top
  [0, 1], // bottom
  [-1, 0], // left
  [1, 0], // right
];

/**
 * Called once per frame by the game loop.
 * Performs one iteration of heat diffusion across the entire grid.
 */
function updateGrid() {
  // 1. Snapshot the current state so reads are unaffected by writes.
  if (!oldTemp || oldTemp.length !== GRID_W * GRID_H) {
    oldTemp = new Uint8Array(GRID_W * GRID_H);
  }
  oldTemp.set(temp);

  // 2. Iterate every cell.
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const idx = y * GRID_W + x;
      const cellTemp = oldTemp[idx];

      // Accumulate net heat transfer from all valid neighbours.
      let delta = 0;

      for (let n = 0; n < 4; n++) {
        const nx = x + NEIGHBOURS[n][0];
        const ny = y + NEIGHBOURS[n][1];

        // Skip out-of-bounds neighbours.
        if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;

        const neighbourTemp = oldTemp[ny * GRID_W + nx];
        const diff = neighbourTemp - cellTemp; // signed difference

        // No transfer needed when temperatures are equal.
        if (diff === 0) continue;

        // Raw transfer scaled by flow rate, rounded to integer.
        let transfer = Math.round(diff * FLOW_RATE);

        // ── Equilibrium-safety clamp ──
        // Maximum safe transfer is trunc(diff / 2) so that neither
        // this cell nor the neighbour ends up on the wrong side of
        // the original difference after the symmetric double-buffer
        // update.
        const maxTransfer = Math.trunc(diff / 2);

        if (diff > 0) {
          // Heat flowing in — transfer must be positive but ≤ max.
          transfer = Math.max(0, Math.min(transfer, maxTransfer));
        } else {
          // Heat flowing out — transfer must be negative but ≥ max.
          transfer = Math.min(0, Math.max(transfer, maxTransfer));
        }

        delta += transfer;
      }

      // 3. Write the updated temperature, clamped to [0, 100].
      temp[idx] = Math.max(0, Math.min(100, cellTemp + delta));
    }
  }
}
