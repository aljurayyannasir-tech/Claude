// Reward shaping used for both dataset logging and bandit updates.
// Kept simple and legible on purpose: this is a hand-shaped survival/progress
// reward, not a learned reward model.
const MILESTONE_REWARD = 5;
const CITY_STRUCTURE_REWARD = 8;
const HARVEST_REWARD = 1;
const DEATH_PENALTY = -50;
const ACTION_FAILURE_PENALTY = -2;
const TICK_SURVIVAL_REWARD = 0.1;

export function computeReward({
  died = false,
  actionSucceeded = true,
  milestoneReached = null,
  cityStructureCompleted = false,
  cropsHarvested = 0,
  healthDelta = 0,
  foodDelta = 0,
} = {}) {
  if (died) return DEATH_PENALTY;

  let reward = TICK_SURVIVAL_REWARD;
  if (!actionSucceeded) reward += ACTION_FAILURE_PENALTY;
  if (milestoneReached) reward += MILESTONE_REWARD;
  if (cityStructureCompleted) reward += CITY_STRUCTURE_REWARD;
  reward += cropsHarvested * HARVEST_REWARD;
  reward += healthDelta * 0.5;
  reward += foodDelta * 0.25;
  return reward;
}
