package com.pvptrainer.hud;

import com.pvptrainer.PvpTrainerConfig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawableHelper;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.text.Text;

/** Draws the local player's own weapon-cooldown progress as a bar under the
 * crosshair, with a "READY" flash once cooldown hits full charge (the point
 * at which a hit lands with full damage/crit eligibility). Purely a display
 * of information already computable from vanilla's own attack-indicator —
 * it does not read or act on any other player's state. */
public final class CooldownOverlay {
    private static final int BAR_WIDTH = 60;
    private static final int BAR_HEIGHT = 4;

    private CooldownOverlay() {}

    public static void render(MatrixStack matrices, float tickDelta) {
        if (!PvpTrainerConfig.cooldownOverlayEnabled) return;

        MinecraftClient client = MinecraftClient.getInstance();
        PlayerEntity player = client.player;
        if (player == null || client.options.hudHidden) return;

        float cooldown = player.getAttackCooldownProgress(0.0f);

        int screenWidth = client.getWindow().getScaledWidth();
        int screenHeight = client.getWindow().getScaledHeight();
        int x = screenWidth / 2 - BAR_WIDTH / 2;
        int y = screenHeight / 2 + 20;

        DrawableHelper.fill(matrices, x - 1, y - 1, x + BAR_WIDTH + 1, y + BAR_HEIGHT + 1, 0x80000000);

        int filled = Math.round(BAR_WIDTH * cooldown);
        int color = cooldown >= 1.0f ? 0xFF55FF55 : 0xFFFFAA00;
        DrawableHelper.fill(matrices, x, y, x + filled, y + BAR_HEIGHT, color);

        if (cooldown >= 1.0f) {
            Text ready = Text.literal("READY");
            int textWidth = client.textRenderer.getWidth(ready);
            client.textRenderer.draw(matrices, ready, screenWidth / 2f - textWidth / 2f, y + BAR_HEIGHT + 2, 0xFF55FF55);
        }
    }
}
