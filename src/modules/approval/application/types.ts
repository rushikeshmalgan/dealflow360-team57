export type ApprovalStepDto = {
  id: string;
  stepOrder: number;
  role: "MANAGER" | "FINANCE_OPS";
};

export type ApprovalRuleDto = {
  id: string;
  riskBand: "LOW" | "MEDIUM" | "HIGH";
  isActive: boolean;
  steps: ApprovalStepDto[];
  createdAt: string;
  updatedAt: string;
};
