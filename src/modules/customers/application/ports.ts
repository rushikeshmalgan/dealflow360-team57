import type { CreateCustomerInput, UpdateCustomerInput } from "../schemas/customer";
import type { CreateTierInput, UpdateTierInput } from "../schemas/tier";
import type { CustomerDto, TierDto } from "./types";

export interface CustomerRepository {
  list(): Promise<CustomerDto[]>;
  get(id: string): Promise<CustomerDto | null>;
  create(input: CreateCustomerInput): Promise<CustomerDto>;
  update(id: string, input: UpdateCustomerInput): Promise<CustomerDto | null>;
  delete(id: string): Promise<boolean>;
}

export interface TierRepository {
  list(): Promise<TierDto[]>;
  get(id: string): Promise<TierDto | null>;
  create(input: CreateTierInput): Promise<TierDto>;
  update(id: string, input: UpdateTierInput): Promise<TierDto | null>;
  delete(id: string): Promise<boolean>;
}
