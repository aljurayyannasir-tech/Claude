package com.pvptrainer;

/** In-memory toggle state, adjusted at runtime via keybinds. Resets to these
 * defaults on each game restart — no persistence, this mod is intentionally
 * small in scope. */
public final class PvpTrainerConfig {
    public static boolean cooldownOverlayEnabled = true;
    public static boolean visualizerEnabled = true;

    /** Approximate vanilla melee reach in survival; not exposed as an
     * attribute in 1.20.1, so this is a fixed estimate for display only. */
    public static final double REACH_DISTANCE = 3.0;

    private PvpTrainerConfig() {}
}
