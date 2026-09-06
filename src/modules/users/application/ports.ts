import type { CreateUserInput, UpdateUserInput } from "../schemas/user";
import type { UserDto } from "./types";

export interface UserRepository {
  list(): Promise<UserDto[]>;
  get(id: string): Promise<UserDto | null>;
  create(input: CreateUserInput, passwordHash: string): Promise<UserDto>;
  update(id: string, input: UpdateUserInput, passwordHash?: string): Promise<UserDto | null>;
  delete(id: string): Promise<boolean>;
}
