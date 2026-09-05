import { describe, expect, it } from "vitest";

import { DEAL_HEALTH_EVALUATE_EVENT } from "@/modules/deal-health";
import { MAINTENANCE_PING } from "@/jobs/processors/maintenance";
import { JOB_PROCESSORS, queuesWithProcessors, resolveQueueName } from "@/jobs/registry";

describe("resolveQueueName", () => {
  it("routes maintenance.* events to the maintenance queue", () => {
    expect(resolveQueueName("maintenance.ping")).toBe("maintenance");
  });

  it("routes notification/export/conversion domains to their reserved queues", () => {
    expect(resolveQueueName("notification.email")).toBe("notifications");
    expect(resolveQueueName("export.pdf")).toBe("exports");
    expect(resolveQueueName("conversion.docx")).toBe("conversions");
  });

  it("throws for an unregistered domain so the dispatcher can fail the row instead of retrying forever", () => {
    expect(() => resolveQueueName("unknown.thing")).toThrow(/unknown\.thing/);
  });
});

describe("queuesWithProcessors", () => {
  it("only lists queues that actually have a registered processor", () => {
    // notifications/exports/conversions are reserved for future features - no processor yet.
    expect([...queuesWithProcessors()].sort()).toEqual(["deal-health", "maintenance"]);
  });

  it("registers the maintenance.ping and deal-health.evaluate processors", () => {
    expect(Object.keys(JOB_PROCESSORS)).toContain(MAINTENANCE_PING);
    expect(Object.keys(JOB_PROCESSORS)).toContain(DEAL_HEALTH_EVALUATE_EVENT);
  });
});
