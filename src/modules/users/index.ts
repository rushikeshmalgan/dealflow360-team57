import { UserService } from "./application/user-service";
import { PrismaUserRepository } from "./infrastructure/prisma-user-repository";

export const userService = new UserService(new PrismaUserRepository());

export { UserService } from "./application/user-service";
export type { UserDto } from "./application/types";
