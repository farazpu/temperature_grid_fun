/**
 * Heat-Diffusion Simulation (Alternative)
 * ======================================
 *
 * Contract:
 *   - Has access to globals: GRID_W, GRID_H, temp, setTemp, getTemp
 *   - Must provide a global function `updateGrid()` called once per frame.
 *
 * Technique used here:
 *   Discrete Laplacian diffusion (finite-difference heat equation)
 *
 * Instead of computing per-neighbour transfers and clamping each transfer,
 * we treat each cell as evolving by the local curvature of temperature:
 *
 *   new = old + k * (N + S + E + W - 4 * old)
 *
 * where k is DIFFUSIVITY (0 < k <= 0.25 for stability on a 4-neighbour grid).
 *
 * Boundary condition:
 *   "Insulated" edges (zero-flux): when a neighbour is out-of-bounds,
 *   we reuse the cell's own value for that direction.
 */

/**
 * Diffusion strength per frame.
 * Lower values diffuse slower; higher values diffuse faster.
 * Keep <= 0.25 for stable explicit integration on this stencil.
 */
const DIFFUSIVITY = 0.2;

// Persistent floating-point state so sub-degree heat can accumulate.
let stateA = null;
let stateB = null;

function ensureBuffers(size) {
  if (!stateA || stateA.length !== size) {
    stateA = new Float32Array(size);
    stateB = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      stateA[i] = temp[i];
      stateB[i] = temp[i];
    }
  }
}

/**
 * Called once per frame by the game loop.
 * Performs one diffusion step over the whole grid.
 */
function updateGrid() {
  const size = GRID_W * GRID_H;

  ensureBuffers(size);

  // Sync user edits (painting / random fill / resize resets) into float state.
  // If the visible integer value differs from our rounded state, treat it as an
  // external write and adopt it as the authoritative value.
  for (let i = 0; i < size; i++) {
    if (temp[i] !== Math.round(stateA[i])) {
      stateA[i] = temp[i];
    }
  }

  for (let y = 0; y < GRID_H; y++) {
    const row = y * GRID_W;
    const rowUp = y > 0 ? row - GRID_W : row;
    const rowDown = y < GRID_H - 1 ? row + GRID_W : row;

    for (let x = 0; x < GRID_W; x++) {
      const idx = row + x;
      const center = stateA[idx];

      const up = stateA[rowUp + x];
      const down = stateA[rowDown + x];
      const left = stateA[row + (x > 0 ? x - 1 : x)];
      const right = stateA[row + (x < GRID_W - 1 ? x + 1 : x)];

      const laplacian = up + down + left + right - 4 * center;
      const next = center + DIFFUSIVITY * laplacian;
      stateB[idx] = Math.max(0, Math.min(100, next));
    }
  }

  // Publish integer temperatures for rendering, then swap buffers.
  for (let i = 0; i < size; i++) {
    temp[i] = Math.max(0, Math.min(100, Math.round(stateB[i])));
  }

  const swap = stateA;
  stateA = stateB;
  stateB = swap;
}
