export type UserDto = {
  id: string;
  email: string;
  role: "ADMIN" | "SALES_REP" | "MANAGER" | "FINANCE_OPS" | "CUSTOMER";
  customerId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
