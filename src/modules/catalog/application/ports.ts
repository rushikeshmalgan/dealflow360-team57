import type { CreateCategoryInput, UpdateCategoryInput } from "../schemas/category";
import type { CreateProductInput, ProductListQuery, UpdateProductInput } from "../schemas/product";
import type { CategoryDto, ProductDto } from "./types";

export interface CategoryRepository {
  list(): Promise<CategoryDto[]>;
  get(id: string): Promise<CategoryDto | null>;
  create(input: CreateCategoryInput): Promise<CategoryDto>;
  update(id: string, input: UpdateCategoryInput): Promise<CategoryDto | null>;
  delete(id: string): Promise<boolean>;
}

export interface ProductRepository {
  list(query: ProductListQuery): Promise<ProductDto[]>;
  get(id: string): Promise<ProductDto | null>;
  create(input: CreateProductInput): Promise<ProductDto>;
  update(id: string, input: UpdateProductInput): Promise<ProductDto | null>;
  delete(id: string): Promise<boolean>;
}
