package com.pvptrainer.render;

import com.pvptrainer.PvpTrainerConfig;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.WorldRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Vec3d;

/**
 * Draws entity hitbox outlines and a reach-range ring around the player, for
 * practicing hit timing/spacing against a friend or a dummy in singleplayer.
 *
 * Deliberately restricted to singleplayer/LAN worlds ({@link
 * MinecraftClient#isInSingleplayer()}): it never renders on a remote
 * multiplayer server, since most servers' rules treat hitbox reveals as
 * disallowed client-side assistance even though this mod does not automate
 * or aim anything.
 */
public final class HitboxRenderer {
    private static final double DETECTION_RADIUS = 10.0;
    private static final int CIRCLE_SEGMENTS = 48;

    private HitboxRenderer() {}

    public static void render(WorldRenderContext context) {
        if (!PvpTrainerConfig.visualizerEnabled) return;

        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null || client.world == null) return;
        if (!client.isInSingleplayer()) return;

        PlayerEntity player = client.player;
        Vec3d cameraPos = context.camera().getPos();
        MatrixStack matrices = context.matrixStack();
        VertexConsumer lines = context.consumers().getBuffer(RenderLayer.getLines());

        Box searchBox = player.getBoundingBox().expand(DETECTION_RADIUS);
        for (LivingEntity entity : client.world.getEntitiesByClass(
                LivingEntity.class, searchBox, e -> e != player && e.isAlive())) {
            boolean inReach = player.distanceTo(entity) <= PvpTrainerConfig.REACH_DISTANCE;
            float g = inReach ? 0.15f : 0.85f;
            float b = inReach ? 0.15f : 0.15f;

            Box box = entity.getBoundingBox().offset(-cameraPos.x, -cameraPos.y, -cameraPos.z);
            WorldRenderer.drawBox(matrices, lines, box, 1.0f, g, b, 1.0f);
        }

        drawReachRing(matrices, lines, player, cameraPos);
    }

    private static void drawReachRing(MatrixStack matrices, VertexConsumer lines, PlayerEntity player, Vec3d cameraPos) {
        Vec3d center = player.getPos()
                .add(0, player.getStandingEyeHeight() * 0.5, 0)
                .subtract(cameraPos);

        var entry = matrices.peek();
        var positionMatrix = entry.getPositionMatrix();
        var normalMatrix = entry.getNormalMatrix();

        double radius = PvpTrainerConfig.REACH_DISTANCE;
        for (int i = 0; i < CIRCLE_SEGMENTS; i++) {
            double angle1 = 2 * Math.PI * i / CIRCLE_SEGMENTS;
            double angle2 = 2 * Math.PI * (i + 1) / CIRCLE_SEGMENTS;

            float x1 = (float) (center.x + radius * Math.cos(angle1));
            float z1 = (float) (center.z + radius * Math.sin(angle1));
            float x2 = (float) (center.x + radius * Math.cos(angle2));
            float z2 = (float) (center.z + radius * Math.sin(angle2));
            float y = (float) center.y;

            lines.vertex(positionMatrix, x1, y, z1).color(0.2f, 0.6f, 1.0f, 0.8f).normal(normalMatrix, 0, 1, 0).next();
            lines.vertex(positionMatrix, x2, y, z2).color(0.2f, 0.6f, 1.0f, 0.8f).normal(normalMatrix, 0, 1, 0).next();
        }
    }
}
