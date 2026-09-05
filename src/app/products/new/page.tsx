import { ProductForm } from "@/components/product-form";
import { EMPTY_PRODUCT } from "@/lib/products";

export default function NewProductPage() {
  return <ProductForm mode="create" initialProduct={EMPTY_PRODUCT} />;
}
