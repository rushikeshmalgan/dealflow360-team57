import { CategoryService } from "./application/category-service";
import { ProductService } from "./application/product-service";
import { PrismaCategoryRepository, PrismaProductRepository } from "./infrastructure/prisma-repositories";

export const categoryService = new CategoryService(new PrismaCategoryRepository());
export const productService = new ProductService(new PrismaProductRepository());

export { CategoryService } from "./application/category-service";
export { ProductService } from "./application/product-service";
