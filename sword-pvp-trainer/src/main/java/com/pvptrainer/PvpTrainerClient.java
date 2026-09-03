package com.pvptrainer;

import com.pvptrainer.hud.CooldownOverlay;
import com.pvptrainer.render.HitboxRenderer;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

public final class PvpTrainerClient implements ClientModInitializer {
    private static KeyBinding toggleCooldownKey;
    private static KeyBinding toggleVisualizerKey;

    @Override
    public void onInitializeClient() {
        toggleCooldownKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.sword-pvp-trainer.toggle_cooldown",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_UNKNOWN,
                "category.sword-pvp-trainer"
        ));

        toggleVisualizerKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.sword-pvp-trainer.toggle_visualizer",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_UNKNOWN,
                "category.sword-pvp-trainer"
        ));

        HudRenderCallback.EVENT.register(CooldownOverlay::render);
        WorldRenderEvents.AFTER_ENTITIES.register(HitboxRenderer::render);

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (toggleCooldownKey.wasPressed()) {
                PvpTrainerConfig.cooldownOverlayEnabled = !PvpTrainerConfig.cooldownOverlayEnabled;
                sendToggleMessage(client, "Cooldown overlay", PvpTrainerConfig.cooldownOverlayEnabled);
            }
            while (toggleVisualizerKey.wasPressed()) {
                PvpTrainerConfig.visualizerEnabled = !PvpTrainerConfig.visualizerEnabled;
                sendToggleMessage(client, "Hitbox/reach visualizer", PvpTrainerConfig.visualizerEnabled);
            }
        });
    }

    private static void sendToggleMessage(MinecraftClient client, String feature, boolean enabled) {
        if (client.player != null) {
            client.player.sendMessage(
                    Text.literal("[PvP Trainer] " + feature + ": " + (enabled ? "ON" : "OFF")),
                    true
            );
        }
    }
}
