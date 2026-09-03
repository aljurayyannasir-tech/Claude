package com.pvptrainer.hud;

import com.pvptrainer.PvpTrainerConfig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.text.Text;

/** Draws the local player's own weapon-cooldown progress as a bar under the
 * crosshair, with a "READY" flash once cooldown hits full charge (the point
 * at which a hit lands with full damage/crit eligibility). Purely a display
 * of information already computable from vanilla's own attack-indicator —
 * it does not read or act on any other player's state.
 *
 * Uses {@link DrawContext}, which replaced the old MatrixStack/
 * DrawableHelper HUD API starting around 1.20.2 — correct for 1.21.11. */
public final class CooldownOverlay {
    private static final int BAR_WIDTH = 60;
    private static final int BAR_HEIGHT = 4;

    private CooldownOverlay() {}

    public static void render(DrawContext context, RenderTickCounter tickCounter) {
        if (!PvpTrainerConfig.cooldownOverlayEnabled) return;

        MinecraftClient client = MinecraftClient.getInstance();
        PlayerEntity player = client.player;
        if (player == null || client.options.hudHidden) return;

        float cooldown = player.getAttackCooldownProgress(0.0f);

        int screenWidth = client.getWindow().getScaledWidth();
        int screenHeight = client.getWindow().getScaledHeight();
        int x = screenWidth / 2 - BAR_WIDTH / 2;
        int y = screenHeight / 2 + 20;

        context.fill(x - 1, y - 1, x + BAR_WIDTH + 1, y + BAR_HEIGHT + 1, 0x80000000);

        int filled = Math.round(BAR_WIDTH * cooldown);
        int color = cooldown >= 1.0f ? 0xFF55FF55 : 0xFFFFAA00;
        context.fill(x, y, x + filled, y + BAR_HEIGHT, color);

        if (cooldown >= 1.0f) {
            Text ready = Text.literal("READY");
            int textWidth = client.textRenderer.getWidth(ready);
            context.drawText(client.textRenderer, ready, screenWidth / 2 - textWidth / 2, y + BAR_HEIGHT + 2, 0xFF55FF55, true);
        }
    }
}
