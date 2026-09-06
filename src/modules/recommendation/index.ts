import { RecommendationService } from "./application/recommendation-service";
import { PrismaRecommendationRepository } from "./infrastructure/prisma-recommendation-repository";

export const recommendationService = new RecommendationService(new PrismaRecommendationRepository());

export { RecommendationService } from "./application/recommendation-service";
export type { RecommendationRepository } from "./application/ports";
export type {
  RecommendationDto,
  RecommendationOwnership,
  RecommendationStatus,
  ScoringContext,
} from "./application/types";
export { RECOMMENDATION_CONFIG_V1 } from "./domain/config";
export type { RecommendationConfig } from "./domain/config";
export { RECOMMENDATION_TYPES } from "./domain/types";
export type { RecommendationType } from "./domain/types";
